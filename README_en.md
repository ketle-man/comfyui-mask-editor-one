# Mask Editor One

**English** | [日本語](README.md) | [中文](README_zh.md)

A layer-based modal mask editor for ComfyUI. Create and edit masks with Photoshop-like controls, outputting `IMAGE` and `MASK`. Designed to handle all mask operations in a single node.

![Mask Editor One](docs/3_mask_editor.png)

## Features

- **Modal editor** — Launch the in-browser editor via the `Edit Mask` button on the node
- **Paint tool** — Brush size, hardness, spacing, **angle**, add/erase mode. **Size Jitter** (Amount slider controls max reduction) and **Rotation Jitter** (randomises 0°–360° per stamp), each toggled by checkbox
- **Color selection tool** — Tolerance/feather adjustment, add/subtract mode
- **Alpha extraction tool** — Generate mask from input image alpha channel
- **Text tool** — Place text-shaped masks with font, size, Bold/Italic, alignment options
- **Vector tool** — Draw smooth closed paths with Catmull-Rom splines
- **Shape tool** — Draw rectangles and ellipses by dragging. Shift+drag for square/circle from centre
- **SAM3 tool** — AI segmentation with text prompt (SAM3 / SAM3.1). Model selector dropdown, candidate mask thumbnails, click to apply to layer
- **BiRefNet background removal** — One-click foreground mask generation. Uses ComfyUI's native `comfy.bg_removal_model` — no extra libraries required
- **Mode toggle for all tools** — Switch Add / Erase (or Add / Subtract) with a button click
- **Layer management** — Add, delete, toggle visibility, add/subtract, drag to reorder
- **Undo/Redo** — 30 levels per layer
- **Image brushes** — Use grayscale images as brush stamps
- **Brush Library** — Folder tree UI, PNG folder import, `.abr` file import
- **Mask invert toggle** — Node toggle and modal Invert checkbox stay in sync
- **Photoshop Quick Mask view** — When showing image, a semi-transparent overlay covers the canvas and the painted area becomes transparent (Photoshop Quick Mask style). Overlay colour is configurable
- **Blur filter** — Gaussian blur adjustable via node widget and modal slider (0–200 px), bidirectional sync
- **BG drop zone** — Click or drop an image file onto the footer BG zone to set background. Canvas area drop also supported
- **New canvas** — Create a blank canvas with specified width/height via the `📄 New` toolbar button
- **Node preview** — Preview the selected background image and applied mask directly on the node
- **IMG/MASK toggle** — Switch between image and mask preview on the node
- **Input support** — `IMAGE` / `MASK` inputs (both optional)
- **Out-of-canvas drag** — Drawing continues when the mouse leaves the canvas edge (select all the way to image borders)
- **i18n (Multilingual)** — Switch between English, Japanese, and Chinese via the language selector in the footer. Setting is saved to `localStorage`

## Installation

### ComfyUI Manager (Recommended)

Install via ComfyUI Manager's "Install via Git URL" or "Custom Nodes Manager" using:

```
https://github.com/ketle-man/comfyui-mask-editor-one
```

Or search for **Mask Editor One** on the [Comfy Registry](https://registry.comfy.org/publishers/statsu/nodes/comfyui-mask-editor-one).

### Manual Installation

Place this folder inside ComfyUI's `custom_nodes/` directory:

```
ComfyUI/
└── custom_nodes/
    └── comfyui-mask-editor-one/
        ├── __init__.py
        ├── nodes.py
        ├── server.py
        ├── abr_parser.py
        ├── sam3_inference.py
        ├── birefnet_inference.py
        ├── requirements.txt
        └── web/
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### SAM3 Model Setup (optional)

To use the SAM3 tool, place SAM3 checkpoints in `ComfyUI/models/sam3/`:

```
ComfyUI/
└── models/
    └── sam3/
        ├── sam3.pt                              # SAM3 (recommended)
        ├── sam3.safetensors                     # SAM3 safetensors format
        ├── sam3.1_multiplex.pt                  # SAM3.1
        └── sam3.1_multiplex_fp16.safetensors    # SAM3.1 FP16 safetensors
```

- Supports `.pt` / `.pth` / `.safetensors`. If multiple files are present, a dropdown lets you choose
- TorchScript/JIT files (`torch.jit.save`) are automatically skipped
- Files whose name does not contain `sam3` are not listed
- If no checkpoint is found, auto-download from HuggingFace (facebook/sam3) is attempted
- **Gated model**: `facebook/sam3` requires access approval. Accept the license at [huggingface.co/facebook/sam3](https://huggingface.co/facebook/sam3), then run `huggingface-cli login` or set the `HF_TOKEN` environment variable

### BiRefNet Model Setup (optional)

To use BiRefNet background removal, place the model in `ComfyUI/models/background_removal/`:

```
ComfyUI/
└── models/
    └── background_removal/
        └── birefnet.safetensors    # or BiRefNet.safetensors / BiRefNet-general.safetensors
```

- Download from HuggingFace `zhengpeng7/BiRefNet`
- Uses ComfyUI's built-in `comfy.bg_removal_model` — no extra packages needed
- If the file is missing, an error is shown in the tool panel. The model is not loaded until inference is run

Restart ComfyUI. The **Mask Editor One** node will appear under the `image/masking` category.

## Usage

### Basic

<img src="docs/4_menu.png" width="110" align="right" alt="Tool sidebar">

1. Add the `Mask Editor One` node to your workflow
2. (Optional) Connect `IMAGE` / `MASK` inputs
3. Click the `Edit Mask` button on the node → the modal editor opens
4. Select a tool from the left sidebar and draw your mask
5. Click `Apply` to confirm → run the node to get `image` / `mask` outputs

### Node Options

| Input | Description |
|-------|-------------|
| `invert_mask` | Invert the output mask (black↔white). Bidirectionally synced with the modal Invert checkbox |
| `blur_radius` | Gaussian blur radius applied to output mask (0–200 px). Bidirectionally synced with the modal slider |
| `image` | Input image (optional). Takes priority over the BG button image when connected |
| `mask` | Input mask (optional) |
| `layer_data` | Editor state JSON (updated automatically) |

### Node BG Button

| Action | Result |
|--------|--------|
| Click `🖼 BG` | Opens file dialog. Changes to `🖼 BG ✕` after selection |
| Click `🖼 BG ✕` | Clears the selected BG image |
| Click `👁 Show: Image` | Switches node preview to mask view |
| Click `👁 Show: Mask` | Switches node preview to image view |

- When `image` input is connected it takes priority; disconnecting it falls back to the BG button image
- After Apply, the node automatically switches to mask preview
- To change BG while the modal is open, use the `🖼 BG` button in the modal footer

<p>
  <img src="docs/1_node.png" width="220" alt="Node — image preview">
  <img src="docs/2_node_mask.png" width="220" alt="Node — mask preview">
</p>

### Text Tool

1. Select **T (Text)** in the toolbar
2. Configure text, font, size, bold/italic, alignment, and mode in the right panel
3. Click on the canvas → a text input overlay appears
4. Type your text and press **Stamp** or `Ctrl+Enter` to confirm, `Esc` to cancel

| Option | Description |
|--------|-------------|
| Text | Text to stamp (multi-line supported) |
| Font | Font family (11 presets: Arial, Georgia, Impact, etc.) |
| Size | Font size (8–400 px) |
| Style | **B** (Bold) / *I* (Italic) |
| Align | Left / Center / Right |
| Mode | **Add** / **Erase** |

### Vector Tool

1. Select **✦ (Vector)** in the toolbar
2. Click on the canvas to add anchor points (yellow dots)
3. Move the mouse to preview the path in real time
4. **Close path**: click the first point (highlighted red) to close and fill
5. **Open path**: press `Enter` to commit (undoable)

| Shortcut | Action |
|----------|--------|
| Click | Add anchor point |
| Click first point | Close path and commit |
| `Enter` | Commit open path |
| `Backspace` / `Delete` | Delete last anchor point |
| `Esc` | Reset path |

Splines use **Catmull-Rom → Bézier conversion**, producing smooth curves that pass through all anchors.

### Shape Tool

1. Select **⬜ (Shape)** in the toolbar
2. Choose shape (Rectangle / Ellipse) and mode (Add / Erase) in the right panel
3. Drag on the canvas to draw

| Action | Result |
|--------|--------|
| Drag | Draw rectangle/ellipse from corner to corner |
| `Shift` + Drag | Draw square/circle **centred** at the start point |

A blue dashed preview is shown while dragging.

### SAM3 Tool

1. Select **✨ (SAM3)** in the toolbar
2. Choose a checkpoint from the **Model** dropdown (valid files in `models/sam3/` are listed; hidden if only one)
3. Enter a prompt and click **Segment** or press `Enter`
4. Candidate mask thumbnails are shown in score order
5. Click a thumbnail to apply it to the active layer

| Option | Description |
|--------|-------------|
| Model | Checkpoint filename to use |
| Prompt | Target object in English (e.g. "dog", "red ball") |
| Mode | Add (white paint) / Erase (remove mask area) |

### BiRefNet Background Removal Tool

1. Select **🔲 (BG Remove)** in the toolbar
2. Check the status in the right panel ("Model found" if the file is present)
3. Click **Remove BG** → BiRefNet generates a foreground mask and applies it to the active layer
4. Choose **Mode** for how the result is applied

| Option | Description |
|--------|-------------|
| Mode | Add (add foreground as white mask) / Erase (erase foreground area from mask) |

- On first load (~1–3 s) the button is disabled and a spinner is shown
- The button is also disabled during inference. Result is applied automatically on completion

### Paint Tool

Brush rendering follows Photoshop conventions:

- **Hardness** — Controls the radius of the fully opaque core. `100%` = sharp edge, `0%` = full soft feather
- **Spacing** — Stamp interval as a fraction of brush size
- **Angle** — Image brush rotation
- **Size Jitter** — Enable with checkbox. Randomly reduces brush size per stamp. **Amount** slider (0–100%) sets maximum reduction (50% → random 50%–100% of original size)
- **Rotation Jitter** — Enable with checkbox. Randomises rotation 0°–360° per stamp. Most effective with image brushes
- **Aspect ratio preserved** — Image brush stamps maintain the source image's aspect ratio (`brushSize` = height, width calculated automatically)
- **No intra-stroke accumulation** — Overlapping stamps within one stroke use `lighten` (max), preventing unwanted build-up

### Brush Library

Open the Brush Library via the `Browse Brushes…` button when the Paint tool is selected.

![Brush Library](docs/5_brush_library.png)

- **Import Folder** — Recursively imports a folder of PNG/JPG/WebP/BMP images
- **Import .ABR** — Imports a Photoshop `.abr` brush file (see below)

Brushes are stored in `custom_nodes/comfyui-mask-editor/brushes/`.  
Thumbnails display white brush shapes on a dark background (same style as Photoshop's brush preview).

### Importing ABR Brushes

Supported versions:

| Version | Status |
|---------|--------|
| ABR v1 (Photoshop 5) | ✅ |
| ABR v2 non-sub6 (Photoshop 5.5–7, block-length format) | ✅ Unicode brush names supported |
| ABR v2 sub6 / v6 (Photoshop 7+) | ✅ ActionDescriptor parsing |
| ABR v6 UUID-keyed samp (Photoshop CC+) | ✅ Canvas bounds fixed-point parsing |
| ABR v6 Atenais format (05_Flames, etc.) | ✅ offset 320 BE u16 row-count table + PackBits |
| ABR v10 | ✅ |

Imported brushes are saved as **RGBA PNG**:
- `RGB = (255, 255, 255)` white
- `A = brush density` (brighter = more opaque = stronger paint)

> **Re-importing brushes**  
> If the save format changed, delete the relevant folder from the Brush Library before re-importing.

## Architecture

```
comfyui-mask-editor/
├── nodes.py              # MaskEditorOne (process / layer compositing)
├── server.py             # PromptServer API (image cache, brush, SAM3, BiRefNet endpoints)
├── abr_parser.py         # ABR file parser
├── sam3_inference.py     # SAM3 inference backend
├── birefnet_inference.py # BiRefNet background removal backend
└── web/
    ├── css/maskEditor.css
    └── js/
        ├── maskEditor.js              # ComfyUI extension entry point
        └── editor/
            ├── MaskEditorModal.js     # Full modal UI
            ├── CanvasCompositor.js    # Layer compositing
            ├── LayerManager.js        # Layer management (Undo/Redo)
            ├── BrushLibrary.js        # Brush Library UI
            ├── i18n.js               # Translations (en/ja/zh)
            └── tools/
                ├── BaseTool.js
                ├── PaintTool.js        # Paint tool
                ├── ColorTool.js        # Color selection
                ├── TransparencyTool.js # Alpha → mask
                ├── TextTool.js         # Text-shaped mask
                ├── VectorTool.js       # Catmull-Rom spline vector
                ├── ShapeTool.js        # Rectangle / ellipse shapes
                ├── Sam3Tool.js         # SAM3.1 AI segmentation
                └── BiRefNetTool.js     # BiRefNet background removal
```

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/mask_editor/get_node_image` | Retrieve image/mask by node ID |
| POST | `/mask_editor/store_image` | Cache image from browser |
| POST | `/mask_editor/save_result` | Save layer data |
| GET | `/mask_editor/brushes/list` | Brush folder tree |
| GET | `/mask_editor/brushes/raw?path=…` | Serve brush image |
| POST | `/mask_editor/brushes/import` | Import PNG folder |
| POST | `/mask_editor/brushes/upload_abr` | Import ABR file |
| GET | `/mask_editor/sam3/status` | SAM3 load state and available model list |
| POST | `/mask_editor/sam3/segment` | Run segmentation with text prompt |
| GET | `/mask_editor/birefnet/status` | BiRefNet load state and model file presence |
| POST | `/mask_editor/birefnet/remove_bg` | Run background removal, returns foreground mask PNG |

## Debugging

Enable verbose logging:

```python
import logging
logging.getLogger("abr_parser").setLevel(logging.DEBUG)
logging.getLogger("server").setLevel(logging.DEBUG)
```

Check the ComfyUI terminal log when investigating brush import issues.

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgements

- [SAM3 / SAM 3.1](https://huggingface.co/facebook/sam3) (Meta FAIR) — text-prompted AI segmentation (Apache-2.0)
- [BiRefNet](https://huggingface.co/zhengpeng7/BiRefNet) (ZhengPeng7) — background removal model (MIT), used via ComfyUI's native `comfy.bg_removal_model`  
  Zheng et al., "Bilateral Reference for High-Resolution Dichotomous Image Segmentation", *CAAI AIR* 2024
