import { BaseTool } from "./BaseTool.js";

export class PaintTool extends BaseTool {
    constructor(drawCanvas, bgCanvas) {
        super(drawCanvas, bgCanvas);
        this.brushSize        = 30;
        this.hardness         = 0.85;
        this.spacing          = 0.25;   // stamp interval as fraction of brushSize
        this.angle            = 0;      // image brush rotation in degrees [0, 360)
        this.mode             = "add";  // "add" | "erase"
        this.brushImage       = null;   // HTMLImageElement | null
        this.brushName        = "Circle";
        this.sizeJitter       = false;  // randomise size per stamp
        this.sizeJitterAmount = 0.5;    // 0‥1 — fraction of brushSize that can be removed
        this.rotationJitter   = false;  // randomise rotation 0‥360° per stamp

        this._drawing     = false;
        this._lastX       = 0;
        this._lastY       = 0;

        // Stroke buffer: prevents intra-stroke accumulation (Photoshop behaviour)
        this._baseCanvas  = null;  // snapshot at stroke start
        this._strokeCanvas = null; // stamps accumulated during stroke
        this._strokeCtx   = null;

        // Cached stamp canvas; rebuilt when brush params change
        this._stamp      = null;
        this._stampSize  = 0;
        this._stampHard  = 0;
        this._stampImg   = null;
    }

    activate() {
        this.drawCanvas.style.cursor = "crosshair";
    }

    deactivate() {
        this._drawing = false;
        this._clearStrokeBuffer();
    }

    /** Set an image brush loaded from the library. */
    setImageBrush(img, name) {
        this.brushImage = img;
        this.brushName  = name;
        this._stamp     = null;
    }

    /** Reset to default circular brush. */
    clearImageBrush() {
        this.brushImage = null;
        this.brushName  = "Circle";
        this._stamp     = null;
    }

    onMouseDown(x, y) {
        this._drawing = true;
        this._lastX = x;
        this._lastY = y;
        this._initStrokeBuffer();
        this._paintToStroke(x, y);
        this._mergeStroke();
    }

    onMouseMove(x, y) {
        if (!this._drawing) return;
        this._paintLineToStroke(this._lastX, this._lastY, x, y);
        this._lastX = x;
        this._lastY = y;
        this._mergeStroke();
    }

    onMouseUp() {
        if (this._drawing) {
            this._drawing = false;
            this._clearStrokeBuffer();
            this._notifyChange();
        }
    }

    onMouseLeave() {
        if (this._drawing) {
            this._drawing = false;
            this._clearStrokeBuffer();
            this._notifyChange();
        }
    }

    // ── Stroke buffer ────────────────────────────────────────────────

    _initStrokeBuffer() {
        const w = this.drawCanvas.width;
        const h = this.drawCanvas.height;

        this._baseCanvas = document.createElement("canvas");
        this._baseCanvas.width = w;
        this._baseCanvas.height = h;
        this._baseCanvas.getContext("2d").drawImage(this.drawCanvas, 0, 0);

        this._strokeCanvas = document.createElement("canvas");
        this._strokeCanvas.width = w;
        this._strokeCanvas.height = h;
        this._strokeCtx = this._strokeCanvas.getContext("2d");
    }

    _clearStrokeBuffer() {
        this._baseCanvas   = null;
        this._strokeCanvas = null;
        this._strokeCtx    = null;
    }

    /**
     * Composite base + stroke into drawCanvas.
     * add:   lighten (max) — no intra-stroke accumulation
     * erase: destination-out from the stroke mask
     */
    _mergeStroke() {
        const ctx = this.ctx;
        const w = this.drawCanvas.width;
        const h = this.drawCanvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this._baseCanvas, 0, 0);
        if (this.mode === "erase") {
            ctx.globalCompositeOperation = "destination-out";
        } else {
            ctx.globalCompositeOperation = "lighten";
        }
        ctx.drawImage(this._strokeCanvas, 0, 0);
        ctx.globalCompositeOperation = "source-over";
    }

    _paintLineToStroke(x0, y0, x1, y1) {
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const step = Math.max(1, this.brushSize * this.spacing);
        const steps = Math.ceil(dist / step);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            this._paintToStroke(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        }
    }

    /** Paint a single stamp into the stroke buffer (always source-over / add). */
    _paintToStroke(x, y) {
        const origCtx = this.ctx;
        this.ctx = this._strokeCtx;

        if (this.sizeJitter || this.rotationJitter) {
            const savedSize      = this.brushSize;
            const savedAngle     = this.angle;
            const savedStamp     = this._stamp;
            const savedStampSize = this._stampSize;

            if (this.sizeJitter) {
                this.brushSize = savedSize * (1 - Math.random() * this.sizeJitterAmount);
            }
            if (this.rotationJitter) {
                this.angle = Math.random() * 360;
            }

            if (this.brushImage) {
                this._paintImageBrush(x, y, "add");
            } else {
                this._paintCircle(x, y, "add");
            }

            // Restore all modified state so the base stamp cache stays valid
            this.brushSize   = savedSize;
            this.angle       = savedAngle;
            this._stamp      = savedStamp;
            this._stampSize  = savedStampSize;
        } else {
            if (this.brushImage) {
                this._paintImageBrush(x, y, "add");
            } else {
                this._paintCircle(x, y, "add");
            }
        }

        this.ctx = origCtx;
    }

    // ── Brush rendering ──────────────────────────────────────────────

    /**
     * Photoshop-compatible circle brush.
     * hardness controls where the opaque core ends and the feathered edge begins:
     *   hardness=1.0 → sharp, fully opaque circle
     *   hardness=0   → full soft feather from centre to edge
     */
    _paintCircle(x, y, forceMode) {
        const ctx  = this.ctx;
        const r    = this.brushSize / 2;
        const mode = forceMode ?? this.mode;

        ctx.globalCompositeOperation =
            mode === "erase" ? "destination-out" : "source-over";

        if (this.hardness >= 1.0) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = "white";
            ctx.fill();
        } else {
            // Inner opaque core up to r*hardness, then feather to edge
            const innerR = r * Math.max(0, Math.min(0.999, this.hardness));
            const grad   = ctx.createRadialGradient(x, y, innerR, x, y, r);
            grad.addColorStop(0, "rgba(255,255,255,1)");
            grad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
        }

        ctx.globalCompositeOperation = "source-over";
    }

    _paintImageBrush(x, y, forceMode) {
        const ctx  = this.ctx;
        const size = Math.round(this.brushSize);
        const stamp = this._getStamp(size);
        const mode = forceMode ?? this.mode;

        ctx.globalCompositeOperation =
            mode === "erase" ? "destination-out" : "source-over";

        if (this.angle) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((this.angle * Math.PI) / 180);
            ctx.drawImage(stamp, -stamp.width / 2, -stamp.height / 2);
            ctx.restore();
        } else {
            ctx.drawImage(stamp, Math.round(x - stamp.width / 2), Math.round(y - stamp.height / 2));
        }

        ctx.globalCompositeOperation = "source-over";
    }

    /**
     * Cached offscreen stamp canvas.
     * White pixels; alpha = luminance (image brush) or alpha channel value.
     * Aspect ratio of the source brush image is preserved; brushSize controls height.
     */
    _getStamp(size) {
        if (
            this._stamp &&
            this._stampSize  === size &&
            this._stampHard  === this.hardness &&
            this._stampImg   === this.brushImage
        ) {
            return this._stamp;
        }

        const img  = this.brushImage;
        const srcW = img.naturalWidth  || img.width;
        const srcH = img.naturalHeight || img.height;
        const aspect = (srcW > 0 && srcH > 0) ? srcW / srcH : 1;

        const stampH = size;
        const stampW = Math.max(1, Math.round(size * aspect));

        const canvas = document.createElement("canvas");
        canvas.width  = stampW;
        canvas.height = stampH;
        const stx = canvas.getContext("2d");

        stx.drawImage(img, 0, 0, stampW, stampH);

        const imgData = stx.getImageData(0, 0, stampW, stampH);
        const d = imgData.data;

        // Detect whether the image carries meaningful alpha information.
        // New ABR brushes are saved as RGBA (alpha = brush density).
        // Old/imported grayscale PNGs have no alpha; detect background colour
        // from corners to decide whether bright or dark pixels are the brush.
        let hasAlpha = false;
        for (let i = 3; i < d.length; i += 4) {
            if (d[i] < 250) { hasAlpha = true; break; }
        }

        let invertLum = false;
        if (!hasAlpha) {
            // Sample 4 corners to determine background luminance
            const cornerIdx = [0, stampW - 1, stampW * (stampH - 1), stampW * stampH - 1];
            let bgLum = 0;
            for (const ci of cornerIdx) {
                const ii = ci * 4;
                bgLum += (d[ii] * 0.299 + d[ii + 1] * 0.587 + d[ii + 2] * 0.114) / 255;
            }
            bgLum /= cornerIdx.length;
            // White background (bgLum > 0.5): dark pixels are the brush → invert
            invertLum = bgLum > 0.5;
        }

        for (let i = 0; i < d.length; i += 4) {
            let alpha;
            if (hasAlpha) {
                alpha = d[i + 3] / 255;
            } else {
                const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
                alpha = invertLum ? 1 - lum : lum;
            }
            d[i]     = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
            d[i + 3] = Math.round(alpha * 255);
        }
        stx.putImageData(imgData, 0, 0);

        this._stamp     = canvas;
        this._stampSize = size;
        this._stampHard = this.hardness;
        this._stampImg  = this.brushImage;

        return canvas;
    }
}
