// ノード状態の共有ストア（maskEditor.js ↔ MaskEditorModal.js の循環 import を解消するため分離）
// WeakMap を使うことで onNodeCreated 時点の id=-1 問題を回避し、GC も自動処理される

const _callbacks = new WeakMap();

export function registerMaskPreviewCallback(node, fn) {
    _callbacks.set(node, fn);
}

export function unregisterMaskPreviewCallback(node) {
    _callbacks.delete(node);
}

export function notifyMaskPreviewUpdate(node, maskDataUrl) {
    const fn = _callbacks.get(node);
    if (fn) fn(maskDataUrl);
}

// BG 画像を input/mask_editor にアップロードし、参照をワークフロー（node.properties）に保存
// ワークフロー切り替え・再読み込み時に onConfigure で復元される
// アップロード完了までに古い参照が復元されないよう、先に既存の参照を破棄する
export function persistBgImage(node, file, filename = file.name) {
    node.properties ??= {};
    delete node.properties.bg_image;
    const body = new FormData();
    body.append("image", file, filename);
    body.append("subfolder", "mask_editor");
    body.append("type", "input");
    return fetch("/upload/image", { method: "POST", body })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data) node.properties.bg_image = { name: data.name, subfolder: data.subfolder, filename };
        })
        .catch(() => {});
}
