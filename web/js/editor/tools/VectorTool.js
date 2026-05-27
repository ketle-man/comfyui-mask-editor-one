import { BaseTool } from "./BaseTool.js";

const CLOSE_RADIUS = 12; // canvas px: 最初のポイントに「吸着」する距離

export class VectorTool extends BaseTool {
    constructor(drawCanvas, bgCanvas) {
        super(drawCanvas, bgCanvas);
        this.mode           = "add"; // "add" | "erase"
        this._points        = [];    // {x, y}[]
        this._hoverX        = null;
        this._hoverY        = null;
        this._previewCanvas = null;  // setPreviewCanvas() で設定

        // MaskEditorModal から差し込む: undo 保存タイミングをコントロール
        this.onBeforeCommit = null;
    }

    /** プレビュー専用キャンバスを設定する（MaskEditorModal が呼ぶ） */
    setPreviewCanvas(canvas) {
        this._previewCanvas = canvas;
    }

    // ────────────────────────────────────────────
    // BaseTool override
    // ────────────────────────────────────────────

    activate() {
        this.drawCanvas.style.cursor = "crosshair";
        this._renderPreview();
    }

    deactivate() {
        this.drawCanvas.style.cursor = "";
        this._clearPreview();
    }

    /** ツール切り替えやリセット時にポイントをクリア */
    reset() {
        this._points = [];
        this._hoverX = null;
        this._hoverY = null;
        this._clearPreview();
    }

    onMouseDown(x, y) {
        if (this._points.length >= 3) {
            const first = this._points[0];
            if (Math.hypot(x - first.x, y - first.y) <= CLOSE_RADIUS) {
                this._commitPath(true); // 閉じたパス
                return;
            }
        }
        this._points.push({ x, y });
        this._renderPreview();
    }

    onMouseMove(x, y) {
        this._hoverX = x;
        this._hoverY = y;
        this._renderPreview();
    }

    onMouseLeave() {
        this._hoverX = null;
        this._hoverY = null;
        this._renderPreview();
    }

    /** MaskEditorModal からキーボードイベントを転送してもらう */
    onKeyDown(e) {
        if (e.key === "Escape") {
            e.preventDefault();
            this.reset();
        } else if (e.key === "Enter" && this._points.length >= 2) {
            e.preventDefault();
            this._commitPath(false); // 開いたパス
        } else if ((e.key === "Backspace" || e.key === "Delete") && this._points.length > 0) {
            e.preventDefault();
            this._points.pop();
            this._renderPreview();
        }
    }

    // ────────────────────────────────────────────
    // パス確定 → drawCanvas に描画
    // ────────────────────────────────────────────

    _commitPath(closed) {
        if (this._points.length < 2) return;

        if (this.onBeforeCommit) this.onBeforeCommit(); // undo を保存

        const ctx = this.ctx;
        ctx.save();
        if (this.mode === "erase") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = "rgba(0,0,0,1)";
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = "white";
        }

        ctx.beginPath();
        this._buildSplinePath(ctx, this._points, closed);
        ctx.fill();
        ctx.restore();

        this.reset();
        this._notifyChange();
    }

    // ────────────────────────────────────────────
    // Catmull-Rom → Bézier 変換でパスを構築
    // ────────────────────────────────────────────

    /**
     * Catmull-Rom スプラインを Canvas2D の bezierCurveTo に変換して描画。
     * closed=true のとき最後のポイントから最初へつながる閉じたパスを生成。
     */
    _buildSplinePath(ctx, pts, closed) {
        const n = pts.length;
        if (n === 0) return;
        if (n === 1) { ctx.moveTo(pts[0].x, pts[0].y); return; }
        if (n === 2) {
            ctx.moveTo(pts[0].x, pts[0].y);
            ctx.lineTo(pts[1].x, pts[1].y);
            if (closed) ctx.closePath();
            return;
        }

        // 制御点の配列（両端ダミーを追加して Catmull-Rom の端点処理を統一）
        let extended;
        if (closed) {
            extended = [pts[n - 1], ...pts, pts[0], pts[1]];
        } else {
            // 端点を折り返し複製（自然端条件と同等）
            extended = [
                { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y },
                ...pts,
                { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y },
            ];
        }

        ctx.moveTo(extended[1].x, extended[1].y);
        const count = closed ? n : n - 1;
        for (let i = 0; i < count; i++) {
            const p0 = extended[i];
            const p1 = extended[i + 1];
            const p2 = extended[i + 2];
            const p3 = extended[i + 3];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        if (closed) ctx.closePath();
    }

    // ────────────────────────────────────────────
    // プレビュー描画
    // ────────────────────────────────────────────

    _renderPreview() {
        if (!this._previewCanvas) return;
        const pctx = this._previewCanvas.getContext("2d");
        const w = this._previewCanvas.width;
        const h = this._previewCanvas.height;
        pctx.clearRect(0, 0, w, h);

        const pts  = this._points;
        const hx   = this._hoverX;
        const hy   = this._hoverY;
        if (pts.length === 0 && hx === null) return;

        // ── 確定済みのスプラインパス ──
        if (pts.length >= 2) {
            pctx.save();
            pctx.strokeStyle = "rgba(255, 210, 40, 0.9)";
            pctx.lineWidth   = 1.5;
            pctx.setLineDash([]);
            pctx.beginPath();
            this._buildSplinePath(pctx, pts, false);
            pctx.stroke();
            pctx.restore();
        }

        // ── マウス位置へのルバーバンド線 ──
        if (pts.length >= 1 && hx !== null) {
            // 閉じることができる場合は閉じパスプレビューも描く
            const first = pts[0];
            const canClose = pts.length >= 3
                && Math.hypot(hx - first.x, hy - first.y) <= CLOSE_RADIUS;

            if (canClose && pts.length >= 3) {
                // 閉じたスプラインのプレビュー（薄め）
                const preview = [...pts, { x: hx, y: hy }];
                pctx.save();
                pctx.strokeStyle = "rgba(255, 100, 100, 0.55)";
                pctx.lineWidth   = 1.5;
                pctx.setLineDash([4, 3]);
                pctx.beginPath();
                this._buildSplinePath(pctx, pts, true);
                pctx.stroke();
                pctx.restore();
            } else {
                pctx.save();
                pctx.strokeStyle = "rgba(255, 210, 40, 0.5)";
                pctx.lineWidth   = 1;
                pctx.setLineDash([4, 3]);
                pctx.beginPath();
                pctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
                pctx.lineTo(hx, hy);
                pctx.stroke();
                pctx.restore();
            }
        }

        // ── アンカーポイント ──
        for (let i = 0; i < pts.length; i++) {
            const p       = pts[i];
            const isFirst = i === 0;
            const closeable = isFirst && pts.length >= 3 && hx !== null
                && Math.hypot(hx - p.x, hy - p.y) <= CLOSE_RADIUS;

            pctx.beginPath();
            pctx.arc(p.x, p.y, closeable ? 7 : (isFirst ? 5 : 4), 0, Math.PI * 2);
            pctx.fillStyle   = closeable
                ? "rgba(255, 80, 80, 0.95)"
                : (isFirst ? "rgba(255, 210, 40, 0.95)" : "rgba(255, 210, 40, 0.8)");
            pctx.strokeStyle = "rgba(0,0,0,0.6)";
            pctx.lineWidth   = 1;
            pctx.fill();
            pctx.stroke();
        }

        // ── ホバーポイント（まだ確定していない位置） ──
        if (hx !== null) {
            const onFirst = pts.length >= 3
                && Math.hypot(hx - pts[0].x, hy - pts[0].y) <= CLOSE_RADIUS;
            if (!onFirst) {
                pctx.beginPath();
                pctx.arc(hx, hy, 3, 0, Math.PI * 2);
                pctx.fillStyle   = "rgba(255, 255, 255, 0.6)";
                pctx.strokeStyle = "rgba(200, 200, 200, 0.5)";
                pctx.lineWidth   = 1;
                pctx.fill();
                pctx.stroke();
            }
        }
    }

    _clearPreview() {
        if (!this._previewCanvas) return;
        const pctx = this._previewCanvas.getContext("2d");
        pctx.clearRect(0, 0, this._previewCanvas.width, this._previewCanvas.height);
    }
}
