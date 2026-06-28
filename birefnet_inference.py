"""
BiRefNet background removal — ComfyUI ネイティブ実装を使用。
comfy.bg_removal_model / comfy.background_removal.birefnet を利用するため
transformers や HuggingFace Hub へのアクセスは不要。
"""
import io
import base64
import logging
import pathlib

import numpy as np
from PIL import Image

log = logging.getLogger(__name__)

_bg_model = None
_loaded_path = None


# ---------------------------------------------------------------------------
# Model discovery
# ---------------------------------------------------------------------------

def _find_model_path() -> pathlib.Path | None:
    """models/background_removal/ 内の BiRefNet safetensors を返す。"""
    try:
        import folder_paths
        bg_dir = pathlib.Path(folder_paths.models_dir) / "background_removal"
    except Exception:
        bg_dir = pathlib.Path(__file__).resolve().parents[3] / "models" / "background_removal"

    if not bg_dir.exists():
        return None

    # 既知のファイル名を優先
    for name in (
        "birefnet.safetensors",
        "BiRefNet.safetensors",
        "BiRefNet-general.safetensors",
        "birefnet-general.safetensors",
    ):
        p = bg_dir / name
        if p.exists():
            return p

    # その他の .safetensors も試みる
    for p in sorted(bg_dir.glob("*.safetensors")):
        return p

    return None


# ---------------------------------------------------------------------------
# Status / public API
# ---------------------------------------------------------------------------

def get_status() -> dict:
    path = _find_model_path()
    return {
        "loaded":      _bg_model is not None,
        "model_found": path is not None,
        "model_path":  path.name if path else None,
    }


def load_model() -> None:
    global _bg_model, _loaded_path

    path = _find_model_path()
    if path is None:
        raise FileNotFoundError(
            "BiRefNet model not found in models/background_removal/. "
            "Download birefnet.safetensors from zhengpeng7/BiRefNet on HuggingFace "
            "and place it in ComfyUI/models/background_removal/"
        )

    log.info("BiRefNet: loading from %s", path)
    from comfy.bg_removal_model import load as _comfy_load
    model = _comfy_load(str(path))
    if model is None:
        raise RuntimeError(
            f"BiRefNet モデルファイルが無効です: {path.name}\n"
            "「bb.layers.1.blocks.0.attn.relative_position_index」キーが存在しないため "
            "BiRefNet として認識されませんでした。"
        )

    _bg_model = model
    _loaded_path = str(path)
    log.info("BiRefNet loaded OK from %s", path.name)


def run_inference(image_pil: Image.Image) -> str:
    """
    BiRefNet で背景除去を実行する。

    戻り値: 前景マスクの data-URL PNG 文字列
        白 (255) = 前景（被写体）
        黒 (0)   = 背景
    """
    global _bg_model

    if _bg_model is None:
        load_model()

    import torch

    # PIL → ComfyUI テンソル形式 (1, H, W, 3) float32 [0, 1]
    rgb = np.array(image_pil.convert("RGB")).astype(np.float32) / 255.0
    image_tensor = torch.from_numpy(rgb).unsqueeze(0)  # (1, H, W, 3)

    # comfy.bg_removal_model.encode_image が前処理・推論・後処理を一括で行う。
    # 戻り値: (B, H, W) float32 マスク [0, 1]  ← squeeze(1) 済みで (B,1,H,W) ではない
    mask_tensor = _bg_model.encode_image(image_tensor)

    mask_np = mask_tensor[0].cpu().float().detach().numpy()
    mask_u8 = (mask_np * 255).clip(0, 255).astype(np.uint8)

    buf = io.BytesIO()
    Image.fromarray(mask_u8, "L").save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"
