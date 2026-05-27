import { BaseTool } from "./BaseTool.js";

export class ShapeTool extends BaseTool {
    constructor(drawCanvas, bgCanvas) {
        super(drawCanvas, bgCanvas);
        this.mode  = "add";    // "add" | "erase"
        this.shape = "rect";   // "rect" | "ellipse"
        this._previewCanvas = null;
        this._pCtx = null;
        this._startX = 0;
        this._startY = 0;
        this._drawing = false;
    }

    setPreviewCanvas(canvas) {
        this._previewCanvas = canvas;
        this._pCtx = canvas.getContext("2d");
    }

    deactivate() {
        this._drawing = false;
        this._clearPreview();
    }

    onMouseDown(x, y, _e) {
        this._startX = x;
        this._startY = y;
        this._drawing = true;
        this._drawPreview(x, y, false);
    }

    onMouseMove(x, y, e) {
        if (!this._drawing) return;
        this._drawPreview(x, y, e.shiftKey);
    }

    onMouseUp(x, y, e) {
        if (!this._drawing) return;
        this._drawing = false;
        this._clearPreview();
        this._commit(x, y, e.shiftKey);
        this._notifyChange();
    }

    onMouseLeave() {
        // document レベルのmouseupで処理するため、ここでは描画を中断しない
    }

    // shiftKey: 開始点を中心とした正方形/正円
    _getRect(x, y, shiftKey) {
        const sx = this._startX, sy = this._startY;
        const dx = x - sx, dy = y - sy;

        if (shiftKey) {
            const half = Math.max(Math.abs(dx), Math.abs(dy));
            return { x: sx - half, y: sy - half, w: half * 2, h: half * 2 };
        }

        return {
            x: Math.min(sx, x),
            y: Math.min(sy, y),
            w: Math.abs(dx),
            h: Math.abs(dy),
        };
    }

    _drawPreview(x, y, shiftKey) {
        if (!this._pCtx) return;
        const pCtx = this._pCtx;
        const pc   = this._previewCanvas;
        pCtx.clearRect(0, 0, pc.width, pc.height);

        const { x: rx, y: ry, w, h } = this._getRect(x, y, shiftKey);
        if (w < 1 || h < 1) return;

        pCtx.save();
        pCtx.strokeStyle = "rgba(0, 180, 255, 0.9)";
        pCtx.lineWidth   = 1.5;
        pCtx.setLineDash([5, 3]);
        pCtx.beginPath();
        if (this.shape === "rect") {
            pCtx.rect(rx, ry, w, h);
        } else {
            pCtx.ellipse(rx + w / 2, ry + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        }
        pCtx.stroke();
        pCtx.restore();
    }

    _clearPreview() {
        if (!this._pCtx) return;
        this._pCtx.clearRect(0, 0, this._previewCanvas.width, this._previewCanvas.height);
    }

    _commit(x, y, shiftKey) {
        const { x: rx, y: ry, w, h } = this._getRect(x, y, shiftKey);
        if (w < 1 || h < 1) return;

        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = this.mode === "erase" ? "destination-out" : "source-over";
        ctx.fillStyle = "white";
        ctx.beginPath();
        if (this.shape === "rect") {
            ctx.rect(rx, ry, w, h);
        } else {
            ctx.ellipse(rx + w / 2, ry + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
    }
}
