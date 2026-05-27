import { BaseTool } from "./BaseTool.js";

export class Sam3Tool extends BaseTool {
    constructor(drawCanvas, bgCanvas) {
        super(drawCanvas, bgCanvas);
        this.mode      = "add";   // "add" | "erase"
        this.modelName = null;    // 選択中のモデルファイル名 (null = 自動選択)
        this.results   = [];      // [{mask_b64, score, area}, ...]
        this.isLoading = false;
        this.lastError = null;
        this._onResultsChange = null;
    }

    onResultsChange(fn) {
        this._onResultsChange = fn;
    }

    _notifyResultsChange() {
        this._onResultsChange?.();
    }

    /** プロンプトでセグメンテーションを実行する。*/
    async runInference(nodeId, prompt, maxMasks = 9) {
        this.isLoading = true;
        this.lastError = null;
        this._notifyResultsChange();

        try {
            const resp = await fetch("/mask_editor/sam3/segment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node_id: nodeId, prompt, max_masks: maxMasks, model: this.modelName }),
            });
            const json = await resp.json();
            if (json.error) throw new Error(json.error);
            this.results = json.masks || [];
        } catch (err) {
            this.lastError = err.message;
            this.results   = [];
        } finally {
            this.isLoading = false;
            this._notifyResultsChange();
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

                // オフスクリーンで luminance → RGBA 変換
                const off    = document.createElement("canvas");
                off.width    = W;
                off.height   = H;
                const offCtx = off.getContext("2d");
                offCtx.drawImage(img, 0, 0, W, H);

                const imgData = offCtx.getImageData(0, 0, W, H);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const lum = d[i]; // R = grayscale value
                    d[i]     = 255;
                    d[i + 1] = 255;
                    d[i + 2] = 255;
                    d[i + 3] = lum;  // α = 輝度（マスク領域のみ不透明）
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

    // Sam3Tool はマウスでキャンバスを直接描画しない
    onMouseDown(_x, _y, _e) {}
    onMouseMove(_x, _y, _e) {}
    onMouseUp(_x, _y, _e)   {}
}
