/**
 * Composites visible layers onto a single grayscale mask canvas.
 * Each layer is an offscreen Canvas whose alpha channel represents the mask value.
 */
export class CanvasCompositor {
    /**
     * @param {Layer[]} layers
     * @param {number} width
     * @param {number} height
     * @returns {HTMLCanvasElement} grayscale mask canvas
     */
    composite(layers, width, height) {
        const result = document.createElement("canvas");
        result.width = width;
        result.height = height;
        const ctx = result.getContext("2d");

        for (const layer of [...layers].reverse()) { // 下のレイヤーから描画
            if (!layer.visible) continue;

            ctx.globalAlpha = layer.opacity;

            if (layer.operation === "subtract") {
                ctx.globalCompositeOperation = "destination-out";
            } else {
                // add: lighten で明るい方を採用
                ctx.globalCompositeOperation = "lighten";
            }

            ctx.drawImage(layer.canvas, 0, 0, width, height);
        }

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1.0;
        return result;
    }

    /**
     * Composite をプレビューキャンバスに描画する（クイックマスクスタイル）
     * @param {HTMLCanvasElement} previewCanvas
     * @param {Layer[]} layers
     * @param {boolean} showImage
     * @param {boolean} inverted
     * @param {string} overlayColor  "#rrggbb" 形式（省略時 "#ff0000"）
     */
    renderPreview(previewCanvas, layers, showImage = false, inverted = false, overlayColor = "#ff0000") {
        const w = previewCanvas.width;
        const h = previewCanvas.height;
        const ctx = previewCanvas.getContext("2d");
        ctx.clearRect(0, 0, w, h);

        const maskCanvas = this.composite(layers, w, h);

        const r = parseInt(overlayColor.slice(1, 3), 16);
        const g = parseInt(overlayColor.slice(3, 5), 16);
        const b = parseInt(overlayColor.slice(5, 7), 16);

        if (showImage) {
            if (inverted) {
                // Invert時: 描いた部分に選択色オーバーレイ（ブラシ色として可視化）
                ctx.drawImage(maskCanvas, 0, 0);
                ctx.globalCompositeOperation = "source-in";
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
                ctx.fillRect(0, 0, w, h);
                ctx.globalCompositeOperation = "source-over";
            } else {
                // 通常時: Photoshopクイックマスクスタイル（全体に色→描いた部分を除去）
                const overlay = document.createElement("canvas");
                overlay.width = w; overlay.height = h;
                const ovCtx = overlay.getContext("2d");
                ovCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
                ovCtx.fillRect(0, 0, w, h);
                ovCtx.globalCompositeOperation = "destination-out";
                ovCtx.drawImage(maskCanvas, 0, 0);
                ctx.drawImage(overlay, 0, 0);
            }
        } else {
            // 画像なし: inverted に応じてマスクを反転してから色オーバーレイ
            let displayMask = maskCanvas;
            if (inverted) {
                const inv = document.createElement("canvas");
                inv.width = w; inv.height = h;
                const invCtx = inv.getContext("2d");
                invCtx.fillStyle = "white";
                invCtx.fillRect(0, 0, w, h);
                invCtx.globalCompositeOperation = "destination-out";
                invCtx.drawImage(maskCanvas, 0, 0);
                invCtx.globalCompositeOperation = "source-over";
                displayMask = inv;
            }
            ctx.drawImage(displayMask, 0, 0);
            ctx.globalCompositeOperation = "source-in";
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
            ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = "source-over";
        }
    }
}
