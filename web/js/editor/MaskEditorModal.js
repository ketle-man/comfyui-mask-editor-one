import { LayerManager } from "./LayerManager.js";
import { CanvasCompositor } from "./CanvasCompositor.js";
import { PaintTool } from "./tools/PaintTool.js";
import { ColorTool } from "./tools/ColorTool.js";
import { TransparencyTool } from "./tools/TransparencyTool.js";
import { TextTool } from "./tools/TextTool.js";
import { VectorTool } from "./tools/VectorTool.js";
import { ShapeTool } from "./tools/ShapeTool.js";
import { Sam3Tool } from "./tools/Sam3Tool.js";
import { BiRefNetTool } from "./tools/BiRefNetTool.js";
import { BaseTool } from "./tools/BaseTool.js";
import { BrushLibrary } from "./BrushLibrary.js";
import { notifyMaskPreviewUpdate } from "./nodeState.js";
import { t, getLang, setLang } from "./i18n.js";

const CSS_URL = new URL("../../css/maskEditor.css", import.meta.url);

let _cssLoaded = false;
function ensureCSS() {
    if (_cssLoaded) return;
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = CSS_URL.href;
    document.head.appendChild(link);
    _cssLoaded = true;
}

const CANVAS_SIZE = 512;

const TOOL_DEFS = [
    { id: "paint",        icon: "✏️" },
    { id: "color",        icon: "🎨" },
    { id: "transparency", icon: "🔲" },
    { id: "text",         icon: "T"  },
    { id: "vector",       icon: "✦"  },
    { id: "shape",        icon: "⬜" },
    { id: "sam3",         icon: "✨" },
    { id: "birefnet",     icon: "🔲" },
];

export class MaskEditorModal {
    constructor(node) {
        this.node        = node;
        this._overlay    = null;
        this._activeTool = "paint";
        this._showImage  = true;
        this._inverted   = false;
        this._blurRadius    = 0;
        this._overlayColor  = "#ff0000";
        this._tools         = {};
        this._undoStack  = [];
        this._redoStack  = [];
        this._layerMgr   = null;
        this._compositor = new CanvasCompositor();
        this._bgImage    = null;
        this._canvasW    = CANVAS_SIZE;
        this._canvasH    = CANVAS_SIZE;
        this._painting   = false;
        this._zoom       = 1.0;
        this._zoomMin    = 0.05;
        this._zoomMax    = 8.0;
        this._brushLib   = new BrushLibrary();
    }

    // ────────────────────────────────────────────
    // Public
    // ────────────────────────────────────────────

    async open() {
        ensureCSS();

        if (this._overlay) {
            this._overlay.style.display = "flex";
            // invert_mask ウィジェットの現在値をチェックボックスに同期
            const invW = this._getInvertWidget();
            if (invW !== null) {
                this._inverted = !!invW.value;
                this._invertCheck.checked = this._inverted;
            }
            // blur_radius ウィジェットの現在値をスライダーに同期
            const blurW = this._getBlurWidget();
            if (blurW !== null) {
                this._blurRadius = blurW.value ?? 0;
                this._blurSlider.value = this._blurRadius;
                this._blurNum.value    = this._blurRadius;
            }
            requestAnimationFrame(() => this._fitToView());
            // BG が変わっている可能性があるので再ロード
            await this._loadNodeImage();
            this._loadActiveLayerToDrawCanvas();
            this._renderBg();
            this._updatePreview();
            return;
        }

        this._buildDOM();
        document.body.appendChild(this._overlay);

        await this._loadNodeImage();

        // 保存済み layer_data を復元
        const layerWidget = this._getLayerWidget();
        if (layerWidget?.value && layerWidget.value !== "{}") {
            try {
                const json = JSON.parse(layerWidget.value);
                await this._layerMgr.fromJSON(json);
                // 後方互換: layer_data.inverted を invert_mask ウィジェットに移行
                if (json.inverted !== undefined) {
                    const invW = this._getInvertWidget();
                    if (invW) invW.value = json.inverted;
                }
            } catch { /* 無効な JSON は無視 */ }
        }

        // invert_mask ウィジェットの現在値でチェックボックスを初期化
        const invWidget = this._getInvertWidget();
        this._inverted = invWidget ? !!invWidget.value : false;
        this._invertCheck.checked = this._inverted;

        // blur_radius ウィジェットの現在値でスライダーを初期化
        const blurWidget = this._getBlurWidget();
        this._blurRadius = blurWidget ? (blurWidget.value ?? 0) : 0;
        this._blurSlider.value = this._blurRadius;
        this._blurNum.value    = this._blurRadius;

        if (this._layerMgr.layers.length === 0) {
            if (this._bgImage) {
                this._imageToMaskLayer(this._bgImage);
            } else {
                this._layerMgr.addLayer("paint", t("layers.defaultName", { n: 1 }));
            }
        }

        this._refreshLayerList();
        this._loadActiveLayerToDrawCanvas();
        this._renderBg();
        this._updatePreview();
        this._renderToolOptions(this._activeTool);
        // DOM が描画された後にフィット計算
        requestAnimationFrame(() => this._fitToView());
    }

    close() {
        if (this._overlay) this._overlay.style.display = "none";
    }

    // ────────────────────────────────────────────
    // DOM 構築
    // ────────────────────────────────────────────

    _buildDOM() {
        const overlay = document.createElement("div");
        overlay.className = "me-overlay";
        this._overlay = overlay;

        const modal = document.createElement("div");
        modal.className = "me-modal";
        overlay.appendChild(modal);

        modal.appendChild(this._buildHeader());

        const body = document.createElement("div");
        body.className = "me-body";
        body.appendChild(this._buildToolbar());
        body.appendChild(this._buildCanvasArea());
        body.appendChild(this._buildRightPanel());
        modal.appendChild(body);

        modal.appendChild(this._buildFooter());

        overlay.addEventListener("mousedown", e => {
            if (e.target === overlay) this.close();
        });

        // vector ツールのキーボードショートカット（モーダルが表示中のみ有効）
        this._keyHandler = (e) => {
            if (this._overlay?.style.display === "none") return;
            if (this._activeTool === "vector") {
                this._tools.vector?.onKeyDown(e);
            }
        };
        document.addEventListener("keydown", this._keyHandler);
    }

    _buildHeader() {
        const header = document.createElement("div");
        header.className = "me-header";

        const title = document.createElement("span");
        title.className = "me-header-title";
        title.textContent = t("modal.title");
        header.appendChild(title);

        const closeBtn = document.createElement("button");
        closeBtn.className = "me-close-btn";
        closeBtn.textContent = "×";
        closeBtn.onclick = () => this.close();
        header.appendChild(closeBtn);

        return header;
    }

    _buildToolbar() {
        const bar = document.createElement("aside");
        bar.className = "me-toolbar";
        this._toolBtns = {};

        for (const def of TOOL_DEFS) {
            const btn = document.createElement("button");
            btn.className = "me-tool-btn" + (def.id === this._activeTool ? " active" : "");
            btn.title     = t("tool." + def.id);
            btn.innerHTML = `<span class="me-tool-icon">${def.icon}</span><span>${t("tool." + def.id)}</span>`;
            btn.dataset.tool = def.id;
            btn.onclick = () => this._selectTool(def.id);
            bar.appendChild(btn);
            this._toolBtns[def.id] = btn;
        }

        const sep = document.createElement("div");
        sep.className = "me-toolbar-sep";
        bar.appendChild(sep);

        const actions = [
            { key: "action.undo",  fn: () => this._undo() },
            { key: "action.redo",  fn: () => this._redo() },
            { key: "action.clear", fn: () => this._clearActiveLayer() },
            { key: "action.new",   fn: () => this._showNewDialog() },
        ];
        for (const a of actions) {
            const btn = document.createElement("button");
            btn.className = "me-action-btn";
            btn.textContent = t(a.key);
            btn.onclick = a.fn;
            bar.appendChild(btn);
        }

        return bar;
    }

    _buildCanvasArea() {
        const area = document.createElement("div");
        area.className = "me-canvas-area";
        this._canvasAreaEl = area;

        const container = document.createElement("div");
        container.className = "me-canvas-container";
        container.style.width  = this._canvasW + "px";
        container.style.height = this._canvasH + "px";
        this._canvasContainer = container;
        area.appendChild(container);

        // マウスホイールでズーム
        area.addEventListener("wheel", e => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            this._setZoom(this._zoom * delta);
        }, { passive: false });

        // キャンバスエリアへの画像ドロップでBGを設定
        area.addEventListener("dragenter", e => {
            if ([...e.dataTransfer.types].includes("Files")) {
                e.preventDefault();
                area.classList.add("drag-over");
            }
        });
        area.addEventListener("dragover", e => {
            if ([...e.dataTransfer.types].includes("Files")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
            }
        });
        area.addEventListener("dragleave", e => {
            if (!area.contains(e.relatedTarget)) area.classList.remove("drag-over");
        });
        area.addEventListener("drop", e => {
            e.preventDefault();
            area.classList.remove("drag-over");
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith("image/")) this._loadBgFromFile(file);
        });

        this._bgCanvas           = this._makeCanvas("me-bg-canvas",           0);
        this._drawCanvas         = this._makeCanvas("me-draw-canvas",          1);
        this._drawCanvas.style.opacity = "0"; // 描画内容はpreviewCanvasで表示
        this._previewCanvas      = this._makeCanvas("me-preview-canvas",       2);
        this._vectorPreviewCanvas = this._makeCanvas("me-vector-preview-canvas", 3);

        container.appendChild(this._bgCanvas);
        container.appendChild(this._drawCanvas);
        container.appendChild(this._previewCanvas);
        container.appendChild(this._vectorPreviewCanvas);

        // LayerManager を先に作成
        this._layerMgr = new LayerManager(this._canvasW, this._canvasH);
        this._layerMgr.on("change", () => {
            this._loadActiveLayerToDrawCanvas();
            this._refreshLayerList();
            this._updatePreview();
        });
        this._layerMgr.on("activeChange", () => {
            this._loadActiveLayerToDrawCanvas();
            this._refreshLayerList();
        });

        // ツールは常に _drawCanvas に描画
        this._tools.paint        = new PaintTool(this._drawCanvas, this._bgCanvas);
        this._tools.color        = new ColorTool(this._drawCanvas, this._bgCanvas);
        this._tools.transparency = new TransparencyTool(this._drawCanvas, this._bgCanvas);
        this._tools.text         = new TextTool(this._drawCanvas, this._bgCanvas);
        this._tools.vector       = new VectorTool(this._drawCanvas, this._bgCanvas);
        this._tools.vector.setPreviewCanvas(this._vectorPreviewCanvas);
        this._tools.vector.onBeforeCommit = () => this._saveUndoState();
        this._tools.shape        = new ShapeTool(this._drawCanvas, this._bgCanvas);
        this._tools.shape.setPreviewCanvas(this._vectorPreviewCanvas);
        this._tools.sam3         = new Sam3Tool(this._drawCanvas, this._bgCanvas);
        this._tools.birefnet     = new BiRefNetTool(this._drawCanvas, this._bgCanvas);

        // onChange: drawCanvas → layer.canvas に同期
        for (const tool of Object.values(this._tools)) {
            tool.onChange(() => {
                this._syncDrawToLayer();
                this._updatePreview();
                this._refreshLayerThumbnail();
            });
        }

        this._setupCanvasEvents();

        // 初期表示サイズを設定（fitToView は DOM 描画後に requestAnimationFrame で再計算）
        this._setZoom(1.0);

        return area;
    }

    _makeCanvas(id, zIndex) {
        const cv = document.createElement("canvas");
        cv.id = id;
        cv.width  = this._canvasW;
        cv.height = this._canvasH;
        cv.style.position = "absolute";
        cv.style.zIndex   = zIndex;
        // CSS表示サイズは _setZoom() で管理するのでここでは設定しない
        return cv;
    }

    _buildRightPanel() {
        const panel = document.createElement("aside");
        panel.className = "me-right-panel";

        this._toolOptionsEl = document.createElement("div");
        this._toolOptionsEl.className = "me-tool-options";
        panel.appendChild(this._toolOptionsEl);

        const layersPanel = document.createElement("div");
        layersPanel.className = "me-layers-panel";

        const layersHeader = document.createElement("div");
        layersHeader.className = "me-layers-header";

        const layersTitle = document.createElement("span");
        layersTitle.className = "me-layers-title";
        layersTitle.textContent = t("layers.title");
        layersHeader.appendChild(layersTitle);

        const addBtn = document.createElement("button");
        addBtn.className = "me-layer-add-btn";
        addBtn.textContent = "+";
        addBtn.title = t("layers.addTitle");
        addBtn.onclick = () => this._layerMgr.addLayer("paint");
        layersHeader.appendChild(addBtn);

        layersPanel.appendChild(layersHeader);

        this._layerListEl = document.createElement("ul");
        this._layerListEl.className = "me-layer-list";
        layersPanel.appendChild(this._layerListEl);

        panel.appendChild(layersPanel);
        return panel;
    }

    _buildFooter() {
        const footer = document.createElement("div");
        footer.className = "me-footer";

        const left = document.createElement("div");
        left.className = "me-footer-left";

        const showLabel = document.createElement("label");
        showLabel.className = "me-check-label";
        this._showImageCheck = document.createElement("input");
        this._showImageCheck.type    = "checkbox";
        this._showImageCheck.checked = this._showImage;
        this._showImageCheck.onchange = () => {
            this._showImage = this._showImageCheck.checked;
            this._renderBg();
            this._updatePreview();
        };
        showLabel.appendChild(this._showImageCheck);
        showLabel.appendChild(document.createTextNode(" " + t("footer.showImage")));
        left.appendChild(showLabel);

        const invertLabel = document.createElement("label");
        invertLabel.className = "me-check-label";
        this._invertCheck = document.createElement("input");
        this._invertCheck.type    = "checkbox";
        this._invertCheck.checked = this._inverted;
        this._invertCheck.onchange = () => {
            this._inverted = this._invertCheck.checked;
            this._updatePreview();
            // invert_mask ウィジェットに反映して連動
            const invW = this._getInvertWidget();
            if (invW) {
                invW.value = this._inverted;
                this.node.graph?.setDirtyCanvas(true);
            }
        };
        invertLabel.appendChild(this._invertCheck);
        invertLabel.appendChild(document.createTextNode(" " + t("footer.invert")));
        left.appendChild(invertLabel);

        const overlayColorPick = document.createElement("input");
        overlayColorPick.type  = "color";
        overlayColorPick.value = this._overlayColor;
        overlayColorPick.title = t("footer.overlayColor");
        overlayColorPick.style.cssText = "width:22px;height:18px;border:none;cursor:pointer;padding:0;margin-left:4px;vertical-align:middle;flex-shrink:0;";
        overlayColorPick.oninput = () => {
            this._overlayColor = overlayColorPick.value;
            this._updatePreview();
        };
        left.appendChild(overlayColorPick);

        // ─── Blur スライダー ────────────────────────────────
        const blurCtrl = document.createElement("div");
        blurCtrl.className = "me-blur-ctrl";
        blurCtrl.appendChild(Object.assign(document.createElement("span"), { textContent: t("footer.blur") }));

        this._blurSlider = document.createElement("input");
        this._blurSlider.type  = "range";
        this._blurSlider.min   = 0;
        this._blurSlider.max   = 200;
        this._blurSlider.step  = 1;
        this._blurSlider.value = this._blurRadius;

        this._blurNum = document.createElement("input");
        this._blurNum.type  = "number";
        this._blurNum.min   = 0;
        this._blurNum.max   = 200;
        this._blurNum.step  = 1;
        this._blurNum.value = this._blurRadius;

        const syncBlur = (v) => {
            v = Math.max(0, Math.min(200, Math.round(v)));
            this._blurRadius = v;
            this._blurSlider.value = v;
            this._blurNum.value    = v;
            this._previewCanvas.style.filter = v > 0 ? `blur(${v}px)` : "";
            const blurW = this._getBlurWidget();
            if (blurW) { blurW.value = v; this.node.graph?.setDirtyCanvas(true); }
        };
        this._blurSlider.oninput = () => syncBlur(parseFloat(this._blurSlider.value));
        this._blurNum.oninput    = () => syncBlur(parseFloat(this._blurNum.value) || 0);

        blurCtrl.appendChild(this._blurSlider);
        blurCtrl.appendChild(this._blurNum);
        left.appendChild(blurCtrl);

        const reloadBtn = document.createElement("button");
        reloadBtn.className = "me-btn-reload-image";
        reloadBtn.textContent = t("footer.reload");
        reloadBtn.title = t("footer.reloadTitle");
        reloadBtn.onclick = async () => {
            if (this.node._bgDataUrl) {
                await this._setBackgroundImage(this.node._bgDataUrl);
            } else {
                await this._loadNodeImage();
            }
            this._renderBg();
            this._updatePreview();
        };
        left.appendChild(reloadBtn);

        // ─── BG ドロップゾーン（クリック or ドロップで画像読み込み） ───
        this._bgFileInput = document.createElement("input");
        this._bgFileInput.type = "file";
        this._bgFileInput.accept = "image/*";
        this._bgFileInput.style.display = "none";
        this._bgFileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await this._loadBgFromFile(file);
            this._bgFileInput.value = "";
        };
        left.appendChild(this._bgFileInput);

        const dropZone = document.createElement("div");
        dropZone.className = "me-drop-zone";
        dropZone.textContent = t("footer.bg");
        dropZone.title = t("footer.bgTitle");
        dropZone.onclick = () => this._bgFileInput.click();
        dropZone.addEventListener("dragover", e => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
            dropZone.classList.add("drag-over");
        });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
        dropZone.addEventListener("drop", e => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove("drag-over");
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith("image/")) this._loadBgFromFile(file);
        });
        left.appendChild(dropZone);

        footer.appendChild(left);

        // ─── ズームコントロール（中央） ───
        const zoomCtrl = document.createElement("div");
        zoomCtrl.className = "me-zoom-ctrl";

        const fitBtn = document.createElement("button");
        fitBtn.className = "me-zoom-fit-btn";
        fitBtn.textContent = t("footer.fit");
        fitBtn.title = t("footer.fitTitle");
        fitBtn.onclick = () => this._fitToView();
        zoomCtrl.appendChild(fitBtn);

        this._zoomSlider = document.createElement("input");
        this._zoomSlider.type  = "range";
        this._zoomSlider.min   = Math.round(this._zoomMin * 100);
        this._zoomSlider.max   = Math.round(this._zoomMax * 100);
        this._zoomSlider.step  = "1";
        this._zoomSlider.value = "100";
        this._zoomSlider.className = "me-zoom-slider";
        this._zoomSlider.oninput = () => {
            this._setZoom(parseFloat(this._zoomSlider.value) / 100);
        };
        zoomCtrl.appendChild(this._zoomSlider);

        this._zoomLabel = document.createElement("span");
        this._zoomLabel.className = "me-zoom-label";
        this._zoomLabel.textContent = "100%";
        zoomCtrl.appendChild(this._zoomLabel);

        footer.appendChild(zoomCtrl);

        const right = document.createElement("div");
        right.className = "me-footer-right";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "me-btn-cancel";
        cancelBtn.textContent = t("footer.cancel");
        cancelBtn.onclick = () => this.close();
        right.appendChild(cancelBtn);

        const applyBtn = document.createElement("button");
        applyBtn.className = "me-btn-apply";
        applyBtn.textContent = t("footer.apply");
        applyBtn.onclick = () => this._apply();
        right.appendChild(applyBtn);

        const langSel = document.createElement("select");
        langSel.className = "me-lang-sel";
        langSel.title = t("footer.langTitle");
        [["en", "EN"], ["ja", "日本語"], ["zh", "中文"]].forEach(([v, l]) => {
            const o = document.createElement("option");
            o.value = v; o.textContent = l;
            if (v === getLang()) o.selected = true;
            langSel.appendChild(o);
        });
        langSel.onchange = () => {
            if (langSel.value === getLang()) return;
            if (!confirm(t("footer.langConfirm"))) { langSel.value = getLang(); return; }
            this._rebuildWithLang(langSel.value);
        };
        right.appendChild(langSel);

        footer.appendChild(right);
        return footer;
    }

    // ────────────────────────────────────────────
    // ツール管理
    // ────────────────────────────────────────────

    _selectTool(id) {
        const prev = this._tools[this._activeTool];
        // vector ツールから離れる時はパスをリセット
        if (this._activeTool === "vector" && id !== "vector") {
            this._tools.vector?.reset();
        }
        prev?.deactivate();

        this._activeTool = id;
        Object.values(this._toolBtns).forEach(b => b.classList.remove("active"));
        this._toolBtns[id]?.classList.add("active");

        this._tools[id]?.activate();
        this._renderToolOptions(id);
    }

    // ────────────────────────────────────────────
    // ツールオプション UI
    // ────────────────────────────────────────────

    _renderToolOptions(toolId) {
        const el = this._toolOptionsEl;
        el.innerHTML = "";

        const title = document.createElement("div");
        title.className = "me-tool-options-title";
        title.textContent = t("tool." + toolId);
        el.appendChild(title);

        if (toolId === "paint")        this._buildPaintOptions(el);
        else if (toolId === "color")   this._buildColorOptions(el);
        else if (toolId === "transparency") this._buildTransparencyOptions(el);
        else if (toolId === "text")    this._buildTextOptions(el);
        else if (toolId === "vector")  this._buildVectorOptions(el);
        else if (toolId === "shape")   this._buildShapeOptions(el);
        else if (toolId === "sam3")    this._buildSam3Options(el);
        else if (toolId === "birefnet") this._buildBiRefNetOptions(el);
    }

    _buildPaintOptions(container) {
        const tool = this._tools.paint;

        // ── Brush selector ──────────────────────────────────────────
        const brushRow = document.createElement("div");
        brushRow.className = "me-brush-selector";

        // Preview canvas
        const previewCanvas = document.createElement("canvas");
        previewCanvas.className = "me-brush-preview-canvas";
        previewCanvas.width  = 40;
        previewCanvas.height = 40;
        brushRow.appendChild(previewCanvas);

        const brushInfo = document.createElement("div");
        brushInfo.className = "me-brush-info";

        const brushNameEl = document.createElement("div");
        brushNameEl.className = "me-brush-name-label";
        brushNameEl.textContent = tool.brushName;
        brushInfo.appendChild(brushNameEl);

        const browseBtn = document.createElement("button");
        browseBtn.className = "me-browse-btn";
        browseBtn.textContent = t("paint.browseBrushes");
        browseBtn.onclick = () => {
            this._brushLib.open((img, name) => {
                tool.setImageBrush(img, name);
                brushNameEl.textContent = name;
                this._renderBrushPreview(previewCanvas, tool);
            });
        };
        brushInfo.appendChild(browseBtn);

        const clearBrushBtn = document.createElement("button");
        clearBrushBtn.className = "me-clear-brush-btn";
        clearBrushBtn.textContent = t("paint.useCircle");
        clearBrushBtn.title = t("paint.useCircleTitle");
        clearBrushBtn.onclick = () => {
            tool.clearImageBrush();
            brushNameEl.textContent = tool.brushName;
            this._renderBrushPreview(previewCanvas, tool);
        };
        brushInfo.appendChild(clearBrushBtn);

        brushRow.appendChild(brushInfo);
        container.appendChild(brushRow);

        this._renderBrushPreview(previewCanvas, tool);

        // ── Sliders ─────────────────────────────────────────────────
        container.appendChild(this._makeSliderRow(t("paint.size"), 5, 300, 1, tool.brushSize, v => {
            tool.brushSize = v;
            this._renderBrushPreview(previewCanvas, tool);
        }));
        container.appendChild(this._makeSliderRow(t("paint.hardness"), 0, 1, 0.05, tool.hardness, v => {
            tool.hardness = v;
            this._renderBrushPreview(previewCanvas, tool);
        }));
        container.appendChild(this._makeSliderRow(t("paint.spacing"), 0.05, 1, 0.05, tool.spacing, v => { tool.spacing = v; }));
        container.appendChild(this._makeSliderRow(t("paint.angle"), 0, 360, 1, tool.angle, v => {
            tool.angle = v;
            this._renderBrushPreview(previewCanvas, tool);
        }));

        // ── Size Jitter ──────────────────────────────────────────────
        const sizeJitterRow = document.createElement("div");
        sizeJitterRow.className = "me-option-row";
        const sizeJitterLbl = document.createElement("span");
        sizeJitterLbl.className = "me-option-label";
        sizeJitterLbl.textContent = t("paint.sizeJitter");
        sizeJitterRow.appendChild(sizeJitterLbl);
        const sizeJitterChk = document.createElement("input");
        sizeJitterChk.type    = "checkbox";
        sizeJitterChk.checked = tool.sizeJitter;
        sizeJitterRow.appendChild(sizeJitterChk);
        container.appendChild(sizeJitterRow);

        // Amount sub-row (enabled only when Size Jitter is checked)
        const sizeAmtRow = document.createElement("div");
        sizeAmtRow.className = "me-option-row";
        const sizeAmtLbl = document.createElement("span");
        sizeAmtLbl.className = "me-option-label";
        sizeAmtLbl.textContent = t("paint.amount");
        sizeAmtRow.appendChild(sizeAmtLbl);

        const sizeAmtSlider = document.createElement("input");
        sizeAmtSlider.type  = "range";
        sizeAmtSlider.min   = 0.01; sizeAmtSlider.max  = 1;
        sizeAmtSlider.step  = 0.01; sizeAmtSlider.value = tool.sizeJitterAmount;

        const sizeAmtNum = document.createElement("input");
        sizeAmtNum.type  = "number";
        sizeAmtNum.min   = 0.01; sizeAmtNum.max  = 1;
        sizeAmtNum.step  = 0.01; sizeAmtNum.value = tool.sizeJitterAmount;

        sizeAmtSlider.oninput = () => {
            const v = parseFloat(sizeAmtSlider.value);
            sizeAmtNum.value = v;
            tool.sizeJitterAmount = v;
        };
        sizeAmtNum.oninput = () => {
            const v = Math.min(1, Math.max(0.01, parseFloat(sizeAmtNum.value) || 0.01));
            sizeAmtSlider.value = v;
            tool.sizeJitterAmount = v;
        };
        sizeAmtRow.appendChild(sizeAmtSlider);
        sizeAmtRow.appendChild(sizeAmtNum);

        const setSizeJitterUI = () => {
            const on = tool.sizeJitter;
            sizeAmtSlider.disabled = !on;
            sizeAmtNum.disabled    = !on;
            sizeAmtRow.style.opacity = on ? "1" : "0.4";
        };
        sizeJitterChk.onchange = () => {
            tool.sizeJitter = sizeJitterChk.checked;
            setSizeJitterUI();
        };
        setSizeJitterUI();
        container.appendChild(sizeAmtRow);

        // ── Rotation Jitter ──────────────────────────────────────────
        const rotJitterRow = document.createElement("div");
        rotJitterRow.className = "me-option-row";
        const rotJitterLbl = document.createElement("span");
        rotJitterLbl.className = "me-option-label";
        rotJitterLbl.textContent = t("paint.rotJitter");
        rotJitterRow.appendChild(rotJitterLbl);
        const rotJitterChk = document.createElement("input");
        rotJitterChk.type    = "checkbox";
        rotJitterChk.checked = tool.rotationJitter;
        rotJitterChk.onchange = () => { tool.rotationJitter = rotJitterChk.checked; };
        rotJitterRow.appendChild(rotJitterChk);
        container.appendChild(rotJitterRow);

        // ── Mode ─────────────────────────────────────────────────────
        container.appendChild(this._makeModeRow(tool, [["add", t("mode.add")], ["erase", t("mode.erase")]]));
    }

    /**
     * Renders a preview of the current brush into the given canvas.
     * For circle: radial gradient. For image brush: the image itself.
     */
    _renderBrushPreview(canvas, tool) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Dark background
        ctx.fillStyle = "#1a1a2a";
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;

        if (tool.brushImage) {
            // Use processed stamp (white pixels, alpha=brush density) for accurate preview
            const stamp = tool._getStamp(w - 4);
            if (tool.angle) {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate((tool.angle * Math.PI) / 180);
                ctx.drawImage(stamp, -(w / 2) + 2, -(h / 2) + 2);
                ctx.restore();
            } else {
                ctx.drawImage(stamp, 2, 2);
            }
        } else {
            // Circular preview (matches PaintTool._paintCircle)
            const r = (Math.min(w, h) / 2) - 2;
            if (tool.hardness >= 1.0) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = "white";
                ctx.fill();
            } else {
                const innerR = r * Math.max(0, Math.min(0.999, tool.hardness));
                const grad   = ctx.createRadialGradient(cx, cy, innerR, cx, cy, r);
                grad.addColorStop(0, "rgba(255,255,255,1)");
                grad.addColorStop(1, "rgba(255,255,255,0)");
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
            }
        }
    }

    _buildColorOptions(container) {
        const tool = this._tools.color;
        container.appendChild(this._makeSliderRow(t("color.tolerance"), 0, 255, 1, tool.tolerance, v => { tool.tolerance = v; }));
        container.appendChild(this._makeSliderRow(t("color.feather"), 0, 50, 1, tool.feather, v => { tool.feather = v; }));

        container.appendChild(this._makeModeRow(tool, [["add", t("mode.add")], ["subtract", t("mode.subtract")]]));

        const hint = document.createElement("div");
        hint.style.cssText = "font-size:10px;color:#888;margin-top:6px;";
        hint.textContent = t("color.hint");
        container.appendChild(hint);
    }

    _buildTransparencyOptions(container) {
        const tool = this._tools.transparency;
        container.appendChild(this._makeSliderRow(t("transparency.threshold"), 0, 255, 1, tool.threshold, v => { tool.threshold = v; }));

        const invertRow = this._makeRow(t("transparency.invert"));
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = tool.invert;
        chk.onchange = () => { tool.invert = chk.checked; };
        invertRow.appendChild(chk);
        container.appendChild(invertRow);

        const extractRow = document.createElement("div");
        extractRow.className = "me-option-row";
        const extractBtn = document.createElement("button");
        extractBtn.textContent = t("transparency.extract");
        extractBtn.style.flex = "1";
        extractBtn.onclick = () => {
            this._saveUndoState();
            tool.extract();
        };
        extractRow.appendChild(extractBtn);
        container.appendChild(extractRow);

        const hint = document.createElement("div");
        hint.style.cssText = "font-size:10px;color:#888;margin-top:6px;";
        hint.textContent = t("transparency.hint");
        container.appendChild(hint);
    }

    _buildVectorOptions(container) {
        const tool = this._tools.vector;

        // ── モード ────────────────────────────────────────────────────
        container.appendChild(this._makeModeRow(tool, [["add", t("mode.add")], ["erase", t("mode.erase")]]));

        // ── Reset ボタン ──────────────────────────────────────────────
        const resetRow = document.createElement("div");
        resetRow.className = "me-option-row";
        const resetBtn = document.createElement("button");
        resetBtn.textContent = t("vector.resetPath");
        resetBtn.style.flex  = "1";
        resetBtn.onclick = () => tool.reset();
        resetRow.appendChild(resetBtn);
        container.appendChild(resetRow);

        // ── ヒント ────────────────────────────────────────────────────
        const hint = document.createElement("div");
        hint.className = "me-vector-hint";
        // NOTE: only static strings here — never insert user-controlled values (XSS)
        hint.innerHTML = t("vector.hint");
        container.appendChild(hint);
    }

    _buildShapeOptions(container) {
        const tool = this._tools.shape;

        // ── シェイプ種類 ──────────────────────────────────────────────
        const shapeRow = this._makeRow(t("shape.shape"));
        const shapeSel = document.createElement("select");
        [["rect", t("shape.rect")], ["ellipse", t("shape.ellipse")]].forEach(([v, l]) => {
            const o = document.createElement("option");
            o.value = v; o.textContent = l;
            shapeSel.appendChild(o);
        });
        shapeSel.value    = tool.shape;
        shapeSel.onchange = () => { tool.shape = shapeSel.value; };
        shapeRow.appendChild(shapeSel);
        container.appendChild(shapeRow);

        // ── モード ────────────────────────────────────────────────────
        container.appendChild(this._makeModeRow(tool, [["add", t("mode.add")], ["erase", t("mode.erase")]]));

        const hint = document.createElement("div");
        hint.style.cssText = "font-size:10px;color:#888;margin-top:8px;line-height:1.6;";
        // NOTE: only static strings here — never insert user-controlled values (XSS)
        hint.innerHTML = t("shape.hint");
        container.appendChild(hint);
    }

    _buildTextOptions(container) {
        const tool = this._tools.text;

        // ── テキスト入力 ────────────────────────────────────────────
        const textRow = document.createElement("div");
        textRow.className = "me-option-row me-text-row";

        const textLbl = document.createElement("span");
        textLbl.className   = "me-option-label";
        textLbl.textContent = t("text.text");
        textRow.appendChild(textLbl);

        const textarea = document.createElement("textarea");
        textarea.className   = "me-text-panel-input";
        textarea.value       = tool.text;
        textarea.rows        = 3;
        textarea.placeholder = t("text.placeholder");
        textarea.oninput = () => { tool.text = textarea.value; };
        // textarea内ではキーボードショートカットをブロックしない
        textarea.addEventListener("keydown", e => e.stopPropagation());
        textRow.appendChild(textarea);
        container.appendChild(textRow);

        // ── フォント ─────────────────────────────────────────────────
        const fontRow = this._makeRow(t("text.font"));
        const fontSel = document.createElement("select");
        for (const f of TextTool.FONTS) {
            const o = document.createElement("option");
            o.value = f; o.textContent = f; o.style.fontFamily = f;
            fontSel.appendChild(o);
        }
        fontSel.value    = tool.fontFamily;
        fontSel.onchange = () => { tool.fontFamily = fontSel.value; };
        fontRow.appendChild(fontSel);
        container.appendChild(fontRow);

        // ── サイズ ───────────────────────────────────────────────────
        container.appendChild(this._makeSliderRow(t("text.size"), 8, 400, 1, tool.fontSize, v => { tool.fontSize = v; }));

        // ── Bold / Italic ─────────────────────────────────────────────
        const styleRow = this._makeRow(t("text.style"));

        const boldLabel = document.createElement("label");
        boldLabel.className = "me-text-style-label";
        boldLabel.style.fontWeight = "bold";
        const boldChk = document.createElement("input");
        boldChk.type    = "checkbox";
        boldChk.checked = tool.bold;
        boldChk.onchange = () => { tool.bold = boldChk.checked; };
        boldLabel.appendChild(boldChk);
        boldLabel.appendChild(document.createTextNode(" B"));
        styleRow.appendChild(boldLabel);

        const italicLabel = document.createElement("label");
        italicLabel.className = "me-text-style-label";
        italicLabel.style.fontStyle = "italic";
        const italicChk = document.createElement("input");
        italicChk.type    = "checkbox";
        italicChk.checked = tool.italic;
        italicChk.onchange = () => { tool.italic = italicChk.checked; };
        italicLabel.appendChild(italicChk);
        italicLabel.appendChild(document.createTextNode(" I"));
        styleRow.appendChild(italicLabel);

        container.appendChild(styleRow);

        // ── アライメント ──────────────────────────────────────────────
        const alignRow = this._makeRow(t("text.align"));
        const alignSel = document.createElement("select");
        [["left", t("text.left")], ["center", t("text.center")], ["right", t("text.right")]].forEach(([v, l]) => {
            const o = document.createElement("option");
            o.value = v; o.textContent = l;
            alignSel.appendChild(o);
        });
        alignSel.value    = tool.align;
        alignSel.onchange = () => { tool.align = alignSel.value; };
        alignRow.appendChild(alignSel);
        container.appendChild(alignRow);

        // ── モード ────────────────────────────────────────────────────
        container.appendChild(this._makeModeRow(tool, [["add", t("mode.add")], ["erase", t("mode.erase")]]));

        const hint = document.createElement("div");
        hint.style.cssText = "font-size:10px;color:#888;margin-top:6px;line-height:1.5;";
        hint.textContent = t("text.hint");
        container.appendChild(hint);
    }

    // ────────────────────────────────────────────────────────────
    // SAM3 オプションパネル
    // ────────────────────────────────────────────────────────────

    async _buildSam3Options(container) {
        const tool = this._tools.sam3;

        // ── モデル状態 ──────────────────────────────────────────
        const statusEl = document.createElement("div");
        statusEl.className = "me-sam3-status";
        statusEl.textContent = t("sam3.checking");
        container.appendChild(statusEl);

        // モデル選択ドロップダウン（status 取得後に生成）
        const modelContainer = document.createElement("div");
        container.appendChild(modelContainer);

        const self = this;
        fetch("/mask_editor/sam3/status")
            .then(r => r.json())
            .then(s => {
                console.log("[MaskEditor] SAM3 status:", JSON.stringify(s));
                try {
                    if (s.loaded) {
                        statusEl.textContent = t("sam3.ready");
                        statusEl.style.color = "#4caf50";
                    } else if (s.ckpt_found) {
                        statusEl.textContent = t("sam3.detected");
                        statusEl.style.color = "#ff9800";
                    } else if (s.jit_files && s.jit_files.length > 0) {
                        statusEl.textContent = t("sam3.jitWarning", { name: s.jit_files[0] });
                        statusEl.style.color = "#f44336";
                    } else {
                        statusEl.textContent = t("sam3.notFound");
                        statusEl.style.color = "#f44336";
                    }

                    // モデルが1件以上ある場合はドロップダウンを表示
                    if (s.models && s.models.length > 0) {
                        const modelRow = self._makeRow(t("sam3.model"));
                        const modelSel = document.createElement("select");
                        modelSel.className = "me-sam3-model-select";

                        s.models.forEach(m => {
                            const o = document.createElement("option");
                            o.value = m.name;
                            o.textContent = m.name;
                            modelSel.appendChild(o);
                        });

                        // 現在ロード済みのモデルを初期選択
                        if (s.model_path) {
                            const loadedName = s.model_path.replace(/\\/g, "/").split("/").pop();
                            if ([...modelSel.options].some(o => o.value === loadedName)) {
                                modelSel.value = loadedName;
                            }
                        }

                        tool.modelName = modelSel.value;
                        modelSel.onchange = () => { tool.modelName = modelSel.value; };
                        modelRow.appendChild(modelSel);
                        modelContainer.appendChild(modelRow);
                        console.log("[MaskEditor] SAM3 model selector built, options:", s.models.map(m => m.name));
                    } else {
                        console.warn("[MaskEditor] SAM3 no models found in status, models:", s.models);
                    }
                } catch (err) {
                    console.error("[MaskEditor] SAM3 status render error:", err);
                }
            })
            .catch(err => {
                console.error("[MaskEditor] SAM3 status fetch failed:", err);
                statusEl.textContent = t("sam3.noServer");
                statusEl.style.color = "#ff9800";
            });

        // ── プロンプト入力 ──────────────────────────────────────
        const promptRow = document.createElement("div");
        promptRow.className = "me-option-row me-text-row";

        const promptLbl = document.createElement("span");
        promptLbl.className   = "me-option-label";
        promptLbl.textContent = t("sam3.prompt");
        promptRow.appendChild(promptLbl);

        const promptInput = document.createElement("input");
        promptInput.type        = "text";
        promptInput.className   = "me-sam3-prompt-input";
        promptInput.placeholder = t("sam3.promptPlaceholder");
        promptInput.addEventListener("keydown", e => {
            e.stopPropagation();
            if (e.key === "Enter") runSegment();
        });
        promptRow.appendChild(promptInput);
        container.appendChild(promptRow);

        // ── Segment ボタン ───────────────────────────────────────
        const btnRow  = document.createElement("div");
        btnRow.className = "me-option-row";

        const segBtn  = document.createElement("button");
        segBtn.textContent = t("sam3.segment");
        segBtn.className   = "me-sam3-segment-btn";
        segBtn.style.flex  = "1";

        const spinnerEl = document.createElement("span");
        spinnerEl.textContent    = " ⏳";
        spinnerEl.style.display  = "none";

        const runSegment = async () => {
            const prompt = promptInput.value.trim();
            if (!prompt) return;
            segBtn.disabled        = true;
            spinnerEl.style.display = "";
            await tool.runInference(String(this.node.id), prompt);
            segBtn.disabled        = false;
            spinnerEl.style.display = "none";
        };
        segBtn.onclick = runSegment;
        btnRow.appendChild(segBtn);
        btnRow.appendChild(spinnerEl);
        container.appendChild(btnRow);

        // ── Add / Erase モード ──────────────────────────────────
        container.appendChild(this._makeModeRow(tool, [["add", t("mode.add")], ["erase", t("mode.erase")]]));

        // ── マスク候補グリッド ──────────────────────────────────
        const resultsEl = document.createElement("div");
        resultsEl.className = "me-sam3-results";
        container.appendChild(resultsEl);

        const renderResults = () => {
            resultsEl.innerHTML = "";

            if (tool.isLoading) {
                resultsEl.textContent = t("sam3.segmenting");
                return;
            }
            if (tool.lastError) {
                const errEl = document.createElement("div");
                errEl.className   = "me-sam3-error";
                errEl.textContent = t("common.error") + tool.lastError;
                resultsEl.appendChild(errEl);
                return;
            }
            if (tool.results.length === 0) {
                const hint = document.createElement("div");
                hint.className = "me-sam3-hint";
                hint.textContent = t("sam3.hint");
                resultsEl.appendChild(hint);
                return;
            }

            const grid = document.createElement("div");
            grid.className = "me-sam3-grid";

            for (const result of tool.results) {
                const thumb = document.createElement("div");
                thumb.className = "me-sam3-thumb";
                thumb.title = `Score: ${(result.score * 100).toFixed(1)}%  Area: ${result.area}px`;

                const img = document.createElement("img");
                img.src       = result.mask_b64;
                img.alt       = "mask";
                img.className = "me-sam3-thumb-img";
                thumb.appendChild(img);

                const scoreEl = document.createElement("span");
                scoreEl.className   = "me-sam3-thumb-score";
                scoreEl.textContent = `${(result.score * 100).toFixed(0)}%`;
                thumb.appendChild(scoreEl);

                thumb.onclick = async () => {
                    this._saveUndoState();
                    await tool.commitMask(result.mask_b64);
                    this._syncDrawToLayer();
                    this._updatePreview();
                    this._refreshLayerThumbnail();
                };
                grid.appendChild(thumb);
            }
            resultsEl.appendChild(grid);
        };

        tool.onResultsChange(renderResults);
        renderResults();
    }

    async _buildBiRefNetOptions(container) {
        const tool = this._tools.birefnet;

        // ── モデル状態 ───────────────────────────────────────────
        const statusEl = document.createElement("div");
        statusEl.className = "me-sam3-status";
        statusEl.textContent = t("birefnet.checking");
        container.appendChild(statusEl);

        const refreshStatus = () => {
            fetch("/mask_editor/birefnet/status")
                .then(r => r.json())
                .then(s => {
                    if (s.loaded) {
                        statusEl.textContent = t("birefnet.ready");
                        statusEl.style.color = "#4caf50";
                    } else if (s.model_found) {
                        statusEl.textContent = t("birefnet.detected");
                        statusEl.style.color = "#ff9800";
                    } else {
                        statusEl.textContent = t("birefnet.notFound");
                        statusEl.style.color = "#f44336";
                    }
                })
                .catch(() => {
                    statusEl.textContent = t("birefnet.noServer");
                    statusEl.style.color = "#ff9800";
                });
        };
        refreshStatus();

        // ── Remove BG ボタン ────────────────────────────────────
        const btnRow    = document.createElement("div");
        btnRow.className = "me-option-row";

        const rmBgBtn   = document.createElement("button");
        rmBgBtn.textContent = t("birefnet.removeBg");
        rmBgBtn.className   = "me-sam3-segment-btn";
        rmBgBtn.style.flex  = "1";

        const spinnerEl = document.createElement("span");
        spinnerEl.textContent   = " ⏳";
        spinnerEl.style.display = "none";

        const runRemove = async () => {
            rmBgBtn.disabled       = true;
            spinnerEl.style.display = "";
            this._saveUndoState();
            await tool.runRemoveBg(String(this.node.id));
            if (!tool.lastError) {
                this._syncDrawToLayer();
                this._updatePreview();
                this._refreshLayerThumbnail();
                refreshStatus();
            }
            rmBgBtn.disabled       = false;
            spinnerEl.style.display = "none";
            renderState();
        };

        rmBgBtn.onclick = runRemove;
        btnRow.appendChild(rmBgBtn);
        btnRow.appendChild(spinnerEl);
        container.appendChild(btnRow);

        // ── Add / Erase モード ──────────────────────────────────
        container.appendChild(this._makeModeRow(tool, [["add", t("mode.add")], ["erase", t("mode.erase")]]));

        // ── エラー / ヒント ─────────────────────────────────────
        const stateEl = document.createElement("div");
        stateEl.className = "me-sam3-results";
        container.appendChild(stateEl);

        const renderState = () => {
            stateEl.innerHTML = "";
            if (tool.lastError) {
                const errEl = document.createElement("div");
                errEl.className   = "me-sam3-error";
                errEl.textContent = t("common.error") + tool.lastError;
                stateEl.appendChild(errEl);
            } else {
                const hint = document.createElement("div");
                hint.className = "me-sam3-hint";
                hint.textContent = t("birefnet.hint");
                stateEl.appendChild(hint);
            }
        };

        tool.onStateChange(renderState);
        renderState();
    }

    _makeSliderRow(label, min, max, step, value, onChange) {
        const row = document.createElement("div");
        row.className = "me-option-row";

        const lbl = document.createElement("span");
        lbl.className = "me-option-label";
        lbl.textContent = label;
        row.appendChild(lbl);

        const slider = document.createElement("input");
        slider.type  = "range";
        slider.min   = min;  slider.max  = max;
        slider.step  = step; slider.value = value;

        const num = document.createElement("input");
        num.type  = "number";
        num.min   = min;  num.max   = max;
        num.step  = step; num.value = value;

        slider.oninput = () => { const v = parseFloat(slider.value); num.value = v; onChange(v); };
        num.oninput    = () => {
            const v = Math.min(max, Math.max(min, parseFloat(num.value) || 0));
            slider.value = v; onChange(v);
        };

        row.appendChild(slider);
        row.appendChild(num);
        return row;
    }

    _makeRow(label) {
        const row = document.createElement("div");
        row.className = "me-option-row";
        const lbl = document.createElement("span");
        lbl.className = "me-option-label";
        lbl.textContent = label;
        row.appendChild(lbl);
        return row;
    }

    _makeModeRow(tool, options) {
        const row = document.createElement("div");
        row.className = "me-option-row";
        const lbl = document.createElement("span");
        lbl.className = "me-option-label";
        lbl.textContent = t("mode.label");
        row.appendChild(lbl);

        const group = document.createElement("div");
        group.className = "me-mode-btn-group";
        const btns = [];
        for (const [v, l] of options) {
            const btn = document.createElement("button");
            btn.className = "me-mode-btn" + (tool.mode === v ? " active" : "");
            btn.textContent = l;
            btn.dataset.value = v;
            btn.onclick = () => {
                tool.mode = v;
                btns.forEach(b => b.classList.toggle("active", b.dataset.value === v));
            };
            group.appendChild(btn);
            btns.push(btn);
        }
        row.appendChild(group);
        return row;
    }

    // ────────────────────────────────────────────
    // キャンバスイベント
    // ────────────────────────────────────────────

    _setupCanvasEvents() {
        const cv = this._drawCanvas;

        cv.addEventListener("mousedown", e => {
            // text ツールはオーバーレイ表示のみ（undo/sync は stamp 確定時に実行）
            if (this._activeTool === "text") {
                const { x, y } = BaseTool.getCanvasPos(cv, e);
                this._saveUndoState();
                this._tools.text.onMouseDown(x, y, e);
                return;
            }
            // vector ツールはクリックごとにポイントを追加（undo は commit 時）
            if (this._activeTool === "vector") {
                const { x, y } = BaseTool.getCanvasPos(cv, e);
                this._tools.vector.onMouseDown(x, y, e);
                return;
            }

            this._painting = true;
            this._saveUndoState();
            const { x, y } = BaseTool.getCanvasPos(cv, e);
            this._tools[this._activeTool]?.onMouseDown(x, y, e);
            this._syncDrawToLayer();
            this._updatePreview();

            // 描画中はキャンバス外に出てもドラッグを継続するため document レベルで追跡
            const onDocMove = (e2) => {
                if (!this._painting) return;
                const pos = BaseTool.getCanvasPos(cv, e2);
                if (this._activeTool === "shape") {
                    this._tools.shape.onMouseMove(pos.x, pos.y, e2);
                    return;
                }
                this._tools[this._activeTool]?.onMouseMove(pos.x, pos.y, e2);
                this._renderPreviewWithDrawCanvas();
            };
            const onDocUp = (e2) => {
                document.removeEventListener("mousemove", onDocMove);
                document.removeEventListener("mouseup", onDocUp);
                if (!this._painting) return;
                this._painting = false;
                const pos = BaseTool.getCanvasPos(cv, e2);
                this._tools[this._activeTool]?.onMouseUp(pos.x, pos.y, e2);
                this._syncDrawToLayer();
                this._updatePreview();
                this._refreshLayerThumbnail();
            };
            document.addEventListener("mousemove", onDocMove);
            document.addEventListener("mouseup", onDocUp);
        });

        // vector のホバー追跡のみキャンバスレベルで処理
        // shape / paint の mousemove は mousedown 後の document レベルリスナーで処理
        cv.addEventListener("mousemove", e => {
            if (this._activeTool === "vector") {
                const { x, y } = BaseTool.getCanvasPos(cv, e);
                this._tools.vector.onMouseMove(x, y, e);
            }
        });

        cv.addEventListener("mouseleave", () => {
            if (this._activeTool === "vector") {
                this._tools.vector.onMouseLeave();
            }
            // shape / paint: _painting を維持（document mouseup まで描画継続）
        });

        // タッチサポート（簡易）
        cv.addEventListener("touchstart", e => {
            e.preventDefault();
            const touch = e.touches[0];
            const me = new MouseEvent("mousedown", { clientX: touch.clientX, clientY: touch.clientY });
            cv.dispatchEvent(me);
        }, { passive: false });
        cv.addEventListener("touchmove", e => {
            e.preventDefault();
            const touch = e.touches[0];
            const me = new MouseEvent("mousemove", { clientX: touch.clientX, clientY: touch.clientY });
            cv.dispatchEvent(me);
        }, { passive: false });
        cv.addEventListener("touchend", e => {
            e.preventDefault();
            const me = new MouseEvent("mouseup", {});
            cv.dispatchEvent(me);
        }, { passive: false });
    }

    /** アクティブレイヤーの内容を _drawCanvas にロード */
    _loadActiveLayerToDrawCanvas() {
        const layer = this._layerMgr.activeLayer;
        const ctx = this._drawCanvas.getContext("2d");
        ctx.clearRect(0, 0, this._canvasW, this._canvasH);
        if (layer) ctx.drawImage(layer.canvas, 0, 0);
    }

    /** _drawCanvas の現在の描画内容をアクティブレイヤーに保存 */
    _syncDrawToLayer() {
        const layer = this._layerMgr.activeLayer;
        if (!layer) return;
        layer.ctx.clearRect(0, 0, this._canvasW, this._canvasH);
        layer.ctx.drawImage(this._drawCanvas, 0, 0);
    }

    // ────────────────────────────────────────────
    // 描画 / プレビュー更新
    // ────────────────────────────────────────────

    _renderBg() {
        const ctx = this._bgCanvas.getContext("2d");
        ctx.clearRect(0, 0, this._canvasW, this._canvasH);

        if (this._showImage && this._bgImage) {
            ctx.globalAlpha = 0.85;
            ctx.drawImage(this._bgImage, 0, 0, this._canvasW, this._canvasH);
            ctx.globalAlpha = 1.0;
        } else {
            const sz = 16;
            for (let y = 0; y < this._canvasH; y += sz) {
                for (let x = 0; x < this._canvasW; x += sz) {
                    ctx.fillStyle = ((x / sz + y / sz) % 2 === 0) ? "#333" : "#444";
                    ctx.fillRect(x, y, sz, sz);
                }
            }
        }
    }

    /** 全レイヤーの layer.canvas を使ってプレビューを更新 */
    _updatePreview() {
        this._compositor.renderPreview(
            this._previewCanvas,
            this._layerMgr.layers,
            this._showImage && !!this._bgImage,
            this._inverted,
            this._overlayColor
        );
        this._previewCanvas.style.filter = this._blurRadius > 0 ? `blur(${this._blurRadius}px)` : "";
    }

    /**
     * ペイント中リアルタイムプレビュー:
     * アクティブレイヤーだけ _drawCanvas (最新) を使う
     */
    _renderPreviewWithDrawCanvas() {
        const layers = this._layerMgr.layers;
        const active = this._layerMgr.activeLayer;
        if (!active) { this._updatePreview(); return; }

        // アクティブレイヤーのキャンバスを一時的に drawCanvas に差し替え
        const orig = active.canvas;
        active.canvas = this._drawCanvas;
        this._compositor.renderPreview(
            this._previewCanvas,
            layers,
            this._showImage && !!this._bgImage,
            this._inverted,
            this._overlayColor
        );
        this._previewCanvas.style.filter = this._blurRadius > 0 ? `blur(${this._blurRadius}px)` : "";
        active.canvas = orig;
    }

    // ────────────────────────────────────────────
    // レイヤーリスト UI
    // ────────────────────────────────────────────

    _refreshLayerList() {
        const ul = this._layerListEl;
        ul.innerHTML = "";

        const activeId = this._layerMgr.activeLayer?.id;

        for (const layer of this._layerMgr.layers) {
            const li = document.createElement("li");
            li.className = "me-layer-item" + (layer.id === activeId ? " active" : "");
            li.draggable = true;
            li.dataset.id = layer.id;
            li.onclick = () => this._layerMgr.setActive(layer.id);

            // 可視ボタン
            const visBtn = document.createElement("button");
            visBtn.className = "me-layer-vis-btn" + (layer.visible ? "" : " vis-off");
            visBtn.textContent = "👁";
            visBtn.title = t("layers.toggleVisibility");
            visBtn.onclick = e => { e.stopPropagation(); this._layerMgr.toggleVisible(layer.id); };
            li.appendChild(visBtn);

            // サムネイル
            const thumb = document.createElement("img");
            thumb.className = "me-layer-thumbnail";
            thumb.src = layer.getThumbnailDataURL();
            li.appendChild(thumb);

            // 名前 + タイプ
            const info = document.createElement("div");
            info.className = "me-layer-info";
            const namEl = document.createElement("div");
            namEl.className = "me-layer-name";
            namEl.textContent = layer.name;
            const typEl = document.createElement("div");
            typEl.className = "me-layer-type";
            typEl.textContent = layer.type;
            info.appendChild(namEl);
            info.appendChild(typEl);
            li.appendChild(info);

            // add/subtract トグル
            const opBtn = document.createElement("button");
            opBtn.className = "me-layer-op-btn " + layer.operation;
            opBtn.textContent = layer.operation === "add" ? "＋" : "－";
            opBtn.title = t("layers.toggleOp");
            opBtn.onclick = e => {
                e.stopPropagation();
                this._layerMgr.setOperation(layer.id, layer.operation === "add" ? "subtract" : "add");
            };
            li.appendChild(opBtn);

            // 削除ボタン
            const delBtn = document.createElement("button");
            delBtn.className = "me-layer-del-btn";
            delBtn.textContent = "✕";
            delBtn.title = t("layers.delete");
            delBtn.onclick = e => {
                e.stopPropagation();
                if (this._layerMgr.layers.length > 1 || confirm(t("layers.deleteConfirm"))) {
                    this._layerMgr.deleteLayer(layer.id);
                }
            };
            li.appendChild(delBtn);

            ul.appendChild(li);
        }

        this._setupLayerDragDrop();
    }

    _refreshLayerThumbnail() {
        const active = this._layerMgr.activeLayer;
        if (!active) return;
        const items = this._layerListEl.querySelectorAll(".me-layer-item");
        for (const item of items) {
            if (item.dataset.id === active.id) {
                const thumb = item.querySelector(".me-layer-thumbnail");
                if (thumb) thumb.src = active.getThumbnailDataURL();
            }
        }
    }

    _setupLayerDragDrop() {
        const items = Array.from(this._layerListEl.querySelectorAll(".me-layer-item"));
        let dragSrcId = null;

        for (const item of items) {
            item.addEventListener("dragstart", e => {
                dragSrcId = item.dataset.id;
                e.dataTransfer.effectAllowed = "move";
            });
            item.addEventListener("dragover",  e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
            item.addEventListener("drop", e => {
                e.preventDefault();
                if (dragSrcId && dragSrcId !== item.dataset.id) {
                    const layers = this._layerMgr.layers;
                    const si = layers.findIndex(l => l.id === dragSrcId);
                    const di = layers.findIndex(l => l.id === item.dataset.id);
                    if (si >= 0 && di >= 0) {
                        const [moved] = layers.splice(si, 1);
                        layers.splice(di, 0, moved);
                        this._layerMgr._emit("change");
                    }
                }
            });
        }
    }

    // ────────────────────────────────────────────
    // 入力画像ロード
    // ────────────────────────────────────────────

    /** BGボタンで画像が変更された際に外部から呼ぶ。モーダルが非表示なら何もしない */
    async reloadBackground(dataUrl) {
        if (!this._overlay || this._overlay.style.display === "none") return;
        if (dataUrl) {
            await this._setBackgroundImage(dataUrl);
            // 新画像読み込み時は既存レイヤーをすべてクリアして Layer 1 を生成
            this._layerMgr.layers = [];
            this._layerMgr.activeIndex = 0;
            this._layerMgr._emit("change");
            this._imageToMaskLayer(this._bgImage);
            this._refreshLayerList();
            this._loadActiveLayerToDrawCanvas();
        } else {
            await this._loadNodeImage();
        }
        this._renderBg();
        this._updatePreview();
    }

    async _loadNodeImage() {
        // JS側でBGボタンから選択された画像を優先使用
        if (this.node._bgDataUrl) {
            await this._setBackgroundImage(this.node._bgDataUrl);
            return;
        }
        // なければサーバーキャッシュ（image 入力接続時）から取得
        try {
            const res = await fetch("/mask_editor/get_node_image", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ node_id: String(this.node.id) }),
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data.image_b64) await this._setBackgroundImage(data.image_b64);
        } catch { /* サーバー未起動時などは無視 */ }
    }

    _setBackgroundImage(dataUrl) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                this._bgImage = img;
                // TransparencyTool に元画像を渡す
                if (this._tools?.transparency) {
                    this._tools.transparency.setSourceImage(img);
                }
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                const maxSize = 1024;
                if (w > maxSize || h > maxSize) {
                    const s = maxSize / Math.max(w, h);
                    w = Math.round(w * s);
                    h = Math.round(h * s);
                }
                this._resizeCanvases(w, h);
                resolve();
            };
            img.onerror = resolve;
            img.src     = dataUrl;
        });
    }

    _resizeCanvases(w, h) {
        // 同サイズの場合は canvas を再代入しない（再代入すると内容がクリアされる）
        if (this._canvasW === w && this._canvasH === h) return;

        this._canvasW = w;
        this._canvasH = h;

        // canvas のピクセル解像度を設定（描画品質に直結）
        for (const cv of [this._bgCanvas, this._drawCanvas, this._previewCanvas, this._vectorPreviewCanvas]) {
            cv.width  = w;
            cv.height = h;
        }

        if (this._layerMgr) {
            this._layerMgr.width  = w;
            this._layerMgr.height = h;
            for (const layer of this._layerMgr.layers) layer.resize(w, h);
        }

        // CSS 表示サイズはズームで決定（fit-to-view して計算）
        this._fitToView();
    }

    /** 表示エリアに収まる最大ズームを計算してフィット */
    _fitToView() {
        const area = this._canvasAreaEl;
        if (!area) return;
        const availW = area.clientWidth  - 24;  // padding 12px × 2
        const availH = area.clientHeight - 24;
        if (availW <= 0 || availH <= 0) return;
        const scaleX = availW / this._canvasW;
        const scaleY = availH / this._canvasH;
        // 最大 1.0 (100%) まで（それ以上は拡大しない）
        this._setZoom(Math.min(scaleX, scaleY, 1.0));
    }

    /** ズームレベルを設定してCSS表示サイズを更新 */
    _setZoom(z) {
        this._zoom = Math.min(this._zoomMax, Math.max(this._zoomMin, z));
        const dw = Math.round(this._canvasW * this._zoom);
        const dh = Math.round(this._canvasH * this._zoom);

        // CSS表示サイズのみ変更（canvas解像度は変えない）
        for (const cv of [this._bgCanvas, this._drawCanvas, this._previewCanvas, this._vectorPreviewCanvas]) {
            cv.style.width  = dw + "px";
            cv.style.height = dh + "px";
        }
        if (this._canvasContainer) {
            this._canvasContainer.style.width  = dw + "px";
            this._canvasContainer.style.height = dh + "px";
        }

        // ズームUI を同期
        if (this._zoomSlider) {
            const pct = Math.round(this._zoom * 100);
            this._zoomSlider.value    = pct;
            this._zoomLabel.textContent = pct + "%";
        }
    }

    // ────────────────────────────────────────────
    // Undo / Redo
    // ────────────────────────────────────────────

    _saveUndoState() {
        const layer = this._layerMgr.activeLayer;
        if (!layer) return;
        const data = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        this._undoStack.push({ id: layer.id, data });
        if (this._undoStack.length > 30) this._undoStack.shift();
        this._redoStack = [];
    }

    _undo() {
        if (!this._undoStack.length) return;
        const layer = this._layerMgr.activeLayer;
        if (!layer) return;
        const current = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        this._redoStack.push({ id: layer.id, data: current });
        const prev = this._undoStack.pop();
        layer.ctx.putImageData(prev.data, 0, 0);
        this._loadActiveLayerToDrawCanvas();
        this._updatePreview();
        this._refreshLayerThumbnail();
    }

    _redo() {
        if (!this._redoStack.length) return;
        const layer = this._layerMgr.activeLayer;
        if (!layer) return;
        const current = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        this._undoStack.push({ id: layer.id, data: current });
        const next = this._redoStack.pop();
        layer.ctx.putImageData(next.data, 0, 0);
        this._loadActiveLayerToDrawCanvas();
        this._updatePreview();
        this._refreshLayerThumbnail();
    }

    _clearActiveLayer() {
        const layer = this._layerMgr.activeLayer;
        if (!layer) return;
        this._saveUndoState();
        layer.clear();
        this._loadActiveLayerToDrawCanvas();
        this._updatePreview();
        this._refreshLayerThumbnail();
    }

    // ────────────────────────────────────────────
    // 画像 → Layer 1 変換（グレースケールをアルファとして使用）
    // ────────────────────────────────────────────

    _imageToMaskLayer(img) {
        const w = this._canvasW;
        const h = this._canvasH;
        const layer = this._layerMgr.addLayer("paint", t("layers.defaultName", { n: 1 }));
        const tmp = document.createElement("canvas");
        tmp.width  = w;
        tmp.height = h;
        const tmpCtx = tmp.getContext("2d");
        tmpCtx.drawImage(img, 0, 0, w, h);
        const src = tmpCtx.getImageData(0, 0, w, h);
        const out = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < src.data.length; i += 4) {
            const gray = Math.round(0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]);
            out[i] = out[i + 1] = out[i + 2] = 255;
            out[i + 3] = gray;
        }
        layer.ctx.putImageData(new ImageData(out, w, h), 0, 0);
        return layer;
    }

    // ────────────────────────────────────────────
    // BG 画像ロード（ファイルオブジェクトから）
    // ────────────────────────────────────────────

    async _loadBgFromFile(file) {
        const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = ev => resolve(ev.target.result);
            reader.readAsDataURL(file);
        });
        this.node._bgDataUrl = dataUrl;
        const img = new Image();
        img.src = dataUrl;
        await new Promise(r => { img.onload = r; img.onerror = r; });
        this.node._bgImg = img;
        fetch("/mask_editor/store_image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: String(this.node.id), bg_image_b64: dataUrl }),
        }).catch(() => {});
        // _setBackgroundImage 内で _resizeCanvases が呼ばれ LayerManager のサイズも更新される
        await this._setBackgroundImage(dataUrl);
        // 既存レイヤーをすべてクリアして画像から Layer 1 を生成
        this._layerMgr.layers = [];
        this._layerMgr.activeIndex = 0;
        this._layerMgr._emit("change");
        this._imageToMaskLayer(this._bgImage);
        this._loadActiveLayerToDrawCanvas();
        this._renderBg();
        this._updatePreview();
        this.node.setDirtyCanvas?.(true, true);
    }

    // ────────────────────────────────────────────
    // New ダイアログ
    // ────────────────────────────────────────────

    _showNewDialog() {
        if (this._newDialog) { this._newDialog.remove(); this._newDialog = null; }

        const overlay = document.createElement("div");
        overlay.className = "me-new-dialog-overlay";
        this._newDialog = overlay;

        const box = document.createElement("div");
        box.className = "me-new-dialog-box";

        const title = document.createElement("div");
        title.className = "me-new-dialog-title";
        title.textContent = t("newCanvas.title");
        box.appendChild(title);

        const mkRow = (label, defaultVal) => {
            const row = document.createElement("div");
            row.className = "me-new-dialog-row";
            const lbl = document.createElement("span");
            lbl.textContent = label;
            const input = document.createElement("input");
            input.type = "number";
            input.min = 64;
            input.max = 4096;
            input.step = 1;
            input.value = defaultVal;
            input.addEventListener("keydown", e => {
                if (e.key === "Enter") okBtn.click();
                if (e.key === "Escape") { overlay.remove(); this._newDialog = null; }
                e.stopPropagation();
            });
            row.appendChild(lbl);
            row.appendChild(input);
            box.appendChild(row);
            return input;
        };

        const wInput = mkRow(t("newCanvas.width"),  this._canvasW);
        const hInput = mkRow(t("newCanvas.height"), this._canvasH);

        const btnRow = document.createElement("div");
        btnRow.className = "me-new-dialog-btns";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "me-btn-cancel";
        cancelBtn.textContent = t("common.cancel");
        cancelBtn.onclick = () => { overlay.remove(); this._newDialog = null; };

        const okBtn = document.createElement("button");
        okBtn.className = "me-btn-apply";
        okBtn.textContent = t("newCanvas.create");
        okBtn.onclick = () => {
            const w = Math.max(64, Math.min(4096, parseInt(wInput.value) || 512));
            const h = Math.max(64, Math.min(4096, parseInt(hInput.value) || 512));
            overlay.remove();
            this._newDialog = null;
            this._createNewCanvas(w, h);
        };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        box.appendChild(btnRow);

        overlay.appendChild(box);
        overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); this._newDialog = null; } };
        this._overlay.appendChild(overlay);

        wInput.focus();
        wInput.select();
    }

    _createNewCanvas(w, h) {
        // BG をクリア
        this._bgImage = null;
        this.node._bgDataUrl = null;
        this.node._bgImg = null;
        if (this.node._bgWidget) this.node._bgWidget.name = t("node.loadImage");
        fetch("/mask_editor/store_image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: String(this.node.id), bg_image_b64: null }),
        }).catch(() => {});

        // DOM キャンバスを新サイズに直接更新（_resizeCanvases の同サイズスキップを回避）
        this._canvasW = w;
        this._canvasH = h;
        for (const cv of [this._bgCanvas, this._drawCanvas, this._previewCanvas, this._vectorPreviewCanvas]) {
            cv.width  = w;
            cv.height = h;
        }

        // 全レイヤーを削除し、指定サイズの新規空レイヤーを1つ追加
        this._layerMgr.layers      = [];
        this._layerMgr.activeIndex = 0;
        this._layerMgr.width       = w;
        this._layerMgr.height      = h;
        this._layerMgr.addLayer("paint", t("layers.defaultName", { n: 1 }));

        this._fitToView();
        this._loadActiveLayerToDrawCanvas();
        this._renderBg();
        this._updatePreview();
        this._refreshLayerList();
        this.node.setDirtyCanvas?.(true, true);
    }

    // ────────────────────────────────────────────
    // Apply（ノードへ書き戻し）
    // ────────────────────────────────────────────

    _apply() {
        const json = this._layerMgr.toJSON();
        json.inverted = this._inverted;

        const widget = this._getLayerWidget();
        if (widget) {
            widget.value = JSON.stringify(json);
            this._ensureWidgetHidden(widget);
        }

        // invert_mask ウィジェットを確実に更新
        const invW = this._getInvertWidget();
        if (invW) {
            invW.value = this._inverted;
            this.node.graph?.setDirtyCanvas(true);
        }

        // blur_radius ウィジェットを確実に更新
        const blurW = this._getBlurWidget();
        if (blurW) {
            blurW.value = this._blurRadius;
            this.node.graph?.setDirtyCanvas(true);
        }

        // マスクプレビュー（白黒）をノードに反映
        // composite() はアルファベースを返すため、黒背景に合成してグレースケール化
        const alphaMask = this._compositor.composite(
            this._layerMgr.layers, this._canvasW, this._canvasH
        );
        const toGray = (src, invert) => {
            const gc = document.createElement("canvas");
            gc.width = this._canvasW; gc.height = this._canvasH;
            const gCtx = gc.getContext("2d");
            if (invert) {
                gCtx.fillStyle = "white";
                gCtx.fillRect(0, 0, this._canvasW, this._canvasH);
                gCtx.globalCompositeOperation = "destination-out";
            } else {
                gCtx.fillStyle = "black";
                gCtx.fillRect(0, 0, this._canvasW, this._canvasH);
            }
            gCtx.drawImage(src, 0, 0);
            gCtx.globalCompositeOperation = "source-over";
            return gc;
        };
        notifyMaskPreviewUpdate(this.node, toGray(alphaMask, this._inverted).toDataURL("image/png"));

        this.close();
    }

    _ensureWidgetHidden(widget) {
        // DOM ウィジェット (textarea) を隠す
        if (widget.element) {
            widget.element.style.display  = "none";
            widget.element.style.height   = "0";
            widget.element.style.overflow = "hidden";
        }
        // キャンバス描画 + サイズ計算を無効化
        widget.draw        = () => {};
        widget.computeSize = () => [0, -4];
        // setSize はここでは呼ばない。プレビューコールバック内の _resizeNode が正しいサイズを設定する。
        // ここで setSize すると自然サイズにリセットされ、_bgImg がウィジェット領域に重なる原因になる。
    }

    // ────────────────────────────────────────────
    // 言語切り替え（DOM 再構築）
    // ────────────────────────────────────────────

    async _rebuildWithLang(lang) {
        setLang(lang);

        const savedJson     = this._layerMgr ? this._layerMgr.toJSON() : null;
        const savedInverted = this._inverted;
        const savedBlur     = this._blurRadius;
        const savedBgImage  = this._bgImage;

        if (this._overlay) {
            this._overlay.remove();
            document.removeEventListener("keydown", this._keyHandler);
        }
        this._overlay    = null;
        this._layerMgr   = null;

        this._buildDOM();
        document.body.appendChild(this._overlay);

        this._bgImage = savedBgImage;

        if (savedJson) {
            await this._layerMgr.fromJSON(savedJson);
        }
        if (this._layerMgr.layers.length === 0) {
            this._layerMgr.addLayer("paint", t("layers.defaultName", { n: 1 }));
        }

        this._inverted = savedInverted;
        this._invertCheck.checked = savedInverted;
        this._blurRadius = savedBlur;
        this._blurSlider.value = savedBlur;
        this._blurNum.value    = savedBlur;
        if (savedBlur > 0) this._previewCanvas.style.filter = `blur(${savedBlur}px)`;

        this._refreshLayerList();
        this._loadActiveLayerToDrawCanvas();
        this._renderBg();
        this._updatePreview();
        this._renderToolOptions(this._activeTool);
        requestAnimationFrame(() => this._fitToView());

        // ノードウィジェットのラベルも新言語に更新
        const node = this.node;
        if (node._viewWidget) {
            node._viewWidget.name = node._previewMode === "image"
                ? t("node.showImage") : t("node.showMask");
        }
        if (node._bgWidget) {
            node._bgWidget.name = t("node.loadImage");
        }
        if (node._editMaskWidget) {
            node._editMaskWidget.name = t("node.editMask");
        }
        node.setDirtyCanvas(true, true);
    }

    _getLayerWidget() {
        return this.node.widgets?.find(w => w.name === "layer_data") ?? null;
    }

    _getInvertWidget() {
        return this.node.widgets?.find(w => w.name === "invert_mask") ?? null;
    }

    _getBlurWidget() {
        return this.node.widgets?.find(w => w.name === "blur_radius") ?? null;
    }
}
