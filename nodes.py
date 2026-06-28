import json
import base64
import io
import numpy as np
import torch
from PIL import Image, ImageFilter


def _pil_to_tensor(pil_image):
    arr = np.array(pil_image.convert("RGB")).astype(np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def _pil_to_mask_tensor(pil_image):
    arr = np.array(pil_image.convert("L")).astype(np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def _base64_to_pil(b64_str):
    if b64_str.startswith("data:"):
        b64_str = b64_str.split(",", 1)[1]
    raw = base64.b64decode(b64_str)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def _b64_to_tensor(b64_str):
    """data URL → (1,H,W,C) float32 tensor"""
    if b64_str.startswith("data:"):
        b64_str = b64_str.split(",", 1)[1]
    raw = base64.b64decode(b64_str)
    pil = Image.open(io.BytesIO(raw)).convert("RGB")
    return _pil_to_tensor(pil)


def _composite_layers(layers_data, width, height):
    """
    layer_data JSON のレイヤーリストを合成して最終マスク PIL 'L' を返す。
    各レイヤー: {visible, opacity, operation, imageData (base64 PNG)}
    """
    result = Image.new("L", (width, height), 0)

    for layer in reversed(layers_data):
        if not layer.get("visible", True):
            continue
        image_data = layer.get("imageData", "")
        if not image_data:
            continue

        opacity = float(layer.get("opacity", 1.0))
        operation = layer.get("operation", "add")

        layer_pil = _base64_to_pil(image_data).resize((width, height), Image.LANCZOS)
        layer_mask = layer_pil.split()[3]  # A channel

        if opacity < 1.0:
            arr = np.array(layer_mask).astype(np.float32) * opacity
            layer_mask = Image.fromarray(arr.clip(0, 255).astype(np.uint8), "L")

        if operation == "subtract":
            result_arr = np.array(result).astype(np.int32)
            layer_arr = np.array(layer_mask).astype(np.int32)
            new_arr = (result_arr - layer_arr).clip(0, 255).astype(np.uint8)
            result = Image.fromarray(new_arr, "L")
        else:
            result_arr = np.array(result).astype(np.uint8)
            layer_arr = np.array(layer_mask).astype(np.uint8)
            new_arr = np.maximum(result_arr, layer_arr)
            result = Image.fromarray(new_arr, "L")

    return result


class MaskEditorOne:
    """
    モーダルエディタでマスクを作成・編集するノード。
    Edit Mask ボタンでブラウザ内エディタを開き、
    レイヤーで管理したマスクを IMAGE と MASK として出力する。
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "invert_mask": ("BOOLEAN", {"default": False, "label_on": "inverted", "label_off": "normal"}),
            },
            "optional": {
                "layer_data": ("STRING", {"default": "{}"}),
                "blur_radius": ("INT", {"default": 0, "min": 0, "max": 200, "step": 1}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "MASK", "IMAGE")
    RETURN_NAMES = ("image", "mask", "inverted_mask", "mask_image")
    FUNCTION = "process"
    CATEGORY = "image/masking"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # bg_image_b64 はサーバーキャッシュ経由で変わるため ComfyUI は自動検出できない。
        # そのハッシュを返すことで変更時に再実行させる。
        try:
            import hashlib
            from . import server as _srv
            _node_id = str(kwargs.get("unique_id") or "unknown")
            bg_b64 = _srv._node_cache.get(_node_id, {}).get("bg_image_b64") or ""
            if bg_b64:
                return hashlib.md5(bg_b64[:512].encode()).hexdigest()
        except Exception:
            pass
        return ""

    def process(self, invert_mask=False, layer_data="{}", unique_id=None, blur_radius=0):
        # BG ボタンで保存した bg_image_b64 をサーバーキャッシュから取得
        bg_image = None
        try:
            from . import server as _srv
            _node_id = str(unique_id) if unique_id is not None else "unknown"
            cache = _srv._node_cache.setdefault(_node_id, {})
            bg_b64 = cache.get("bg_image_b64")
            if bg_b64:
                bg_image = _b64_to_tensor(bg_b64)
        except Exception:
            pass

        default_w, default_h = 512, 512

        if bg_image is not None:
            _, h, w, _ = bg_image.shape
        else:
            h, w = default_h, default_w

        try:
            data = json.loads(layer_data) if layer_data.strip() else {}
        except (json.JSONDecodeError, ValueError):
            data = {}

        layers = data.get("layers", [])

        if layers:
            final_mask_pil = _composite_layers(layers, w, h)
        else:
            final_mask_pil = Image.new("L", (w, h), 0)

        if invert_mask:
            final_mask_pil = Image.eval(final_mask_pil, lambda x: 255 - x)

        if blur_radius > 0:
            final_mask_pil = final_mask_pil.filter(ImageFilter.GaussianBlur(radius=blur_radius))

        out_mask = _pil_to_mask_tensor(final_mask_pil)
        out_inverted_mask = 1.0 - out_mask

        mask_rgb = Image.merge("RGB", [final_mask_pil, final_mask_pil, final_mask_pil])
        out_mask_image = _pil_to_tensor(mask_rgb)

        if bg_image is not None:
            out_image = bg_image
        else:
            out_image = out_mask_image

        return (out_image, out_mask, out_inverted_mask, out_mask_image)


NODE_CLASS_MAPPINGS = {
    "MaskEditorOne": MaskEditorOne,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MaskEditorOne": "Mask Editor One",
}
