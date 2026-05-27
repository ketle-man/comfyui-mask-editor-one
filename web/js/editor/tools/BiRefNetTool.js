import { BaseTool } from "./BaseTool.js";

export class BiRefNetTool extends BaseTool {
    constructor(drawCanvas, bgCanvas) {
        super(drawCanvas, bgCanvas);
        this.mode      = "add";   // "add" | "erase"
        this.isLoading = false;
        this.lastError = null;
        this._onStateChange = null;
    }

    onStateChange(fn) {
        this._onStateChange = fn;
    }

    _notify() {
        this._onStateChange?.();
    }

    /** BiRefNet背景除去を実行してマスクをレイヤーに書き込む。 */
    async runRemoveBg(nodeId) {
        this.isLoading = true;
        this.lastError = null;
        this._notify();

        try {
            const resp = await fetch("/mask_editor/birefnet/remove_bg", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ node_id: nodeId }),
            });
            const json = await resp.json();
            if (json.error) throw new Error(json.error);
            await this.commitMask(json.mask_b64);
        } catch (err) {
            this.lastError = err.message;
        } finally {
            this.isLoading = false;
            this._notify();
        }
    }

    /**
     * グレースケールマスク（data URL, PNG "L" mode）を drawCanvas に書き込む。
     * 白画素 = マスク領域として扱う。
     */
    commitMask(maskB64) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const W = this.drawCanvas.width;
                const H = this.drawCanvas.height;

                const off    = document.createElement("canvas");
                off.width    = W;
                off.height   = H;
                const offCtx = off.getContext("2d");
                offCtx.drawImage(img, 0, 0, W, H);

                const imgData = offCtx.getImageData(0, 0, W, H);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const lum = d[i];
                    d[i]     = 255;
                    d[i + 1] = 255;
                    d[i + 2] = 255;
                    d[i + 3] = lum;
                }
                offCtx.putImageData(imgData, 0, 0);

                const ctx = this.ctx;
                ctx.save();
                ctx.globalCompositeOperation =
                    this.mode === "erase" ? "destination-out" : "source-over";
                ctx.drawImage(off, 0, 0);
                ctx.restore();

                this._notifyChange();
                resolve();
            };
            img.onerror = resolve;
            img.src = maskB64;
        });
    }

    onMouseDown(_x, _y, _e) {}
    onMouseMove(_x, _y, _e) {}
    onMouseUp(_x, _y, _e)   {}
}
