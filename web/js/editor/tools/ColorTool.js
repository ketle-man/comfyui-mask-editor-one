import { BaseTool } from "./BaseTool.js";

export class ColorTool extends BaseTool {
    constructor(drawCanvas, bgCanvas) {
        super(drawCanvas, bgCanvas);
        this.tolerance = 40;  // 0-255
        this.feather   = 5;   // 0-20
        this.mode      = "add"; // "add" | "subtract"
    }

    activate() {
        this.drawCanvas.style.cursor = "crosshair";
    }

    onMouseDown(x, y) {
        this._selectByColor(Math.round(x), Math.round(y));
    }

    _selectByColor(px, py) {
        const bgCtx = this.bgCanvas.getContext("2d");
        const w = this.bgCanvas.width;
        const h = this.bgCanvas.height;

        if (w === 0 || h === 0) return;

        const srcData = bgCtx.getImageData(0, 0, w, h);
        const idx = (Math.round(py) * w + Math.round(px)) * 4;

        // 範囲外クリックは無視
        if (idx < 0 || idx + 3 >= srcData.data.length) return;

        const tr = srcData.data[idx];
        const tg = srcData.data[idx + 1];
        const tb = srcData.data[idx + 2];

        // マスクデータを生成 (グレースケール)
        const outData = new Uint8ClampedArray(w * h * 4);
        const tol = this.tolerance;

        for (let i = 0; i < srcData.data.length; i += 4) {
            const r = srcData.data[i];
            const g = srcData.data[i + 1];
            const b = srcData.data[i + 2];

            const dist = Math.sqrt(
                (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2
            );

            let alpha;
            if (tol <= 0) {
                alpha = dist === 0 ? 255 : 0;
            } else {
                // feather: tolerance の端でなだらかにフェードアウト
                const featherStart = tol * (1 - this.feather / 100);
                if (dist <= featherStart) {
                    alpha = 255;
                } else if (dist <= tol) {
                    alpha = Math.round(255 * (1 - (dist - featherStart) / (tol - featherStart)));
                } else {
                    alpha = 0;
                }
            }

            const j = i;
            outData[j]     = 255;
            outData[j + 1] = 255;
            outData[j + 2] = 255;
            outData[j + 3] = alpha;
        }

        const ctx = this.ctx;
        const maskImage = new ImageData(outData, w, h);

        if (this.mode === "subtract") {
            // 既存マスクから新しい選択を引く
            const tmp = document.createElement("canvas");
            tmp.width = w;
            tmp.height = h;
            const tmpCtx = tmp.getContext("2d");
            tmpCtx.putImageData(maskImage, 0, 0);

            ctx.globalCompositeOperation = "destination-out";
            ctx.drawImage(tmp, 0, 0);
            ctx.globalCompositeOperation = "source-over";
        } else {
            // 加算: screen 合成で上乗せ
            const tmp = document.createElement("canvas");
            tmp.width = w;
            tmp.height = h;
            tmp.getContext("2d").putImageData(maskImage, 0, 0);

            ctx.globalCompositeOperation = "lighten";
            ctx.drawImage(tmp, 0, 0);
            ctx.globalCompositeOperation = "source-over";
        }

        this._notifyChange();
    }
}
