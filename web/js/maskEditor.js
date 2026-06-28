// v0.1.6
import { app } from "../../../scripts/app.js";
import { MaskEditorModal } from "./editor/MaskEditorModal.js";
import { t } from "./editor/i18n.js";
import { registerMaskPreviewCallback, unregisterMaskPreviewCallback } from "./editor/nodeState.js";

const _modalCache = new Map();

// ノードごとの BG 画像 file input（共有）
let _bgFileInput = null;
function _getBgFileInput() {
    if (!_bgFileInput) {
        _bgFileInput = document.createElement("input");
        _bgFileInput.type = "file";
        _bgFileInput.accept = "image/*";
        _bgFileInput.style.display = "none";
        document.body.appendChild(_bgFileInput);
    }
    return _bgFileInput;
}

function openMaskEditor(node) {
    let modal = _modalCache.get(node.id);
    if (!modal) {
        modal = new MaskEditorModal(node);
        _modalCache.set(node.id, modal);
    }
    modal.open();
}

function hideLayerDataWidget(node) {
    const w = node.widgets?.find(w => w.name === "layer_data");
    if (!w) return;
    if (w.element) {
        w.element.style.display = "none";
        w.element.style.height  = "0";
        w.element.style.overflow = "hidden";
    }
    w.draw = () => {};
    w.computeSize = () => [0, -4];
}

// BG 画像をサーバーキャッシュに送信
function _storeBgImage(nodeId, dataUrl) {
    fetch("/mask_editor/store_image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ node_id: String(nodeId), bg_image_b64: dataUrl }),
    }).catch(() => {});
}

// Image オブジェクトを非同期ロード
function _loadImage(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

// ノードプレビューの高さ
const PREVIEW_H = 160;

app.registerExtension({
    name: "ComfyUI.MaskEditorOne",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "MaskEditorOne") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origOnNodeCreated ? origOnNodeCreated.apply(this, arguments) : undefined;
            const node = this;

            hideLayerDataWidget(node);

            // ─── マスクプレビューコールバック登録 ──────────
            // node オブジェクトをキーにする（onNodeCreated 時点では id=-1 のため id は使わない）
            registerMaskPreviewCallback(node, (maskDataUrl) => {
                node._maskDataUrl = maskDataUrl;
                _loadImage(maskDataUrl).then(img => {
                    node._maskImg = img;
                    node._previewMode = "mask";
                    // mask表示中 → ボタンは「画像に切り替え」を示す
                    if (node._viewWidget) node._viewWidget.name = t("node.showImage");
                    _resizeNode(node);
                    node.setDirtyCanvas(true, true);
                });
            });

            // ─── 状態 ──────────────────────────────────────
            node._bgDataUrl     = null;   // BG 選択画像の data URL
            node._bgImg         = null;   // BG Image オブジェクト
            node._maskDataUrl   = null;   // Apply 後のマスクプレビュー data URL
            node._maskImg       = null;   // マスク Image オブジェクト
            node._previewMode   = "image"; // "image" | "mask"

            // ─── BG ボタン ─────────────────────────────────
            const bgWidget = node.addWidget("button", t("node.loadImage"), null, () => {
                const input = _getBgFileInput();
                input.onchange = null;
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    await _loadFileAsBg(node, file);
                    input.value = "";
                };
                input.click();
            });
            node._bgWidget = bgWidget;

            // ─── IMG / MASK 切り替えボタン ─────────────────
            // ボタン名は「次にクリックすると切り替わる先」を示す
            const viewWidget = node.addWidget("button", t("node.showMask"), null, () => {
                node._previewMode = node._previewMode === "image" ? "mask" : "image";
                viewWidget.name   = node._previewMode === "image" ? t("node.showMask") : t("node.showImage");
                _resizeNode(node);
                node.setDirtyCanvas(true, true);
            });
            node._viewWidget = viewWidget;

            // ─── Edit Mask ボタン ──────────────────────────
            node._editMaskWidget = node.addWidget("button", t("node.editMask"), null, () => openMaskEditor(node));

            // ─── プレビュー描画（常時表示・ドロップゾーン兼用） ───
            node.onDrawForeground = function (ctx) {
                if (this.flags.collapsed) return;

                const margin = 6;
                const x = margin;
                const y = this.size[1] - PREVIEW_H - margin;
                const w = this.size[0] - margin * 2;
                const h = PREVIEW_H;

                ctx.fillStyle = "#111";
                ctx.fillRect(x, y, w, h);

                const img = this._previewMode === "mask" ? this._maskImg : this._bgImg;
                if (img) {
                    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
                    const dw = img.naturalWidth  * scale;
                    const dh = img.naturalHeight * scale;
                    const dx = x + (w - dw) / 2;
                    const dy = y + (h - dh) / 2;
                    ctx.drawImage(img, dx, dy, dw, dh);

                    ctx.fillStyle = "rgba(0,0,0,0.55)";
                    ctx.fillRect(x, y, 52, 16);
                    ctx.fillStyle = "#ccc";
                    ctx.font = "10px sans-serif";
                    ctx.fillText(this._previewMode === "image" ? "IMAGE" : "MASK", x + 4, y + 11);
                } else {
                    ctx.strokeStyle = "#444";
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
                    ctx.setLineDash([]);
                    ctx.fillStyle = "#666";
                    ctx.font = "12px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("Drop image here", x + w / 2, y + h / 2);
                    ctx.textAlign = "left";
                    ctx.textBaseline = "alphabetic";
                }
            };

            // ─── プレビューエリアへのファイルドロップ ─────────
            const _cnvEl = app.canvas.canvas;

            const _onDragOver = (e) => {
                if (!e.dataTransfer?.items) return;
                const hasImg = [...e.dataTransfer.items].some(
                    it => it.kind === "file" && it.type.startsWith("image/")
                );
                if (!hasImg) return;
                const [gx, gy] = _graphPos(e);
                if (_inPreview(node, gx, gy)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "copy";
                }
            };

            const _onDrop = (e) => {
                const [gx, gy] = _graphPos(e);
                if (!_inPreview(node, gx, gy)) return;
                const file = [...(e.dataTransfer?.files ?? [])].find(
                    f => f.type.startsWith("image/")
                );
                if (!file) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                _loadFileAsBg(node, file);
            };

            _cnvEl.addEventListener("dragover", _onDragOver, { capture: true });
            _cnvEl.addEventListener("drop",     _onDrop,     { capture: true });
            node._cleanupDropHandlers = () => {
                _cnvEl.removeEventListener("dragover", _onDragOver, { capture: true });
                _cnvEl.removeEventListener("drop",     _onDrop,     { capture: true });
            };

            _resizeNode(node);
            return r;
        };

        // ComfyUI の自動プレビュー（onDrawBackground → updatePreviews → node.imgs）を抑制
        // onDrawBackground は毎フレーム呼ばれ nodeOutputStore から node.imgs を設定するため
        // onExecuted での null クリアでは効果がなく、ここで完全にスキップする必要がある
        nodeType.prototype.onDrawBackground = function () {
            // no-op: 独自プレビューは onDrawForeground で描画するため自動プレビューは不要
        };

        // ワークフロー読み込み後も layer_data を非表示に保つ
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            hideLayerDataWidget(this);
            _resizeNode(this);
        };

        // ノード削除時にモーダルキャッシュ・コールバック・ドロップハンドラをクリア
        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            _modalCache.delete(this.id);
            unregisterMaskPreviewCallback(this);
            this._cleanupDropHandlers?.();
            if (origOnRemoved) origOnRemoved.apply(this, arguments);
        };
    },
});

// プレビューエリアは常時表示 — 常に PREVIEW_H を加算
function _resizeNode(node) {
    const base = node.computeSize();
    node.size[0] = base[0];
    node.size[1] = base[1] + PREVIEW_H + 8;
}

// イベント座標をグラフ座標に変換
function _graphPos(e) {
    const cnv = app.canvas.canvas;
    const rect = cnv.getBoundingClientRect();
    const ds   = app.canvas.ds;
    const ratio = cnv.width / rect.width;
    const cx = (e.clientX - rect.left) * ratio;
    const cy = (e.clientY - rect.top)  * ratio;
    return [cx / ds.scale - ds.offset[0], cy / ds.scale - ds.offset[1]];
}

// グラフ座標がノードのプレビューエリア内かどうか判定
function _inPreview(node, gx, gy) {
    if (node.flags?.collapsed) return false;
    const m = 6;
    return (
        gx >= node.pos[0] + m &&
        gx <= node.pos[0] + node.size[0] - m &&
        gy >= node.pos[1] + node.size[1] - PREVIEW_H - m &&
        gy <= node.pos[1] + node.size[1] - m
    );
}

// ファイルを BG 画像として読み込む（ボタン・ドロップ共用）
async function _loadFileAsBg(node, file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            node._bgDataUrl   = dataUrl;
            node._bgImg       = await _loadImage(dataUrl);
            node._previewMode = "image";
            if (node._viewWidget) node._viewWidget.name = t("node.showMask");
            _storeBgImage(node.id, dataUrl);
            const lw = node.widgets?.find(w => w.name === "layer_data");
            if (lw) lw.value = "{}";
            _resizeNode(node);
            node.setDirtyCanvas(true, true);
            _modalCache.get(node)?.reloadBackground(dataUrl);
            resolve();
        };
        reader.readAsDataURL(file);
    });
}

