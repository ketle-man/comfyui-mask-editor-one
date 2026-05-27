import { BaseTool } from "./BaseTool.js";

const FONTS = [
    "Arial", "Arial Black", "Georgia", "Times New Roman",
    "Courier New", "Verdana", "Trebuchet MS", "Impact",
    "Comic Sans MS", "Helvetica", "Tahoma",
];

export class TextTool extends BaseTool {
    constructor(drawCanvas, bgCanvas) {
        super(drawCanvas, bgCanvas);
        this.text       = "Hello";
        this.fontFamily = "Arial";
        this.fontSize   = 64;
        this.bold       = false;
        this.italic     = false;
        this.align      = "left"; // "left" | "center" | "right"
        this.mode       = "add";  // "add" | "erase"
        this._overlay   = null;
    }

    static get FONTS() { return FONTS; }

    activate() {
        this.drawCanvas.style.cursor = "crosshair";
    }

    deactivate() {
        this._closeOverlay();
        this.drawCanvas.style.cursor = "";
    }

    onMouseDown(x, y) {
        if (this._overlay) {
            this._closeOverlay();
            return;
        }
        this._showOverlay(x, y);
    }

    onMouseMove() {}
    onMouseLeave() {}
    onMouseUp() {}

    _getCanvasFont() {
        const parts = [];
        if (this.italic) parts.push("italic");
        if (this.bold)   parts.push("bold");
        parts.push(`${this.fontSize}px`);
        parts.push(`"${this.fontFamily}", sans-serif`);
        return parts.join(" ");
    }

    _showOverlay(canvasX, canvasY) {
        const cv = this.drawCanvas;
        const rect = cv.getBoundingClientRect();
        const scaleX = rect.width  / cv.width;
        const scaleY = rect.height / cv.height;
        const cssX = Math.round(canvasX * scaleX);
        const cssY = Math.round(canvasY * scaleY);

        const container = cv.parentElement; // .me-canvas-container (position: relative)

        const overlay = document.createElement("div");
        overlay.className = "me-text-overlay";
        overlay.style.left = cssX + "px";
        overlay.style.top  = cssY + "px";

        const textarea = document.createElement("textarea");
        textarea.className   = "me-text-textarea";
        textarea.value       = this.text;
        textarea.rows        = 3;
        textarea.placeholder = "Enter text…";
        overlay.appendChild(textarea);

        const btnRow = document.createElement("div");
        btnRow.className = "me-text-btn-row";

        const okBtn = document.createElement("button");
        okBtn.className   = "me-text-ok-btn";
        okBtn.textContent = "Stamp";
        okBtn.onclick = () => {
            const txt = textarea.value;
            if (txt.trim()) {
                this.text = txt;
                this._stamp(canvasX, canvasY);
            }
            this._closeOverlay();
        };

        const cancelBtn = document.createElement("button");
        cancelBtn.className   = "me-text-cancel-btn";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = () => this._closeOverlay();

        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);
        overlay.appendChild(btnRow);

        const hint = document.createElement("div");
        hint.className   = "me-text-overlay-hint";
        hint.textContent = "Ctrl+Enter: Stamp  /  Esc: Cancel";
        overlay.appendChild(hint);

        textarea.addEventListener("keydown", e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                okBtn.click();
            } else if (e.key === "Escape") {
                cancelBtn.click();
            }
            e.stopPropagation();
        });

        // オーバーレイ内でのmousedownがキャンバスイベントに伝播しないようにする
        overlay.addEventListener("mousedown", e => e.stopPropagation());

        container.appendChild(overlay);
        this._overlay = overlay;
        textarea.focus();
        textarea.select();
    }

    _closeOverlay() {
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
        }
    }

    _stamp(x, y) {
        const ctx = this.ctx;
        ctx.save();
        ctx.font         = this._getCanvasFont();
        ctx.textAlign    = this.align;
        ctx.textBaseline = "top";

        if (this.mode === "erase") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = "rgba(0,0,0,1)";
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = "white";
        }

        const lines      = this.text.split("\n");
        const lineHeight = this.fontSize * 1.2;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, y + i * lineHeight);
        }
        ctx.restore();

        this._notifyChange();
    }
}
