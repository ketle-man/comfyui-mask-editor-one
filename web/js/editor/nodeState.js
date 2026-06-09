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
