export class Layer {
    constructor(name, type, width, height) {
        this.id = crypto.randomUUID();
        this.name = name;
        this.type = type; // 'paint' | 'color' | 'transparency'
        this.canvas = document.createElement("canvas");
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext("2d");
        this.visible = true;
        this.opacity = 1.0;
        this.operation = "add"; // 'add' | 'subtract'
        this.data = {};
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    resize(width, height) {
        const tmp = document.createElement("canvas");
        tmp.width = width;
        tmp.height = height;
        const tmpCtx = tmp.getContext("2d");
        tmpCtx.drawImage(this.canvas, 0, 0, width, height);
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext("2d");
        this.ctx.drawImage(tmp, 0, 0);
    }

    getThumbnailDataURL() {
        const thumb = document.createElement("canvas");
        const s = 28;
        thumb.width = s;
        thumb.height = s;
        thumb.getContext("2d").drawImage(this.canvas, 0, 0, s, s);
        return thumb.toDataURL("image/png");
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            imageData: this.canvas.toDataURL("image/png"),
            visible: this.visible,
            opacity: this.opacity,
            operation: this.operation,
            data: this.data,
        };
    }

    static fromJSON(json, width, height) {
        const layer = new Layer(json.name, json.type, width, height);
        layer.id = json.id;
        layer.visible = json.visible ?? true;
        layer.opacity = json.opacity ?? 1.0;
        layer.operation = json.operation ?? "add";
        layer.data = json.data ?? {};

        if (json.imageData) {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    layer.ctx.clearRect(0, 0, width, height);
                    layer.ctx.drawImage(img, 0, 0, width, height);
                    resolve(layer);
                };
                img.onerror = () => resolve(layer);
                img.src = json.imageData;
            });
        }
        return Promise.resolve(layer);
    }
}

export class LayerManager {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.layers = [];
        this.activeIndex = 0;
        this._listeners = [];
    }

    get activeLayer() {
        return this.layers[this.activeIndex] ?? null;
    }

    addLayer(type = "paint", name = null) {
        const n = name ?? `Layer ${this.layers.length + 1}`;
        const layer = new Layer(n, type, this.width, this.height);
        this.layers.unshift(layer); // 先頭 = 最前面
        this.activeIndex = 0;
        this._emit("change");
        return layer;
    }

    deleteLayer(id) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx < 0) return;
        this.layers.splice(idx, 1);
        this.activeIndex = Math.min(this.activeIndex, Math.max(0, this.layers.length - 1));
        this._emit("change");
    }

    setActive(id) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx >= 0) {
            this.activeIndex = idx;
            this._emit("activeChange", this.layers[idx]);
        }
    }

    moveUp(id) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx <= 0) return;
        [this.layers[idx - 1], this.layers[idx]] = [this.layers[idx], this.layers[idx - 1]];
        if (this.activeIndex === idx) this.activeIndex = idx - 1;
        else if (this.activeIndex === idx - 1) this.activeIndex = idx;
        this._emit("change");
    }

    moveDown(id) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx < 0 || idx >= this.layers.length - 1) return;
        [this.layers[idx], this.layers[idx + 1]] = [this.layers[idx + 1], this.layers[idx]];
        if (this.activeIndex === idx) this.activeIndex = idx + 1;
        else if (this.activeIndex === idx + 1) this.activeIndex = idx;
        this._emit("change");
    }

    toggleVisible(id) {
        const layer = this.layers.find(l => l.id === id);
        if (layer) {
            layer.visible = !layer.visible;
            this._emit("change");
        }
    }

    setOperation(id, op) {
        const layer = this.layers.find(l => l.id === id);
        if (layer) {
            layer.operation = op;
            this._emit("change");
        }
    }

    setOpacity(id, opacity) {
        const layer = this.layers.find(l => l.id === id);
        if (layer) {
            layer.opacity = opacity;
            this._emit("change");
        }
    }

    on(event, fn) {
        this._listeners.push({ event, fn });
    }

    _emit(event, data) {
        for (const l of this._listeners) {
            if (l.event === event) l.fn(data);
        }
    }

    toJSON() {
        return {
            layers: this.layers.map(l => l.toJSON()),
            inverted: false,
            width: this.width,
            height: this.height,
        };
    }

    async fromJSON(json) {
        if (!json?.layers) return;
        const w = json.width ?? this.width;
        const h = json.height ?? this.height;
        const layers = await Promise.all(
            json.layers.map(l => Layer.fromJSON(l, w, h))
        );
        this.layers = layers;
        this.activeIndex = 0;
        this._emit("change");
    }
}
