// ノード状態の共有ストア（maskEditor.js ↔ MaskEditorModal.js の循環 import を解消するため分離）

const _callbacks = new Map();

export function registerMaskPreviewCallback(nodeId, fn) {
    _callbacks.set(nodeId, fn);
}

export function unregisterMaskPreviewCallback(nodeId) {
    _callbacks.delete(nodeId);
}

export function notifyMaskPreviewUpdate(nodeId, maskDataUrl) {
    const fn = _callbacks.get(nodeId);
    if (fn) fn(maskDataUrl);
}
