"""
Mask Editor API endpoints registered on the ComfyUI PromptServer.
Caches image/mask base64 data per node_id so the browser can fetch them
when the editor modal is opened.
"""

import base64
import io
import json
import logging
import pathlib
import numpy as np
from aiohttp import web
from PIL import Image

log = logging.getLogger(__name__)

try:
    from server import PromptServer
    _server_available = True
except ImportError:
    _server_available = False

try:
    from .abr_parser import extract_brushes as _extract_brushes
    _HAS_ABR = True
except ImportError:
    try:
        from abr_parser import extract_brushes as _extract_brushes
        _HAS_ABR = True
    except ImportError:
        _HAS_ABR = False

# In-memory cache: {node_id: {"bg_image_b64": str|None, ...}}
_node_cache: dict[str, dict] = {}

# Brush storage directory (inside the plugin folder)
BRUSH_DIR = pathlib.Path(__file__).parent / "brushes"
BRUSH_DIR.mkdir(exist_ok=True)

MAX_BODY_BYTES    = 100 * 1024 * 1024  # 100 MB per request
_MAX_IMPORT_FILES = 500                # max brush files per import
_BRUSH_ROOT       = str(BRUSH_DIR.resolve())
_BRUSH_SEP        = "/" if "/" in _BRUSH_ROOT else "\\"


def _within_brush_dir(target: pathlib.Path) -> bool:
    """Return True only if target is inside (or equal to) BRUSH_DIR."""
    t = str(target)
    return t == _BRUSH_ROOT or t.startswith(_BRUSH_ROOT + _BRUSH_SEP)


async def _read_json(request: web.Request):
    """Read JSON body with 100 MB size guard. Returns parsed dict or raises."""
    if request.content_length and request.content_length > MAX_BODY_BYTES:
        raise web.HTTPRequestEntityTooLarge(max_size=MAX_BODY_BYTES, actual_size=request.content_length)
    raw = await request.read()
    if len(raw) > MAX_BODY_BYTES:
        raise web.HTTPRequestEntityTooLarge(max_size=MAX_BODY_BYTES, actual_size=len(raw))
    return json.loads(raw)

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
_MIME_MAP = {
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".bmp":  "image/bmp",
}


def _build_brush_tree(directory: pathlib.Path, base: pathlib.Path) -> list:
    """Recursively build a JSON tree of brush files and folders."""
    nodes = []
    try:
        entries = sorted(
            directory.iterdir(),
            key=lambda p: (p.is_file(), p.name.lower()),
        )
        for entry in entries:
            rel = entry.relative_to(base).as_posix()
            if entry.is_dir():
                children = _build_brush_tree(entry, base)
                nodes.append({
                    "type": "folder",
                    "name": entry.name,
                    "path": rel,
                    "children": children,
                })
            elif entry.suffix.lower() in _IMAGE_EXTENSIONS:
                nodes.append({
                    "type": "file",
                    "name": entry.stem,
                    "path": rel,
                })
    except PermissionError:
        pass
    return nodes


if _server_available:

    @PromptServer.instance.routes.post("/mask_editor/get_node_image")
    async def get_node_image(request: web.Request) -> web.Response:
        """
        POST {"node_id": "123"}
        Returns {"image_b64": "<data url>|null", "mask_b64": "<data url>|null"}
        """
        try:
            data = await _read_json(request)
        except web.HTTPRequestEntityTooLarge:
            return web.json_response({"error": "payload too large"}, status=413)
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)

        node_id = str(data.get("node_id", ""))
        cached = _node_cache.get(node_id, {})
        return web.json_response({"image_b64": cached.get("bg_image_b64"), "mask_b64": None})

    @PromptServer.instance.routes.post("/mask_editor/save_result")
    async def save_result(request: web.Request) -> web.Response:
        """
        POST {"node_id": "123", "layer_data": "{...}"}
        Stores the layer_data string so the node can pick it up on next execution.
        The actual widget update happens client-side via the JS API.
        Server-side we just acknowledge.
        """
        try:
            data = await _read_json(request)
        except web.HTTPRequestEntityTooLarge:
            return web.json_response({"error": "payload too large"}, status=413)
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)

        node_id = str(data.get("node_id", ""))
        layer_data = data.get("layer_data", "{}")

        # Update cache with the new layer_data so a re-open shows the latest state
        entry = _node_cache.get(node_id, {})
        entry["layer_data"] = layer_data
        _node_cache[node_id] = entry

        return web.json_response({"ok": True})

    @PromptServer.instance.routes.post("/mask_editor/store_image")
    async def store_image(request: web.Request) -> web.Response:
        """
        POST {"node_id": "123", "image_b64": "<data url>", "mask_b64": "<data url>|null"}
        Stores image/mask base64 from the client (used when image is passed via the graph).
        """
        try:
            data = await _read_json(request)
        except web.HTTPRequestEntityTooLarge:
            return web.json_response({"error": "payload too large"}, status=413)
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)

        node_id = str(data.get("node_id", ""))
        entry = _node_cache.get(node_id, {})
        entry["bg_image_b64"] = data.get("bg_image_b64")
        _node_cache[node_id] = entry
        return web.json_response({"ok": True})

    # ────────────────────────────────────────────
    # Brush Library endpoints
    # ────────────────────────────────────────────

    @PromptServer.instance.routes.get("/mask_editor/brushes/list")
    async def list_brushes(request: web.Request) -> web.Response:
        """Returns the brush folder tree as JSON."""
        tree = _build_brush_tree(BRUSH_DIR, BRUSH_DIR)
        return web.json_response({"tree": tree})

    @PromptServer.instance.routes.get("/mask_editor/brushes/raw")
    async def get_brush_raw(request: web.Request) -> web.Response:
        """Serves a brush image file directly (browser-cacheable)."""
        path = request.query.get("path", "")
        target = (BRUSH_DIR / path).resolve()
        brush_root = BRUSH_DIR.resolve()

        # Path traversal guard
        if not str(target).startswith(str(brush_root) + ("/" if "/" in str(brush_root) else "\\")):
            if str(target) != str(brush_root):
                return web.Response(status=403)

        if not target.is_file() or target.suffix.lower() not in _IMAGE_EXTENSIONS:
            return web.Response(status=404)

        mime = _MIME_MAP.get(target.suffix.lower(), "image/png")
        return web.FileResponse(target, headers={"Content-Type": mime})

    @PromptServer.instance.routes.post("/mask_editor/brushes/import")
    async def import_brushes(request: web.Request) -> web.Response:
        """
        POST {"files": [{"path": "folder/brush.png", "data": "<data url>"}]}
        Saves brush image files to the plugin's brushes directory.
        """
        try:
            body = await _read_json(request)
        except web.HTTPRequestEntityTooLarge:
            return web.json_response({"error": "payload too large"}, status=413)
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)

        files = body.get("files", [])
        if len(files) > _MAX_IMPORT_FILES:
            return web.json_response({"error": "too many files"}, status=400)
        imported = 0

        for item in files:
            rel_path = item.get("path", "").lstrip("/\\")
            data_url = item.get("data", "")
            if not rel_path or not data_url:
                continue

            ext = pathlib.Path(rel_path).suffix.lower()
            if ext not in _IMAGE_EXTENSIONS:
                continue

            target = (BRUSH_DIR / rel_path).resolve()
            if not _within_brush_dir(target):
                continue

            try:
                raw_b64 = data_url.split(",", 1)[-1] if "," in data_url else data_url
                raw = base64.b64decode(raw_b64)
                target.parent.mkdir(parents=True, exist_ok=True)
                with open(target, "wb") as fh:
                    fh.write(raw)
                imported += 1
            except Exception:
                continue

        return web.json_response({"ok": True, "imported": imported})

    # ────────────────────────────────────────────
    # SAM3 endpoints
    # ────────────────────────────────────────────

    @PromptServer.instance.routes.get("/mask_editor/sam3/status")
    async def sam3_status(request: web.Request) -> web.Response:
        try:
            from .sam3_inference import get_status
            return web.json_response(get_status())
        except Exception:
            log.exception("sam3 get_status failed")
            return web.json_response({"loaded": False, "ckpt_found": False, "error": "status unavailable"})

    @PromptServer.instance.routes.post("/mask_editor/sam3/segment")
    async def sam3_segment(request: web.Request) -> web.Response:
        """
        POST {"node_id": "123", "prompt": "cat", "max_masks": 9}
        Returns {"masks": [{"mask_b64": "...", "score": float, "area": int}, ...]}
        """
        try:
            data = await _read_json(request)
        except web.HTTPRequestEntityTooLarge:
            return web.json_response({"error": "payload too large"}, status=413)
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)

        node_id    = str(data.get("node_id", ""))
        prompt     = str(data.get("prompt", "")).strip()
        max_masks  = min(int(data.get("max_masks", 9)), 20)
        model_name = str(data.get("model", "")).strip() or None

        if not prompt:
            return web.json_response({"error": "prompt required"}, status=400)

        cached    = _node_cache.get(node_id, {})
        image_b64 = cached.get("image_b64") or cached.get("bg_image_b64")
        if not image_b64:
            return web.json_response({"error": "no image available for this node"}, status=400)

        try:
            raw_b64   = image_b64.split(",", 1)[-1] if "," in image_b64 else image_b64
            image_pil = Image.open(io.BytesIO(base64.b64decode(raw_b64))).convert("RGB")
        except Exception:
            log.exception("SAM3 image decode failed")
            return web.json_response({"error": "image decode failed"}, status=500)

        try:
            from .sam3_inference import run_inference
            import asyncio
            import functools
            loop   = asyncio.get_event_loop()
            fn     = functools.partial(run_inference, image_pil, prompt, max_masks, model_name)
            masks  = await loop.run_in_executor(None, fn)
            return web.json_response({"masks": masks})
        except Exception:
            log.exception("SAM3 inference failed")
            return web.json_response({"error": "inference failed"}, status=500)

    # ────────────────────────────────────────────
    # BiRefNet endpoints
    # ────────────────────────────────────────────

    @PromptServer.instance.routes.get("/mask_editor/birefnet/status")
    async def birefnet_status(request: web.Request) -> web.Response:
        try:
            from .birefnet_inference import get_status
            return web.json_response(get_status())
        except Exception:
            log.exception("birefnet get_status failed")
            return web.json_response({"loaded": False, "model_found": False, "error": "status unavailable"})

    @PromptServer.instance.routes.post("/mask_editor/birefnet/remove_bg")
    async def birefnet_remove_bg(request: web.Request) -> web.Response:
        """
        POST {"node_id": "123"}
        Returns {"mask_b64": "data:image/png;base64,..."} — white=foreground, black=background
        """
        try:
            data = await _read_json(request)
        except web.HTTPRequestEntityTooLarge:
            return web.json_response({"error": "payload too large"}, status=413)
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)

        node_id   = str(data.get("node_id", ""))
        cached    = _node_cache.get(node_id, {})
        image_b64 = cached.get("image_b64") or cached.get("bg_image_b64")
        if not image_b64:
            return web.json_response({"error": "no image available for this node"}, status=400)

        try:
            raw_b64   = image_b64.split(",", 1)[-1] if "," in image_b64 else image_b64
            image_pil = Image.open(io.BytesIO(base64.b64decode(raw_b64))).convert("RGB")
        except Exception:
            log.exception("BiRefNet image decode failed")
            return web.json_response({"error": "image decode failed"}, status=500)

        try:
            from .birefnet_inference import run_inference
            import asyncio
            import functools
            loop     = asyncio.get_event_loop()
            fn       = functools.partial(run_inference, image_pil)
            mask_b64 = await loop.run_in_executor(None, fn)
            return web.json_response({"mask_b64": mask_b64})
        except Exception:
            log.exception("BiRefNet inference failed")
            return web.json_response({"error": "inference failed"}, status=500)

    @PromptServer.instance.routes.post("/mask_editor/brushes/upload_abr")
    async def upload_abr(request: web.Request) -> web.Response:
        """
        Accepts either multipart/form-data (field "file") or
        JSON {"name": "...", "data": "<base64>"}.
        Parses the ABR file and saves extracted brush PNGs.
        Returns {"ok": true, "imported": N, "folder": "stem"} or {"error": "..."}.
        """
        if not _HAS_ABR:
            return web.json_response(
                {"error": "ABR support unavailable (Pillow not installed)"},
                status=500,
            )

        filename = "brushes.abr"
        abr_bytes: bytes | None = None

        ct = request.headers.get('Content-Type', '')
        if 'multipart' in ct.lower():
            try:
                reader = await request.multipart()
                field = await reader.next()
                while field is not None:
                    if field.name == "file":
                        filename = field.filename or filename
                        chunks = []
                        while True:
                            chunk = await field.read_chunk(1 << 16)
                            if not chunk:
                                break
                            chunks.append(chunk)
                        abr_bytes = b"".join(chunks)
                    field = await reader.next()
            except Exception:
                log.exception("ABR multipart read failed")
                return web.json_response({"error": "failed to read upload"}, status=400)
        else:
            try:
                body = await _read_json(request)
            except web.HTTPRequestEntityTooLarge:
                return web.json_response({"error": "payload too large (use multipart for files >75 MB)"}, status=413)
            except Exception:
                return web.json_response({"error": "invalid json"}, status=400)

            filename = body.get("name", filename)
            data_url = body.get("data", "")
            if not data_url:
                return web.json_response({"error": "no data"}, status=400)
            try:
                raw_b64 = data_url.split(",", 1)[-1] if "," in data_url else data_url
                abr_bytes = base64.b64decode(raw_b64)
            except Exception:
                return web.json_response({"error": "invalid base64"}, status=400)

        if not abr_bytes:
            return web.json_response({"error": "no file data received"}, status=400)

        import re as _re
        stem = _re.sub(r'[^\w\-]', '_', pathlib.Path(filename).stem)[:64] or "brushes"
        log.info("ABR upload: filename=%r stem=%r bytes=%d", filename, stem, len(abr_bytes))

        try:
            saved = _extract_brushes(abr_bytes, BRUSH_DIR, stem)
        except Exception:
            log.exception("ABR extract_brushes failed for %r", filename)
            return web.json_response({"error": "ABR parse failed"}, status=500)

        return web.json_response({
            "ok":       True,
            "imported": len(saved),
            "folder":   stem,
        })
