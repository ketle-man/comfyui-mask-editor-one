export class BaseTool {
    /**
     * @param {HTMLCanvasElement} drawCanvas - アクティブレイヤーの canvas
     * @param {HTMLCanvasElement} bgCanvas   - 背景画像 canvas (参照用)
     */
    constructor(drawCanvas, bgCanvas) {
        this.drawCanvas = drawCanvas;
        this.bgCanvas = bgCanvas;
        this.ctx = drawCanvas.getContext("2d");
        this._onChangeCallback = null;
    }

    get width()  { return this.drawCanvas.width; }
    get height() { return this.drawCanvas.height; }

    /** アクティブレイヤーが切り替わったとき呼ぶ */
    setCanvas(canvas) {
        this.drawCanvas = canvas;
        this.ctx = canvas.getContext("2d");
    }

    /** レイヤー変更通知コールバックを登録 */
    onChange(fn) { this._onChangeCallback = fn; }

    _notifyChange() {
        if (this._onChangeCallback) this._onChangeCallback();
    }

    activate() {}
    deactivate() {}

    onMouseDown(_x, _y, _e) {}
    onMouseMove(_x, _y, _e) {}
    onMouseUp(_x, _y, _e) {}
    onMouseLeave() {}

    /** canvas 座標に変換（スケール考慮） */
    static getCanvasPos(canvas, event) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top)  * scaleY,
        };
    }
}
