"""SAM3 / SAM3.1 inference backend for Mask Editor+."""
import io
import base64
import logging
import pathlib

import numpy as np
from PIL import Image

log = logging.getLogger(__name__)

_model = None
_processor = None
_loaded_ckpt = None


def _find_sam3_dir() -> pathlib.Path:
    try:
        import folder_paths
        return pathlib.Path(folder_paths.models_dir) / "sam3"
    except Exception:
        return pathlib.Path(__file__).resolve().parents[3] / "models" / "sam3"


def _is_torchscript_archive(path: str) -> bool:
    """
    SAM3 state_dict として使えないファイルを検出する。
    - TorchScript v1: constants.pkl + .py ファイルを持つ zip
    - torch.jit.save() 新形式: producer_info.json を持つ zip（data.pkl がない）
    .safetensors は zip ではないため常に False を返す（有効と判定）。
    """
    import zipfile
    try:
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
            if any(n.endswith("/data.pkl") or n == "archive/data.pkl" for n in names):
                return False
            if "constants.pkl" in names:
                return True
            if any("producer_info.json" in n for n in names):
                return True
            return False
    except Exception:
        return False


def list_models() -> list:
    """
    models/sam3/ にある有効な SAM3 チェックポイントのリストを返す。
    ファイル名に "sam3" を含むもの（大文字小文字不問）のみ対象。
    TorchScript/JIT 形式は除外する。
    戻り値: [{"name": filename, "path": fullpath}, ...]
    """
    try:
        sam3_dir = _find_sam3_dir()
        if not sam3_dir.exists():
            return []

        results = []
        for suffix in (".pt", ".pth", ".safetensors"):
            for p in sorted(sam3_dir.glob(f"*{suffix}"), key=lambda x: x.name.lower()):
                if "sam3" not in p.name.lower():
                    continue
                if _is_torchscript_archive(str(p)):
                    log.warning("Skipping %s — TorchScript/JIT format.", p.name)
                    continue
                results.append({"name": p.name})
        log.debug("list_models() found %d model(s)", len(results))
        return results
    except Exception as e:
        log.warning("list_models() failed: %s", e)
        return []


def find_checkpoint(model_name: str | None = None) -> str | None:
    """
    models/sam3/ から有効な SAM3 state_dict を探す。
    model_name が指定された場合はそのファイルのみを確認する。
    指定なしの場合は自動選択（sam3.pt 優先）。
    """
    sam3_dir = _find_sam3_dir()
    if not sam3_dir.exists():
        return None

    if model_name:
        p = sam3_dir / model_name
        if p.exists() and not _is_torchscript_archive(str(p)):
            log.info("Using checkpoint: %s", p.name)
            return str(p)
        log.warning("Requested checkpoint not found or invalid: %s", model_name)
        return None

    candidates: list[pathlib.Path] = []
    for suffix in (".pt", ".pth", ".safetensors"):
        candidates.extend(sam3_dir.glob(f"*{suffix}"))

    def priority(p: pathlib.Path):
        name = p.name.lower()
        has_sam3 = "sam3" in name
        return (0 if has_sam3 else 1, len(name), name)

    for p in sorted(candidates, key=priority):
        if _is_torchscript_archive(str(p)):
            log.warning(
                "Skipping %s — TorchScript/JIT format, not a SAM3 state_dict.", p.name
            )
            continue
        log.info("Using checkpoint: %s", p.name)
        return str(p)
    return None


_BPE_FILENAME = "bpe_simple_vocab_16e6.txt.gz"
_BPE_URL      = "https://openaipublic.azureedge.net/clip/bpe_simple_vocab_16e6.txt.gz"


def _find_bpe() -> str | None:
    try:
        import sam3 as _sam3_pkg
        pkg_dir    = pathlib.Path(_sam3_pkg.__file__).parent
        assets_dir = pkg_dir.parent / "assets"
        bpe_path   = assets_dir / _BPE_FILENAME

        if bpe_path.exists():
            return str(bpe_path)

        assets_dir.mkdir(parents=True, exist_ok=True)
        log.info("BPE vocab not found. Downloading to %s …", bpe_path)
        import urllib.request
        urllib.request.urlretrieve(_BPE_URL, str(bpe_path))
        log.info("BPE vocab downloaded OK (%d bytes)", bpe_path.stat().st_size)
        return str(bpe_path)

    except Exception as e:
        log.warning("BPE find/download failed: %s", e)
        return None


def _load_safetensors_checkpoint(model, path: str) -> None:
    """
    .safetensors ファイルからウェイトを読み込む。

    safetensors ライブラリは C64（complex64）dtype を正常に扱えない場合があるため、
    ヘッダー JSON を手動パースしてバイト列を直接 PyTorch テンソルに変換する。
    これにより SAM3 の freqs_cis（RoPE 位置エンコーディング）など複素数テンソルも
    正しくロードできる。FP16 safetensors（_fp16 バリアント）も copy_() が自動変換するため
    そのまま load_state_dict に渡せる。
    """
    import struct
    import json
    import torch

    _DTYPE_MAP = {
        "F32":  torch.float32,
        "F16":  torch.float16,
        "BF16": torch.bfloat16,
        "F64":  torch.float64,
        "I64":  torch.int64,
        "I32":  torch.int32,
        "I16":  torch.int16,
        "I8":   torch.int8,
        "U8":   torch.uint8,
        "BOOL": torch.bool,
    }

    with open(path, "rb") as f:
        # 最初の 8 バイト: ヘッダー JSON のバイトサイズ（little-endian uint64）
        n = struct.unpack("<Q", f.read(8))[0]
        header = json.loads(f.read(n).decode("utf-8"))
        data_start = 8 + n  # テンソルデータの先頭ファイルオフセット

        ckpt: dict = {}
        for tensor_name, info in header.items():
            if tensor_name == "__metadata__":
                continue

            dtype_str           = info["dtype"]
            shape               = info["shape"]
            off_start, off_end  = info["data_offsets"]

            f.seek(data_start + off_start)
            raw = bytearray(f.read(off_end - off_start))

            if dtype_str in ("C64", "C128"):
                # 複素数テンソル: float ペア（実部・虚部）として読み込み view_as_complex へ
                base_dtype = torch.float32 if dtype_str == "C64" else torch.float64
                flat = torch.frombuffer(raw, dtype=base_dtype)
                ckpt[tensor_name] = torch.view_as_complex(
                    flat.reshape(*shape, 2).contiguous()
                ).clone()
            else:
                torch_dtype = _DTYPE_MAP.get(dtype_str)
                if torch_dtype is None:
                    log.warning("Unknown dtype '%s' for '%s', skipping.", dtype_str, tensor_name)
                    continue
                ckpt[tensor_name] = torch.frombuffer(
                    raw, dtype=torch_dtype
                ).reshape(shape).clone()

    # "detector." プレフィックスが含まれている場合はフィルタリング（.pt と同じ構造）
    sam3_image_ckpt = {
        k.replace("detector.", ""): v for k, v in ckpt.items() if "detector" in k
    }
    if not sam3_image_ckpt:
        sam3_image_ckpt = ckpt

    missing_keys, _ = model.load_state_dict(sam3_image_ckpt, strict=False)
    if missing_keys:
        log.warning("safetensors load: %d missing keys (may be normal for partial ckpt)", len(missing_keys))
    log.info("safetensors checkpoint loaded OK from %s", path)


def _is_gated_repo_error(e: Exception) -> bool:
    """huggingface_hub の GatedRepoError または 401/403 HTTP エラーを判定する。"""
    if type(e).__name__ in ("GatedRepoError", "RepositoryNotFoundError"):
        return True
    msg = str(e).lower()
    return "gated" in msg or "401" in msg or "403" in msg or "forbidden" in msg or "unauthorized" in msg


def load_model(checkpoint_path: str | None = None, model_name: str | None = None, device: str | None = None) -> None:
    global _model, _processor, _loaded_ckpt

    # model_name が指定された場合はそのファイルを使用
    if checkpoint_path is None and model_name:
        checkpoint_path = find_checkpoint(model_name)

    if checkpoint_path is None:
        checkpoint_path = find_checkpoint()

    load_from_hf = checkpoint_path is None
    is_safetensors = checkpoint_path is not None and checkpoint_path.endswith(".safetensors")

    if load_from_hf:
        log.info(
            "No valid SAM3 checkpoint found in models/sam3/. "
            "Attempting HuggingFace download (facebook/sam3)…"
        )

    if _model is not None and checkpoint_path == _loaded_ckpt and not load_from_hf:
        return

    import torch
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    from sam3.model_builder import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor

    bpe_path = _find_bpe()
    log.info("Loading SAM3 from %s (device=%s)", checkpoint_path, device)

    # PyTorch 2.6+ weights_only デフォルト変更への対応パッチ
    # weights_only=True (安全) を優先し、失敗時のみ False にフォールバックする
    _orig_load = torch.load
    def _patched_load(*a, **kw):
        if "weights_only" not in kw:
            try:
                return _orig_load(*a, **{**kw, "weights_only": True})
            except Exception:
                log.warning("torch.load weights_only=True failed; retrying with weights_only=False (pickle)")
                return _orig_load(*a, **{**kw, "weights_only": False})
        return _orig_load(*a, **kw)

    try:
        torch.load = _patched_load

        if is_safetensors:
            # safetensors の場合: アーキテクチャのみ構築してから別途ウェイトをロード
            kwargs: dict = {"load_from_HF": False, "checkpoint_path": None}
            if bpe_path:
                kwargs["bpe_path"] = bpe_path
            model = build_sam3_image_model(**kwargs)
        else:
            kwargs: dict = {
                "checkpoint_path": checkpoint_path,
                "load_from_HF":    load_from_hf,
            }
            if bpe_path:
                kwargs["bpe_path"] = bpe_path
            try:
                model = build_sam3_image_model(**kwargs)
            except Exception as e:
                if load_from_hf and _is_gated_repo_error(e):
                    raise RuntimeError(
                        "SAM3 モデルはアクセス申請が必要な Gated model です。\n"
                        "1. https://huggingface.co/facebook/sam3 でライセンスに同意\n"
                        "2. huggingface-cli login でトークンを設定してください。\n"
                        "   または HF_TOKEN 環境変数にアクセストークンを設定してください。"
                    ) from e
                raise
    finally:
        torch.load = _orig_load

    if is_safetensors:
        _load_safetensors_checkpoint(model, checkpoint_path)

    model = model.to(device)
    model.eval()

    _model = model
    _processor = Sam3Processor(model)
    _loaded_ckpt = checkpoint_path
    log.info("SAM3 loaded OK")


def run_inference(image_pil: Image.Image, prompt: str, max_masks: int = 9, model_name: str | None = None) -> list:
    """
    Returns:
        [{"mask_b64": "data:image/png;base64,...", "score": float, "area": int}, ...]
        sorted by score descending.
    """
    # model_name が指定されていて現在と異なる場合はリロード
    if model_name:
        target_ckpt = find_checkpoint(model_name)
        if _model is None or (target_ckpt is not None and target_ckpt != _loaded_ckpt):
            load_model(checkpoint_path=target_ckpt)
    elif _model is None:
        load_model()

    if _processor is None:
        load_model()

    inference_state = _processor.set_image(image_pil)
    output = _processor.set_text_prompt(state=inference_state, prompt=prompt)

    raw_masks = output["masks"]
    scores    = output.get("scores", [1.0] * len(raw_masks))

    results = []
    for mask, score in zip(raw_masks, scores):
        if len(results) >= max_masks:
            break

        mask_np = mask.cpu().numpy() if hasattr(mask, "cpu") else np.asarray(mask)
        if mask_np.ndim == 3:
            mask_np = mask_np[0]

        mask_u8 = (mask_np > 0.5).astype(np.uint8) * 255
        area = int(mask_u8.sum()) // 255

        buf = io.BytesIO()
        Image.fromarray(mask_u8, "L").save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()

        results.append({
            "mask_b64": f"data:image/png;base64,{b64}",
            "score":    float(score),
            "area":     area,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def get_status() -> dict:
    models = list_models()  # try/except 済み、常にリストを返す

    try:
        ckpt = find_checkpoint()
    except Exception as e:
        log.warning("find_checkpoint() failed: %s", e)
        ckpt = None

    try:
        sam3_dir = _find_sam3_dir()
        jit_files = []
        if sam3_dir.exists():
            for suffix in (".pt", ".pth", ".safetensors"):
                for p in sam3_dir.glob(f"*{suffix}"):
                    if _is_torchscript_archive(str(p)):
                        jit_files.append(p.name)
    except Exception as e:
        log.warning("jit_files scan failed: %s", e)
        jit_files = []

    log.info(
        "get_status(): loaded=%s models=%d ckpt_found=%s",
        _model is not None, len(models), ckpt is not None or len(models) > 0
    )
    def _basename(p):
        return pathlib.Path(p).name if p else None

    return {
        "loaded":     _model is not None,
        "model_path": _basename(_loaded_ckpt),
        "ckpt_found": ckpt is not None or len(models) > 0,
        "ckpt_path":  _basename(ckpt),
        "models":     models,
        "jit_files":  jit_files,
    }
