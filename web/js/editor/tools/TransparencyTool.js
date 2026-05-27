import { BaseTool } from "./BaseTool.js";

export class TransparencyTool extends BaseTool {
    constructor(drawCanvas, bgCanvas) {
        super(drawCanvas, bgCanvas);
        this.threshold    = 128; // アルファ値の閾値 (0-255)
        this.invert       = false;
        this._sourceImage = null; // HTMLImageElement (元の入力画像)
    }

    activate() {
        this.drawCanvas.style.cursor = "default";
    }

    /** モーダルから元画像を渡す */
    setSourceImage(img) {
        this._sourceImage = img;
    }

    /**
     * 入力画像（RGBA）のアルファチャンネルをマスクとして抽出する。
     * モーダルの「Extract Alpha」ボタンから呼ばれる。
     */
    extract() {
        const w = this.width;
        const h = this.height;

        // 元画像がある場合はそちらから（bgCanvasは opacity 0.85 で描画されているため不正確）
        if (this._sourceImage) {
            const tmp    = document.createElement("canvas");
            tmp.width  = w;
            tmp.height = h;
            const tmpCtx = tmp.getContext("2d");
            tmpCtx.drawImage(this._sourceImage, 0, 0, w, h);
            this._extractFromImageData(tmpCtx.getImageData(0, 0, w, h));
        } else {
            // フォールバック: bgCanvas から取得
            const bgCtx  = this.bgCanvas.getContext("2d");
            this._extractFromImageData(bgCtx.getImageData(0, 0, w, h));
        }
    }

    _extractFromImageData(srcData) {
        const w = srcData.width;
        const h = srcData.height;
        const outData = new Uint8ClampedArray(w * h * 4);

        for (let i = 0; i < srcData.data.length; i += 4) {
            let a = srcData.data[i + 3];

            if (this.threshold > 0) {
                a = a >= this.threshold ? 255 : 0;
            }

            if (this.invert) a = 255 - a;

            outData[i]     = 255;
            outData[i + 1] = 255;
            outData[i + 2] = 255;
            outData[i + 3] = a;
        }

        const maskImage = new ImageData(outData, w, h);
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.putImageData(maskImage, 0, 0);
        this._notifyChange();
    }
}
