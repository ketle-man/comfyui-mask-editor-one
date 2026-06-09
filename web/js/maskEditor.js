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
            registerMaskPreviewCallback(node.id, (maskDataUrl) => {
                node._maskDataUrl = maskDataUrl;
                _loadImage(maskDataUrl).then(img => {
                    node._maskImg = img;
                    node._previewMode = "mask";
                    if (node._viewWidget) node._viewWidget.name = t("node.showMask");
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
            const bgWidget = node.addWidget("button", t("footer.bg"), null, () => {
                if (node._bgDataUrl) {
                    // 選択済み → クリア
                    node._bgDataUrl = null;
                    node._bgImg     = null;
                    bgWidget.name   = t("footer.bg");
                    _storeBgImage(node.id, null);
                    _resizeNode(node);
                    node.setDirtyCanvas(true, true);
                    _modalCache.get(node)?.reloadBackground(null);
                } else {
                    // 未選択 → ファイル選択ダイアログ
                    const input = _getBgFileInput();
                    input.onchange = null;
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                            const dataUrl = ev.target.result;
                            node._bgDataUrl = dataUrl;
                            node._bgImg     = await _loadImage(dataUrl);
                            bgWidget.name   = t("node.bgClear");
                            _storeBgImage(node.id, dataUrl);
                            if (node._previewMode === "image") {
                                _resizeNode(node);
                                node.setDirtyCanvas(true, true);
                            }
                            _modalCache.get(node)?.reloadBackground(dataUrl);
                        };
                        reader.readAsDataURL(file);
                        input.value = "";
                    };
                    input.click();
                }
            });
            node._bgWidget = bgWidget;

            // ─── IMG / MASK 切り替えボタン ─────────────────
            const viewWidget = node.addWidget("button", t("node.showImage"), null, () => {
                node._previewMode = node._previewMode === "image" ? "mask" : "image";
                viewWidget.name   = node._previewMode === "image" ? t("node.showImage") : t("node.showMask");
                _resizeNode(node);
                node.setDirtyCanvas(true, true);
            });
            node._viewWidget = viewWidget;

            // ─── Edit Mask ボタン ──────────────────────────
            node._editMaskWidget = node.addWidget("button", t("node.editMask"), null, () => openMaskEditor(node));

            // ─── プレビュー描画 ────────────────────────────
            node.onDrawForeground = function (ctx) {
                if (this.flags.collapsed) return;

                const img = this._previewMode === "mask" ? this._maskImg : this._bgImg;
                if (!img) return;

                const margin = 6;
                const x = margin;
                const y = this.size[1] - PREVIEW_H - margin;
                const w = this.size[0] - margin * 2;
                const h = PREVIEW_H;

                // 背景（チェッカー or 黒）
                ctx.fillStyle = "#111";
                ctx.fillRect(x, y, w, h);

                // アスペクト比を維持してセンタリング
                const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
                const dw    = img.naturalWidth  * scale;
                const dh    = img.naturalHeight * scale;
                const dx    = x + (w - dw) / 2;
                const dy    = y + (h - dh) / 2;
                ctx.drawImage(img, dx, dy, dw, dh);

                // モードラベル
                ctx.fillStyle = "rgba(0,0,0,0.55)";
                ctx.fillRect(x, y, 52, 16);
                ctx.fillStyle = "#ccc";
                ctx.font = "10px sans-serif";
                ctx.fillText(this._previewMode === "image" ? "IMAGE" : "MASK", x + 4, y + 11);
            };

            _resizeNode(node);
            return r;
        };

        // ワークフロー読み込み後も layer_data を非表示に保つ
        const origOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            hideLayerDataWidget(this);
            _resizeNode(this);
        };

        // ノード削除時にモーダルキャッシュとコールバックをクリア
        const origOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            _modalCache.delete(this.id);
            unregisterMaskPreviewCallback(this.id);
            if (origOnRemoved) origOnRemoved.apply(this, arguments);
        };
    },
});

// プレビューの有無に応じてノードをリサイズ
function _resizeNode(node) {
    const hasPreview = !!(
        (node._previewMode === "image" && node._bgImg) ||
        (node._previewMode === "mask"  && node._maskImg)
    );

    // computeSize を一時的にオーバーライドしてプレビュー分を加算
    const base = node.computeSize();
    node.size[0] = base[0];
    node.size[1] = base[1] + (hasPreview ? PREVIEW_H + 8 : 0);
}

