import { t } from "./i18n.js";

/**
 * BrushLibrary – a floating modal that lets the user browse and select
 * image-based brush tips stored in the plugin's /brushes directory.
 *
 * Usage:
 *   const lib = new BrushLibrary();
 *   lib.open((img, name) => { paintTool.setImageBrush(img, name); });
 */
export class BrushLibrary {
    constructor() {
        this._overlay         = null;
        this._treeEl          = null;
        this._gridEl          = null;
        this._statusEl        = null;
        this._tree            = [];        // full tree from server
        this._selectedPath    = null;      // null = "All Brushes"
        this._expanded        = new Set(); // expanded folder paths
        this._onSelect        = null;
    }

    /** Opens the library. onSelect(HTMLImageElement, name) is called when a brush is picked. */
    open(onSelect) {
        this._onSelect = onSelect;
        if (!this._overlay) {
            this._buildDOM();
            document.body.appendChild(this._overlay);
        }
        this._overlay.style.display = "flex";
        this._loadTree();
    }

    close() {
        if (this._overlay) this._overlay.style.display = "none";
    }

    // ── DOM ──────────────────────────────────────────────────────────

    _buildDOM() {
        const overlay = document.createElement("div");
        overlay.className = "me-bl-overlay";
        overlay.addEventListener("mousedown", e => {
            if (e.target === overlay) this.close();
        });
        this._overlay = overlay;

        const modal = document.createElement("div");
        modal.className = "me-bl-modal";
        overlay.appendChild(modal);

        modal.appendChild(this._buildHeader());

        const body = document.createElement("div");
        body.className = "me-bl-body";

        // Left: folder tree
        const treePanel = document.createElement("div");
        treePanel.className = "me-bl-tree-panel";
        this._treeEl = treePanel;
        body.appendChild(treePanel);

        // Right: brush grid
        const gridPanel = document.createElement("div");
        gridPanel.className = "me-bl-grid-panel";
        this._gridEl = gridPanel;
        body.appendChild(gridPanel);

        modal.appendChild(body);
        modal.appendChild(this._buildFooter());
    }

    _buildHeader() {
        const h = document.createElement("div");
        h.className = "me-bl-header";

        const title = document.createElement("span");
        title.className = "me-bl-title";
        title.textContent = t("brushLib.title");
        h.appendChild(title);

        const closeBtn = document.createElement("button");
        closeBtn.className = "me-bl-close";
        closeBtn.textContent = "×";
        closeBtn.onclick = () => this.close();
        h.appendChild(closeBtn);

        return h;
    }

    _buildFooter() {
        const f = document.createElement("div");
        f.className = "me-bl-footer";

        const importBtn = document.createElement("button");
        importBtn.className = "me-bl-import-btn";
        importBtn.textContent = t("brushLib.importFolder");
        importBtn.title = t("brushLib.importFolderTitle");
        importBtn.onclick = () => this._importFolder();
        f.appendChild(importBtn);

        const importAbrBtn = document.createElement("button");
        importAbrBtn.className = "me-bl-import-btn";
        importAbrBtn.textContent = t("brushLib.importAbr");
        importAbrBtn.title = t("brushLib.importAbrTitle");
        importAbrBtn.onclick = () => this._importAbr();
        f.appendChild(importAbrBtn);

        this._statusEl = document.createElement("span");
        this._statusEl.className = "me-bl-status";
        f.appendChild(this._statusEl);

        const closeBtn = document.createElement("button");
        closeBtn.className = "me-bl-cancel-btn";
        closeBtn.textContent = t("brushLib.close");
        closeBtn.onclick = () => this.close();
        f.appendChild(closeBtn);

        return f;
    }

    // ── Data loading ──────────────────────────────────────────────────

    async _loadTree() {
        this._setStatus(t("brushLib.loading"));
        try {
            const res = await fetch("/mask_editor/brushes/list");
            const data = await res.json();
            this._tree = data.tree || [];
        } catch {
            this._tree = [];
        }
        this._setStatus("");
        this._renderTree();
        this._showFolder(null); // "All Brushes"
    }

    // ── Tree rendering ────────────────────────────────────────────────

    _renderTree() {
        this._treeEl.innerHTML = "";

        // "All Brushes" root item
        const allItem = this._makeFolderTreeItem(
            t("brushLib.allBrushes"),
            null,
            -1,
            false,
        );
        allItem.classList.toggle("active", this._selectedPath === null);
        allItem.onclick = () => {
            this._selectedPath = null;
            this._renderTree();
            this._showFolder(null);
        };
        this._treeEl.appendChild(allItem);

        this._renderFolderNodes(this._treeEl, this._tree, 0);
    }

    _renderFolderNodes(container, nodes, depth) {
        for (const node of nodes) {
            if (node.type !== "folder") continue;
            const hasChildren = (node.children || []).some(c => c.type === "folder");
            const isExpanded  = this._expanded.has(node.path);

            const item = this._makeFolderTreeItem(
                node.name,
                node.path,
                depth,
                isExpanded,
            );
            item.classList.toggle("active", this._selectedPath === node.path);
            item.onclick = () => {
                if (isExpanded) {
                    this._expanded.delete(node.path);
                } else {
                    this._expanded.add(node.path);
                }
                this._selectedPath = node.path;
                this._renderTree();
                this._showFolder(node.path);
            };
            container.appendChild(item);

            if (isExpanded) {
                this._renderFolderNodes(container, node.children || [], depth + 1);
            }
        }
    }

    _makeFolderTreeItem(label, path, depth, expanded) {
        const item = document.createElement("div");
        item.className = "me-bl-folder-item";
        item.style.paddingLeft = (10 + Math.max(0, depth) * 14) + "px";

        const arrow = document.createElement("span");
        arrow.className = "me-bl-arrow";
        if (path !== null) {
            arrow.textContent = expanded ? "▼" : "▶";
        } else {
            arrow.textContent = ""; // "All Brushes" has no arrow
        }
        item.appendChild(arrow);

        const name = document.createElement("span");
        name.textContent = label;
        item.appendChild(name);

        return item;
    }

    // ── Grid rendering ────────────────────────────────────────────────

    _showFolder(path) {
        const files = path === null
            ? this._collectFiles(this._tree)
            : this._collectFiles(this._findFolder(this._tree, path)?.children || []);

        const grid = this._gridEl;
        grid.innerHTML = "";

        if (files.length === 0) {
            const empty = document.createElement("div");
            empty.className = "me-bl-empty";
            empty.textContent = this._tree.length === 0
                ? t("brushLib.noBrushes")
                : t("brushLib.noFolderBrushes");
            grid.appendChild(empty);
            return;
        }

        for (const file of files) {
            grid.appendChild(this._makeGridItem(file));
        }
    }

    _makeGridItem(node) {
        const item = document.createElement("div");
        item.className = "me-bl-grid-item";
        item.title = node.name;

        // Match CSS display size so canvas pixels ≡ display pixels
        const THUMB  = 64;
        const MARGIN = 2;
        const MAX    = THUMB - MARGIN * 2;  // 60px usable area

        const canvas = document.createElement("canvas");
        canvas.className = "me-bl-brush-thumb";
        canvas.width  = THUMB;
        canvas.height = THUMB;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#1a1a2a";
        ctx.fillRect(0, 0, THUMB, THUMB);

        const thumbImg = new Image();
        thumbImg.onload = () => {
            const srcW   = thumbImg.naturalWidth  || thumbImg.width;
            const srcH   = thumbImg.naturalHeight || thumbImg.height;
            const aspect = (srcW > 0 && srcH > 0) ? srcW / srcH : 1;

            // Use a 128-px intermediate canvas for quality pixel processing
            const WORK = 128;
            const wW = aspect >= 1 ? WORK : Math.max(1, Math.round(WORK * aspect));
            const wH = aspect >= 1 ? Math.max(1, Math.round(WORK / aspect)) : WORK;

            const tmp = document.createElement("canvas");
            tmp.width = wW; tmp.height = wH;
            const stx = tmp.getContext("2d");
            stx.drawImage(thumbImg, 0, 0, wW, wH);

            const imgData = stx.getImageData(0, 0, wW, wH);
            const d = imgData.data;

            // Detect whether image carries meaningful alpha (ABR-exported PNGs do)
            let hasAlpha = false;
            for (let i = 3; i < d.length; i += 4) {
                if (d[i] < 250) { hasAlpha = true; break; }
            }

            // For opaque images infer brush direction from corner luminance
            let invertLum = false;
            if (!hasAlpha) {
                const corners = [0, wW - 1, wW * (wH - 1), wW * wH - 1];
                let bgLum = 0;
                for (const ci of corners) {
                    const ii = ci * 4;
                    bgLum += (d[ii] * 0.299 + d[ii + 1] * 0.587 + d[ii + 2] * 0.114) / 255;
                }
                invertLum = (bgLum / corners.length) > 0.5;
            }

            // Convert to white pixels with alpha = brush density
            for (let i = 0; i < d.length; i += 4) {
                let alpha;
                if (hasAlpha) {
                    alpha = d[i + 3] / 255;
                } else {
                    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
                    alpha = invertLum ? 1 - lum : lum;
                }
                d[i] = d[i + 1] = d[i + 2] = 255;
                d[i + 3] = Math.round(alpha * 255);
            }
            stx.putImageData(imgData, 0, 0);

            // Find tight bounding box of visible pixels to trim transparent padding
            const THRESHOLD = 15;
            let x0 = wW, x1 = -1, y0 = wH, y1 = -1;
            for (let y = 0; y < wH; y++) {
                for (let x = 0; x < wW; x++) {
                    if (d[(y * wW + x) * 4 + 3] > THRESHOLD) {
                        if (x < x0) x0 = x;
                        if (x > x1) x1 = x;
                        if (y < y0) y0 = y;
                        if (y > y1) y1 = y;
                    }
                }
            }

            if (x1 >= x0 && y1 >= y0) {
                const cW = x1 - x0 + 1;
                const cH = y1 - y0 + 1;
                const s  = Math.min(MAX / cW, MAX / cH);
                const dW = Math.round(cW * s);
                const dH = Math.round(cH * s);
                const dx = Math.round((THUMB - dW) / 2);
                const dy = Math.round((THUMB - dH) / 2);
                // drawImage with source crop: trims padding, scales to fit MAX×MAX
                ctx.drawImage(tmp, x0, y0, cW, cH, dx, dy, dW, dH);
            }
        };
        thumbImg.src = `/mask_editor/brushes/raw?path=${encodeURIComponent(node.path)}`;
        item.appendChild(canvas);

        const label = document.createElement("div");
        label.className = "me-bl-brush-name";
        label.textContent = node.name;
        item.appendChild(label);

        item.onclick = () => this._selectBrush(node);
        return item;
    }

    // ── Brush selection ───────────────────────────────────────────────

    _selectBrush(node) {
        const img = new Image();
        img.onload = () => {
            if (this._onSelect) this._onSelect(img, node.name);
            this.close();
        };
        img.onerror = () => {
            this._setStatus(t("brushLib.failedLoad"), 3000);
        };
        img.src = `/mask_editor/brushes/raw?path=${encodeURIComponent(node.path)}`;
    }

    // ── Import folder ─────────────────────────────────────────────────

    _importFolder() {
        const input = document.createElement("input");
        input.type = "file";
        input.webkitdirectory = true;
        input.multiple = true;

        input.onchange = async () => {
            const allFiles = Array.from(input.files).filter(f =>
                /\.(png|jpg|jpeg|webp|bmp)$/i.test(f.name)
            );
            if (allFiles.length === 0) return;

            this._setStatus(t("brushLib.reading", { n: allFiles.length }));

            let fileData;
            try {
                fileData = await Promise.all(allFiles.map(f => this._readFile(f)));
            } catch {
                this._setStatus(t("brushLib.failedRead"), 3000);
                return;
            }

            this._setStatus(t("brushLib.uploading", { n: fileData.length }));
            try {
                const res = await fetch("/mask_editor/brushes/import", {
                    method:  "POST",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({ files: fileData }),
                });
                const result = await res.json();
                this._setStatus(t("brushLib.imported", { n: result.imported }), 3000);
                this._loadTree();
            } catch {
                this._setStatus(t("brushLib.importFailed"), 3000);
            }
        };

        input.click();
    }

    _readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve({ path: file.webkitRelativePath || file.name, data: reader.result });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ── Import ABR ────────────────────────────────────────────────────

    _importAbr() {
        const input = document.createElement("input");
        input.type   = "file";
        input.accept = ".abr";
        this._abrInput = input;   // prevent GC before change fires

        input.addEventListener("change", async () => {
            const file = input.files[0];
            if (!file) return;

            this._setStatus(t("brushLib.uploadingAbr", { name: file.name, size: (file.size / 1048576).toFixed(1) }));
            try {
                const form = new FormData();
                form.append("file", file);
                const res = await fetch("/mask_editor/brushes/upload_abr", {
                    method: "POST",
                    body:   form,
                });
                const result = await res.json();
                if (result.error) {
                    this._setStatus(t("common.error") + result.error, 5000);
                } else {
                    this._setStatus(
                        t("brushLib.importedInto", { n: result.imported, folder: result.folder }),
                        4000,
                    );
                    this._loadTree();
                }
            } catch {
                this._setStatus(t("brushLib.importFailed"), 3000);
            }
        });

        input.click();
    }

    // ── Utilities ─────────────────────────────────────────────────────

    /** Recursively collect all file nodes from a tree. */
    _collectFiles(nodes) {
        const result = [];
        for (const node of nodes) {
            if (node.type === "file") {
                result.push(node);
            } else if (node.type === "folder" && node.children) {
                result.push(...this._collectFiles(node.children));
            }
        }
        return result;
    }

    /** Find a folder node by path. */
    _findFolder(nodes, path) {
        for (const node of nodes) {
            if (node.type === "folder") {
                if (node.path === path) return node;
                const found = this._findFolder(node.children || [], path);
                if (found) return found;
            }
        }
        return null;
    }

    _setStatus(msg, clearAfterMs = 0) {
        if (!this._statusEl) return;
        this._statusEl.textContent = msg;
        if (clearAfterMs > 0) {
            setTimeout(() => { if (this._statusEl) this._statusEl.textContent = ""; }, clearAfterMs);
        }
    }
}
