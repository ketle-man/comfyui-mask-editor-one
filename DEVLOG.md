# Development Log

Mask Editor One の開発記録。新しいエントリは上に追加する。

---

## 2026-05-27 — MIT ライセンス適用・README Acknowledgements 追加

### 概要

ライセンスを MIT に確定し、依存モデルの帰属情報を README 3言語版に追加した。

### 追加ファイル

- [LICENSE](LICENSE) — MIT License（Copyright 2025 Statsu）

### 変更ファイル

- [README.md](README.md) — ライセンスセクション更新・Acknowledgements 追加
- [README_en.md](README_en.md) — License 更新・Acknowledgements 追加
- [README_zh.md](README_zh.md) — 许可证 更新・致谢 追加

### Acknowledgements 記載内容

| 項目 | URL | 備考 |
|---|---|---|
| SAM3 / SAM 3.1 (Meta FAIR) | huggingface.co/facebook/sam3 | Apache-2.0 |
| BiRefNet (ZhengPeng7) | huggingface.co/zhengpeng7/BiRefNet | MIT、ComfyUI ネイティブ実装 (`comfy.bg_removal_model`) 経由で使用 |

---

## 2026-05-27 — GitHub 初回リリース v0.1.0

### 概要

`ketle-man/comfyui-mask-editor-one` として GitHub に公開リポジトリを作成し、v0.1.0 タグでリリースした。

### 作業内容

- `.gitignore` を追加（`__pycache__/`・`*.pyc`・`brushes/`・`.DS_Store` を除外）
- `git init` → 33 ファイル / 10,455 行を初回コミット
- `gh repo create` でパブリックリポジトリを作成しプッシュ
- `gh release create v0.1.0` でリリースを公開

### リンク

- リポジトリ: https://github.com/ketle-man/comfyui-mask-editor-one
- リリース: https://github.com/ketle-man/comfyui-mask-editor-one/releases/tag/v0.1.0

---

## 2026-05-27 — README スクリーンショット追加・多言語 README 整備

### 概要

`docs/` フォルダに保存した 5 枚のスクリーンキャプチャを README に組み込み、英語・中国語の README を新規作成した。

### 追加ファイル

- [docs/1_node.png](docs/1_node.png) — ノード（画像プレビュー表示）
- [docs/2_node_mask.png](docs/2_node_mask.png) — ノード（マスクプレビュー表示）
- [docs/3_mask_editor.png](docs/3_mask_editor.png) — メインエディタ全体
- [docs/4_menu.png](docs/4_menu.png) — ツールサイドバー
- [docs/5_brush_library.png](docs/5_brush_library.png) — ブラシライブラリ
- [README_en.md](README_en.md) — 英語 README（全セクション翻訳）
- [README_zh.md](README_zh.md) — 中国語 README（全セクション翻訳）

### 変更ファイル

- [README.md](README.md) — 言語リンク追加・ヒーロー画像・各セクションにスクリーンショット挿入

### 画像配置

| 画像 | 配置箇所 |
|---|---|
| `3_mask_editor.png` | タイトル直下（ヒーロー） |
| `4_menu.png` | 「基本」節に右フロート |
| `1_node.png` + `2_node_mask.png` | 「ノード上の BG ボタン」節の下に横並び |
| `5_brush_library.png` | 「ブラシライブラリ」節の説明直後 |

各 README の先頭に `[English](README_en.md) | **日本語** | [中文](README_zh.md)` 形式の言語切り替えリンクを配置。

---

## 2026-05-27 — ノードボタン i18n 対応（maskEditor.js）

### 概要

`maskEditor.js` のノード上ボタン（BG・表示切替・Edit Mask）がハードコードされた文字列を使っており i18n 未対応だった問題を修正した。言語切り替え時にモーダル内だけでなくノードウィジェットのラベルも即時更新されるようになった。

### 変更ファイル

- [web/js/editor/i18n.js](web/js/editor/i18n.js) — en/ja/zh に `node.*` キー 4 件を追加
- [web/js/maskEditor.js](web/js/maskEditor.js) — `t()` をインポート、全ボタンを `t()` 経由に変更、`node._viewWidget` / `node._editMaskWidget` を保存
- [web/js/editor/MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — `_rebuildWithLang()` でノードウィジェット 3 件を更新

### 追加した i18n キー

| キー | en | ja | zh |
|---|---|---|---|
| `node.showImage` | 👁 Show: Image | 👁 表示: 画像 | 👁 显示: 图像 |
| `node.showMask` | 👁 Show: Mask | 👁 表示: マスク | 👁 显示: 蒙版 |
| `node.editMask` | ✏️  Edit Mask | ✏️  マスク編集 | ✏️  编辑蒙版 |
| `node.bgClear` | 🖼 BG ✕ | 🖼 BG ✕ | 🖼 背景 ✕ |

### 実装のポイント

ノードウィジェットは `onNodeCreated` 時に一度だけ生成されるため、言語変更時に自動更新されない。`node._viewWidget` / `node._editMaskWidget` として参照を保存し、`_rebuildWithLang()` の末尾でラベルを書き換え `setDirtyCanvas(true, true)` で再描画することで解決した。

```javascript
// MaskEditorModal.js — _rebuildWithLang() 末尾
if (node._viewWidget)
    node._viewWidget.name = node._previewMode === "image"
        ? t("node.showImage") : t("node.showMask");
if (node._bgWidget)
    node._bgWidget.name = node._bgDataUrl ? t("node.bgClear") : t("footer.bg");
if (node._editMaskWidget)
    node._editMaskWidget.name = t("node.editMask");
node.setDirtyCanvas(true, true);
```

---

## 2026-05-27 — i18n 多言語対応（英語・日本語・中国語）

### 概要

UI テキストをすべて翻訳関数 `t(key)` 経由に切り替え、フッターの言語セレクターで英語・日本語・中国語を実行時に切り替えられるようにした。言語設定は `localStorage` に保存され、次回起動時も引き継がれる。

### 追加ファイル

- [web/js/editor/i18n.js](web/js/editor/i18n.js) — 翻訳辞書・`t()`・`getLang()`・`setLang()` エクスポート

### 変更ファイル

- [web/js/editor/MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — 全 UI 文字列を `t()` に置き換え・言語セレクター追加・`_rebuildWithLang()` 実装
- [web/js/editor/BrushLibrary.js](web/js/editor/BrushLibrary.js) — 全 UI 文字列を `t()` に置き換え
- [web/css/maskEditor.css](web/css/maskEditor.css) — `.me-lang-sel` スタイル追加

---

### 1. i18n.js — 翻訳モジュール

```javascript
// 言語検出優先順位
// 1. localStorage.getItem("me-lang")
// 2. navigator.language.slice(0, 2)  ("ja", "zh", ...)
// 3. デフォルト "en"

export function t(key, params = {}) {
    const dict = LOCALES[_lang] ?? LOCALES.en;
    let str = dict[key] ?? LOCALES.en[key] ?? key;
    for (const [k, v] of Object.entries(params))
        str = str.replaceAll(`{${k}}`, v);
    return str;
}
```

翻訳キーは `"tool.paint"`・`"footer.showImage"`・`"layers.defaultName"` のようなドット区切り文字列。パラメータは `t("layers.defaultName", { n: 1 })` → `"Layer 1"` / `"レイヤー 1"` / `"图层 1"` のように展開される。

en/ja/zh で約 80 キーを実装。フォールバック: `ja/zh` にないキーは `en` から補完し、`en` にもなければキー名をそのまま表示。

---

### 2. 言語切り替え — `_rebuildWithLang(lang)`

言語変更時は DOM を破棄して再構築することで、テキストを埋め込んだ全要素をクリーンに再生成する。  
状態の保存・復元フロー:

```javascript
async _rebuildWithLang(lang) {
    setLang(lang);                    // localStorage に保存
    const savedJson    = this._layerMgr.toJSON();   // レイヤーデータ保存
    const savedInverted = this._inverted;
    const savedBlur     = this._blurRadius;
    const savedBgImage  = this._bgImage;

    this._overlay.remove();
    document.removeEventListener("keydown", this._keyHandler);
    this._overlay = null; this._layerMgr = null;

    this._buildDOM();                 // DOM 再構築（新言語で全テキスト生成）
    document.body.appendChild(this._overlay);

    this._bgImage = savedBgImage;
    if (savedJson) await this._layerMgr.fromJSON(savedJson);  // レイヤー復元
    this._inverted = savedInverted;
    this._blurRadius = savedBlur;
    // ...スライダー・プレビュー更新
}
```

`_layerMgr.fromJSON()` が Promise を返すため `async/await` で処理。旧 `_keyHandler` を `removeEventListener` してから再構築することで重複登録を防ぐ。

---

### 3. 言語セレクター UI

フッターの Apply ボタン右隣に `<select class="me-lang-sel">` を配置：

```javascript
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
```

変更前に `confirm()` ダイアログを表示して誤操作を防ぐ。

---

## 2026-05-27 — ペイントブラシ サイズ・回転ジッター

### 概要

ペイントツールにサイズジッターと回転ジッターを追加した。各スタンプでランダムにブラシサイズ・回転角を変化させ、より自然な筆致を実現する。

### 変更ファイル

- [web/js/editor/tools/PaintTool.js](web/js/editor/tools/PaintTool.js) — `sizeJitter`・`sizeJitterAmount`・`rotationJitter` プロパティ追加・`_paintToStroke()` にジッター処理追加
- [web/js/editor/MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — `_buildPaintOptions()` にジッター UI 追加

---

### 1. PaintTool.js — ジッター実装

各スタンプ描画時（`_paintToStroke()`）に有効なジッターを適用する。スタンプ後は元のパラメータとスタンプキャッシュを復元することで、基底のスタンプキャッシュを汚さない設計：

```javascript
_paintToStroke(x, y) {
    if (this.sizeJitter || this.rotationJitter) {
        const savedSize  = this.brushSize;
        const savedAngle = this.angle;
        const savedStamp = this._stamp;

        if (this.sizeJitter)
            this.brushSize = savedSize * (1 - Math.random() * this.sizeJitterAmount);
        if (this.rotationJitter)
            this.angle = Math.random() * 360;

        this._paintImageBrush / _paintCircle ...  // ジッター適用済みパラメータで描画

        // キャッシュを含めて元に戻す
        this.brushSize  = savedSize;
        this.angle      = savedAngle;
        this._stamp     = savedStamp;
    }
}
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `sizeJitter` | boolean | サイズジッターの ON/OFF |
| `sizeJitterAmount` | 0.0〜1.0 | 最大縮小率。0.5 の場合 50% 〜 100% の範囲でランダム |
| `rotationJitter` | boolean | 回転ジッターの ON/OFF（スタンプごとに 0°〜360° をランダム） |

---

### 2. MaskEditorModal.js — ジッター UI

ブラシオプションパネル（`_buildPaintOptions()`）の Angle スライダーの下にジッターセクションを追加：

- **Size Jitter** チェックボックス + **Amount** スライダー（0〜100%）が連動。チェックOFF時はスライダーを無効化
- **Rotation Jitter** チェックボックス（画像ブラシの角度を各スタンプでランダム化）

---

## 2026-05-27 — ABR v6 Atenais フォーマット対応（循環シフトバグ修正）

### 概要

Atenais 製 ABR ファイル（`05_Flames.abr`、`05_Fire.abr` 等）をインポートすると、抽出されたブラシ画像に水平方向の循環シフトが発生していた問題を修正した。

### 変更ファイル

- [abr_parser.py](abr_parser.py) — `_extract_v6sub2_entry` に Strategy 0b（`table_off=320`）を追加

---

### 症状

`05_Flames.abr` をインポートすると 30 ブラシすべてが横方向にシフトした画像として抽出されていた。FFT 相互相関で確認すると corr≈1.0（ピクセルデータ自体は正しい）だが shift≠0 だった。既存の Strategy 3（単一ストリーム PackBits、offset 66 から開始）にフォールバックしていたため循環シフトが起きていた。

---

### 根本原因の調査

全 30 エントリのバイト列を比較した結果、`offset 66〜293` の 228 バイトが全エントリで完全に一致する**固定プリアンブル**であることが判明。

`offset 285〜330` 付近のバイト列を詳細解析：

```
[319]          0x01 = compression type 1 (RLE/PackBits)
[320:322]      00 2e (= 46) → BE u16 行バイト数テーブルの先頭
[322:324]      00 2e (= 46) → 2行目も同じ値
```

Adobe Photoshop File Formats Specification に記載された **PSD Image Data Section** と完全に一致する構造（2B compression + h×2B の BE u16 行カウントテーブル + PackBits データ）が offset 319 から始まっていた。

**Atenais ABR エントリの完全構造：**

```
[0:66]          一次ヘッダー（UUID + メタデータ + bounds）
[66:294]        固定プリアンブル（228 バイト、全エントリ共通）
[294:298]       データサイズ BE u32 = entry_len - 306
[298:304]       定数 00 00 00 08 00 00
[304:308]       top 座標 BE u32（ピクセル）
[308:312]       left 座標 BE u32
[312:316]       bottom = h BE u32
[316:320]       right = w BE u32
[319]           compression = 1（RLE/PackBits）
[320:320+h×2]   行バイト数テーブル（h × BE u16）
[320+h×2:]      PackBits 圧縮ピクセルデータ（各行独立）
```

既存の `_row_packbits(entry_data, w, h, table_off=66)` は BE u16 の行カウントテーブルを offset 66 で探すため失敗。`table_off=320` を指定することで正しく復号できる。

---

### 修正内容

`_extract_v6sub2_entry` に **Strategy 0b** を追加（Strategy 0 と Strategy 1 の間に挿入）：

```python
# Strategy 0b: per-row PackBits with BE u16 row-count table at offset 320.
# Used by Atenais and similar ABR files that have a 254-byte fixed preamble
# from offset 66, followed by a 26-byte PSD-style image descriptor
# (bounds, depth, compression=1) ending at byte 319, with the row count
# table starting at byte 320.
row_data = _row_packbits(entry_data, w, h, table_off=320)
if row_data is not None and len(row_data) == needed:
    log.debug("v6sub2 entry#%d: decoded via per-row packbits (table_off=320)", idx)
    return {'name': uuid, 'size': (w, h), 'data': row_data, 'mode': 'L'}
```

既存の `_row_packbits` 関数は LE/BE 両方の u16 を試みるため、追加実装は不要。

---

### 検証結果

| ファイル | 結果 |
|---|---|
| `05_Flames.abr` | 30/30 エントリ正常抽出、参照画像と MAE=0.00（完全一致） |
| `05_Fire.abr` | 45 ブラシ正常抽出 |
| `rons_flames.abr` | 39 ブラシ正常（リグレッションなし） |

---

## 2026-05-25 — セキュリティ強化

### 概要

セキュリティレビューで発見された 8 件の問題（Critical 2・High 4・Medium 2）を修正した。

### 変更ファイル

- [server.py](server.py) — サイズ制限・パストラバーサル修正・エラーメッセージ無害化・stem サニタイズ
- [sam3_inference.py](sam3_inference.py) — `torch.load` パッチ安全化・レスポンスからパス除去
- [birefnet_inference.py](birefnet_inference.py) — `get_status()` からフルパス除去
- [abr_parser.py](abr_parser.py) — ブラシサイズ・件数上限追加
- [web/js/editor/MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — `innerHTML` 使用箇所にガードコメント追加

---

### 1. リクエストサイズ制限 (C-1)

全エンドポイントに 100 MB の受信サイズ上限を追加。`_read_json()` ヘルパーを新設し、`Content-Length` ヘッダーの事前チェックと読み込み後の実サイズチェックを二段階で実施。`import_brushes` はさらにファイル件数を 500 件に制限。

```python
MAX_BODY_BYTES    = 100 * 1024 * 1024
_MAX_IMPORT_FILES = 500

async def _read_json(request):
    if request.content_length and request.content_length > MAX_BODY_BYTES:
        raise web.HTTPRequestEntityTooLarge(...)
    raw = await request.read()
    if len(raw) > MAX_BODY_BYTES:
        raise web.HTTPRequestEntityTooLarge(...)
    return json.loads(raw)
```

---

### 2. パストラバーサル修正 (C-2)

`import_brushes` のパスガードで `startswith(brush_root)` を使っていたため、Windows の隣接ディレクトリ（`C:\brushes_evil\...`）を誤許可する問題があった。`_within_brush_dir()` ヘルパーを追加し、セパレータを含めた比較に変更。

```python
_BRUSH_SEP = "/" if "/" in _BRUSH_ROOT else "\\"

def _within_brush_dir(target):
    t = str(target)
    return t == _BRUSH_ROOT or t.startswith(_BRUSH_ROOT + _BRUSH_SEP)
```

`get_brush_raw` は既に正しいガードを使っていたが、`import_brushes` が不完全な実装になっていた。

---

### 3. ABR フォルダ名サニタイズ (H-1)

`upload_abr` で `filename` から生成するフォルダ名 `stem` を正規表現でサニタイズし、英数字・アンダースコア・ハイフン以外を `_` に置換。最大 64 文字に切り詰め。

```python
stem = re.sub(r'[^\w\-]', '_', pathlib.Path(filename).stem)[:64] or "brushes"
```

---

### 4. torch.load パッチの安全化 (H-2)

`sam3_inference.py` の `load_model()` で `torch.load` を全面的に `weights_only=False` に強制していた。PyTorch 2.6 が追加した `weights_only=True`（pickle デシリアライズ無効）というセキュリティ機能を丸ごと無効化する実装だった。

修正後は `weights_only=True` を優先し、失敗した場合のみ `False` にフォールバック（ログに警告を記録）。

```python
def _patched_load(*a, **kw):
    if "weights_only" not in kw:
        try:
            return _orig_load(*a, **{**kw, "weights_only": True})
        except Exception:
            log.warning("weights_only=True failed; retrying with weights_only=False (pickle)")
            return _orig_load(*a, **{**kw, "weights_only": False})
    return _orig_load(*a, **kw)
```

---

### 5. エラーメッセージの無害化 (H-3)

SAM3・BiRefNet の推論エラーレスポンスで `str(e)` をそのままクライアントに返していた。例外メッセージにはファイルパス・スタックフレーム等の内部情報が含まれる可能性があるため、汎用メッセージに置換し、詳細は `log.exception()` のみに記録するよう統一。

```python
# 修正前
return web.json_response({"error": f"image decode failed: {e}"}, status=500)

# 修正後
log.exception("SAM3 image decode failed")
return web.json_response({"error": "image decode failed"}, status=500)
```

---

### 6. ステータス API からフルパスを除去 (H-4)

`GET /mask_editor/birefnet/status` と `GET /mask_editor/sam3/status` がモデルファイルの絶対パス（`C:\Users\...`）をレスポンスに含めていた。ファイル名のみを返すよう変更。JS 側は `model_path` からファイル名を抽出して使っていたため後方互換あり。

```python
# birefnet_inference.py
"model_path": path.name if path else None   # str(path) → path.name

# sam3_inference.py
def _basename(p):
    return pathlib.Path(p).name if p else None

"model_path": _basename(_loaded_ckpt),
"ckpt_path":  _basename(ckpt),
```

`list_models()` も `"path": str(p)` エントリを削除し、`name` のみを返すよう変更。

---

### 7. innerHTML へのガードコメント (M-1)

`MaskEditorModal.js` の `innerHTML` 使用箇所に、ユーザー入力を渡してはならない旨のコメントを追加。現在は全て静的文字列のため脆弱性はないが、将来の誤実装を防ぐためのガード。

```javascript
// NOTE: only static strings here — never insert user-controlled values (XSS)
hint.innerHTML = "<b>Click</b> to add points<br>...";
```

---

### 8. ABR ブラシの最大サイズ・件数制限 (M-3)

細工した ABR で大量の大型ブラシを処理させるメモリ枯渇 DoS を防ぐため上限を設定。

```python
_MAX_BRUSH_DIM = 4096   # 一辺の最大ピクセル数（全パーサーに適用）
_MAX_BRUSHES   = 500    # 1ファイルあたりの最大ブラシ数
```

| 比較 | サイズ/エントリ |
|---|---|
| 旧上限（8192×8192） | 約 64 MB |
| 新上限（4096×4096） | 約 16 MB（1/4 に削減） |

---

## 2026-05-25 — ノード名変更・クイックマスク表示・Mode ボタン化・カーソル改善

### 概要

ノード識別性向上のためクラス名・表示名を `MaskEditorOne` / `"Mask Editor One"` に変更。マスクプレビューを Photoshop クイックマスクスタイルに刷新し、プレビューが更新されなかったバグを根本修正。全ツールの Mode 選択をボタングループに変更し、テキストツールのカーソルを十字に変更した。

### 変更ファイル

- [nodes.py](nodes.py) — クラス名・`NODE_CLASS_MAPPINGS`・`NODE_DISPLAY_NAME_MAPPINGS` を変更
- [web/js/maskEditor.js](web/js/maskEditor.js) — extension name・`nodeData.name` 判定を変更
- [web/js/editor/MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — モーダルタイトル変更・`drawCanvas` opacity=0・オーバーレイカラーピッカー追加・`_makeModeRow()` 追加・全ツール Mode ドロップダウンをボタングループに置換・`_apply()` グレースケール変換修正
- [web/js/editor/CanvasCompositor.js](web/js/editor/CanvasCompositor.js) — `composite()` 黒背景削除・`renderPreview()` クイックマスクスタイル実装・`overlayColor` パラメータ追加
- [web/js/editor/tools/TextTool.js](web/js/editor/tools/TextTool.js) — `activate()` カーソルを `"text"` → `"crosshair"` に変更
- [web/css/maskEditor.css](web/css/maskEditor.css) — `.me-mode-btn-group` / `.me-mode-btn` スタイル追加

---

### 1. ノード名変更

| 変更前 | 変更後 |
|---|---|
| `class MaskEditorNode` | `class MaskEditorOne` |
| `NODE_CLASS_MAPPINGS["MaskEditorNode"]` | `NODE_CLASS_MAPPINGS["MaskEditorOne"]` |
| 表示名 `"Mask Editor"` | `"Mask Editor One"` |
| JS extension `"ComfyUI.MaskEditor"` | `"ComfyUI.MaskEditorOne"` |
| モーダルタイトル `"Mask Editor"` | `"Mask Editor One"` |

**既存ワークフローへの影響**: クラス名変更のため、`MaskEditorNode` として保存されたワークフローはノードを置き換える必要がある。

---

### 2. マスクプレビュー根本バグ修正 — composite() のアルファ化

**問題**: マスクを描画してもプレビューキャンバスの表示が変化しなかった（レイヤーサムネイルには反映されていた）。

**根本原因**: `composite()` が黒背景（alpha=1）を持つ RGB 白黒キャンバスを返していたため、`renderPreview()` 内の `destination-out` / `source-in` 合成演算が全ピクセルに対して等しく作用し、オーバーレイが全消去されていた。

```
destination-out では source のアルファ値で destination を削除する。
黒背景（alpha=1）を持つ maskCanvas は白い部分も黒い部分も alpha=1 のため、
全ての destination ピクセルが消去されてしまう。
```

**修正 [CanvasCompositor.js](web/js/editor/CanvasCompositor.js)**:

```javascript
// 修正前: 黒背景を持つ RGB 白黒キャンバス
ctx.fillStyle = "black";
ctx.fillRect(0, 0, width, height);

// 修正後: 透明背景（アルファベース）
// 上記2行を削除 → 描画部分が alpha=1、未描画が alpha=0 のキャンバスを返す
```

**`_apply()` の修正 [MaskEditorModal.js](web/js/editor/MaskEditorModal.js)**:

`composite()` がアルファベースになったため、`updateNodeMaskPreview()` に渡す前にグレースケール変換が必要になった。

```javascript
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
updateNodeMaskPreview(this.node, toGray(alphaMask, this._inverted).toDataURL("image/png"));
```

---

### 3. Photoshop クイックマスクスタイル

**変更前**: マスク領域（描いた部分）に赤オーバーレイを重ねていた。  
**変更後**: 画像全体に半透明オーバーレイ → 描いた部分のオーバーレイを `destination-out` で除去。

```
通常時 (inverted=false):
  全体に色オーバーレイ → maskCanvas でマスク領域を切り抜き → 描いた部分は元画像

Invert 時 (inverted=true):
  maskCanvas を source-in → 描いた部分に色オーバーレイ（ブラシ色として可視化）

画像なし (showImage=false):
  inverted に応じてマスクを反転してから色オーバーレイ
```

**drawCanvas の非表示化**: 白いマスクが直接見えていた問題を修正。

```javascript
this._drawCanvas.style.opacity = "0"; // 描画内容は previewCanvas 経由で表示
```

---

### 4. オーバーレイカラーピッカー

Invert チェックの横に `<input type="color">` を追加。選択した色が `overlayColor` プロパティに保存され、即時 `_updatePreview()` に反映される。デフォルト `#ff0000`。

```javascript
this._overlayColor = "#ff0000";
// renderPreview の呼び出し
this._compositor.renderPreview(
    this._previewCanvas, layers, showImage, this._inverted, this._overlayColor
);
```

---

### 5. Mode ボタングループ化

全ツール（Paint・Color・Text・Vector・Shape・SAM3・BiRefNet）の Mode 選択を `<select>` ドロップダウンから `[Add] [Erase]` ボタングループに変更。

`_makeModeRow()` ヘルパーを追加:

```javascript
_makeModeRow(tool, options) {
    // options 例: [["add", "Add"], ["erase", "Erase"]]
    // クリックで tool.mode を更新し、ボタンの .active クラスを切り替える
}
```

CSS に `.me-mode-btn-group` / `.me-mode-btn` / `.me-mode-btn.active` を追加。

---

### 6. テキストツールの十字カーソル

```javascript
// TextTool.activate()
// 修正前
this.drawCanvas.style.cursor = "text";
// 修正後
this.drawCanvas.style.cursor = "crosshair";
```

---

## 2026-05-25 — BiRefNet 背景除去ツール実装

### 概要

ComfyUI ネイティブの BiRefNet 実装（`comfy.bg_removal_model`）を利用した背景除去ツールを追加した。HuggingFace transformers や外部ライブラリへの依存を一切持たず、`models/background_removal/birefnet.safetensors` を配置するだけで動作する。

### 追加ファイル

- [birefnet_inference.py](birefnet_inference.py) — BiRefNet 背景除去バックエンド
- [web/js/editor/tools/BiRefNetTool.js](web/js/editor/tools/BiRefNetTool.js) — フロントエンドツールクラス

### 変更ファイル

- [server.py](server.py) — BiRefNet API エンドポイント 2本を追加
- [web/js/editor/MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — BiRefNetTool 統合（TOOL_DEFS・import・`_buildBiRefNetOptions()`）

---

### 1. アーキテクチャの発見 — comfy.bg_removal_model

当初は `transformers.AutoModelForImageSegmentation` 経由で BiRefNet をロードしようとしたが、HuggingFace Hub の `trust_remote_code` エラーが発生した。

調査の結果、ComfyUI には `comfy/background_removal/birefnet.py` として BiRefNet が完全に内蔵されており、`comfy.bg_removal_model.load()` でロードできることが判明した。これにより：

- HuggingFace Hub への接続不要（モデルファイルを配置するだけ）
- `transformers` パッケージへの依存なし
- ComfyUI の VRAM 管理・前処理を自動利用

モデルファイルの同定は state dict の特定キー `"bb.layers.1.blocks.0.attn.relative_position_index"` の有無で行われる。

**config 仕様（birefnet.json）**:
```json
{"model_type": "birefnet", "image_std": [1.0, 1.0, 1.0], "image_mean": [0.0, 0.0, 0.0], "image_size": 1024, "resize_to_original": true}
```
ImageNet 正規化を使用せず（mean=0、std=1）、1024×1024 にリサイズして推論後に元サイズに復元する。

---

### 2. birefnet_inference.py — 推論バックエンド

| 関数 | 役割 |
|---|---|
| `_find_model_path()` | `models/background_removal/` から `.safetensors` を探す |
| `get_status()` | ロード状態とモデルファイルの有無・パスを返す |
| `load_model()` | `comfy.bg_removal_model.load()` でロード |
| `run_inference(image_pil)` | PIL Image → `(1,H,W,3)` テンソル → `encode_image()` → data URL PNG |

**テンソル変換**:
```python
rgb = np.array(image_pil.convert("RGB")).astype(np.float32) / 255.0
image_tensor = torch.from_numpy(rgb).unsqueeze(0)   # (1, H, W, 3)
mask_tensor  = _bg_model.encode_image(image_tensor)  # (1, 1, H, W) [0,1]
mask_np = mask_tensor[0, 0].cpu().float().detach().numpy()
```

`encode_image()` の戻り値は `requires_grad=True` のテンソルのため、`.detach()` が必要（後述エラー2）。

---

### 3. server.py — BiRefNet エンドポイント

```
GET  /mask_editor/birefnet/status     → {loaded, model_found, model_path}
POST /mask_editor/birefnet/remove_bg  ← {node_id}
                                      → {mask_b64: "data:image/png;base64,..."}
```

推論は `loop.run_in_executor(None, functools.partial(run_inference, image_pil))` で非同期化。ノードキャッシュから PIL Image を取得して渡す。

---

### 4. BiRefNetTool.js — フロントエンドツール

`BaseTool` を継承。キャンバス描画操作（`onMouseDown/Move/Up`）は持たない。

```javascript
async runRemoveBg(nodeId)
    → POST /mask_editor/birefnet/remove_bg
    → this.commitMask(json.mask_b64)

commitMask(maskB64)
    → グレースケール PNG のルミナンス値をアルファに変換
    → mode="add":   source-over で合成
    → mode="erase": destination-out で消去
```

`isLoading` / `lastError` フラグと `_onStateChange` コールバックで UI 状態を通知する（SAM3Tool と同パターン）。

---

### 5. MaskEditorModal.js — BiRefNetTool 統合

- `TOOL_DEFS` に `{ id: "birefnet", icon: "🔲", label: "BG Remove" }` を追加
- `_renderToolOptions()` に `birefnet` 分岐を追加
- `async _buildBiRefNetOptions(container)` を追加：
  - ステータス表示（Model found / not found）
  - **Remove BG** ボタン（ロード中はスピナー + 無効化）
  - Mode 選択（Add / Erase）
  - エラーメッセージ表示
  - ヒントテキスト

---

### 6. デバッグ記録

#### エラー 1: HuggingFace trust_remote_code エラー

**メッセージ**: "The repository zhengpeng7/BiRefNet contains custom code ... Please pass the argument 'trust_remote_code=True'"

**原因**: `transformers.AutoModelForImageSegmentation.from_config(config)` を使用していたため、HuggingFace Hub への接続と `trust_remote_code=True` が必要になった。

**修正**: ComfyUI ネイティブの `comfy.bg_removal_model.load()` に全面切り替え。HuggingFace 依存を完全に排除。

#### エラー 2: `requires_grad` numpy エラー

**メッセージ**: `RuntimeError: Can't call numpy() on Tensor that requires grad. Use tensor.detach().numpy() instead.`

**原因**: `_bg_model.encode_image()` が返すマスクテンソルは `requires_grad=True` の状態だった。

**修正** [birefnet_inference.py](birefnet_inference.py):
```python
# 修正前
mask_np = mask_tensor[0, 0].cpu().float().numpy()
# 修正後
mask_np = mask_tensor[0, 0].cpu().float().detach().numpy()
```

**結果**: "BiRefNet loaded OK from birefnet.safetensors" — 正常動作確認。

---

## 2026-05-25 — 出力追加・キャンバス外ドラッグ対応・BG ドロップゾーン・New キャンバス

### 概要

4 つの機能追加・バグ修正を一括実施。ノード出力に `inverted_mask` と `mask_image` を追加し、Shape/Paint 描画時のキャンバス外マウス離脱で描画が途切れる問題を修正。モーダルに背景画像のドラッグ&ドロップ対応と、サイズ指定の新規キャンバス作成機能を追加した。

### 変更ファイル

- [nodes.py](nodes.py) — 出力スロット `inverted_mask`・`mask_image` を追加
- [web/js/editor/MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — document レベルマウスイベント・BG ドロップゾーン・`_loadBgFromFile()`・`_showNewDialog()`・`_createNewCanvas()` を追加
- [web/js/editor/tools/ShapeTool.js](web/js/editor/tools/ShapeTool.js) — `onMouseLeave()` をノーオペレーションに変更
- [web/css/maskEditor.css](web/css/maskEditor.css) — `.me-drop-zone`・`.me-canvas-area.drag-over` ・New ダイアログのスタイルを追加

---

### 1. 出力スロット追加（nodes.py）

`RETURN_TYPES` / `RETURN_NAMES` に `inverted_mask (MASK)` と `mask_image (IMAGE)` を追加。

```python
RETURN_TYPES = ("IMAGE", "MASK", "MASK", "IMAGE")
RETURN_NAMES = ("image", "mask", "inverted_mask", "mask_image")
```

`inverted_mask` は `1.0 - out_mask` で算出。`mask_image` はマスクのグレースケールを RGB チャンネルに複製した IMAGE テンソルとして出力する。

```python
out_mask         = _pil_to_mask_tensor(final_mask_pil)
out_inverted_mask = 1.0 - out_mask
mask_rgb         = Image.merge("RGB", [final_mask_pil, final_mask_pil, final_mask_pil])
out_mask_image   = _pil_to_tensor(mask_rgb)
```

---

### 2. キャンバス外ドラッグ対応（MaskEditorModal.js・ShapeTool.js）

**問題**: Shape/Paint ツールで描画中にキャンバス境界を越えてマウスが出ると `mouseleave` イベントが発火し、`_painting` が `false` になって描画が途切れていた。画像の端まで選択する操作ができなかった。

**解決**: `mousedown` 時に `document` へ一時的に `mousemove`/`mouseup` リスナーを登録し、`mouseup` 後に削除する。キャンバス外でもマウス移動・リリースを追跡できるようになった。

```javascript
cv.addEventListener("mousedown", e => {
    this._painting = true;
    const onDocMove = (e2) => {
        if (!this._painting) return;
        const pos = BaseTool.getCanvasPos(cv, e2);
        this._tools[this._activeTool]?.onMouseMove(pos.x, pos.y, e2);
        this._renderPreviewWithDrawCanvas();
    };
    const onDocUp = (e2) => {
        document.removeEventListener("mousemove", onDocMove);
        document.removeEventListener("mouseup",   onDocUp);
        if (!this._painting) return;
        this._painting = false;
        const pos = BaseTool.getCanvasPos(cv, e2);
        this._tools[this._activeTool]?.onMouseUp(pos.x, pos.y, e2);
        this._syncDrawToLayer();
        this._updatePreview();
    };
    document.addEventListener("mousemove", onDocMove);
    document.addEventListener("mouseup",   onDocUp);
});
```

`ShapeTool.onMouseLeave()` も同様に何もしないノーオペレーション化した。

---

### 3. BG ドロップゾーン（MaskEditorModal.js・maskEditor.css）

モーダルフッターの BG ボタンを `.me-drop-zone` 要素に置き換え。クリックでファイルダイアログを開くほか、画像ファイルをドロップして背景を設定できるようにした。キャンバスエリア（`.me-canvas-area`）へのドロップにも対応している。

背景読み込みロジックを `_loadBgFromFile(file)` ヘルパーに分離。読み込み完了後に `_layerMgr.addLayer()` を呼んで新しい空レイヤーを自動追加する。

```javascript
async _loadBgFromFile(file) {
    const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.readAsDataURL(file);
    });
    await this._setBackgroundImage(dataUrl);
    this._layerMgr.addLayer("paint", "Layer " + (this._layerMgr.layers.length + 1));
    this._loadActiveLayerToDrawCanvas();
    this._renderBg();
    this._updatePreview();
}
```

---

### 4. New キャンバス機能（MaskEditorModal.js・maskEditor.css）

ツールバーに `📄 New` ボタンを追加。クリックすると幅・高さを入力するオーバーレイダイアログを表示し、`Create` または Enter で確定すると `_createNewCanvas(w, h)` を呼ぶ。

`_createNewCanvas()` は DOM の canvas 要素のサイズを直接書き換え、`LayerManager` を完全リセットした上で `addLayer()` で新しい空レイヤーを 1 枚作成する。

```javascript
_createNewCanvas(w, h) {
    this._bgImage = null;
    this.node._bgDataUrl = null;
    // サーバーキャッシュもクリア
    fetch("/mask_editor/store_image", { method: "POST", ... });

    for (const cv of [this._bgCanvas, this._drawCanvas, this._previewCanvas, this._vectorPreviewCanvas]) {
        cv.width = w;
        cv.height = h;
    }
    this._layerMgr.layers      = [];
    this._layerMgr.activeIndex = 0;
    this._layerMgr.width       = w;
    this._layerMgr.height      = h;
    this._layerMgr.addLayer("paint", "Layer 1");
    this._fitToView();
}
```

**旧実装の問題**: `_resizeCanvases()` → `layer.resize()` 経由でリサイズしていたため、既存レイヤーの内容が残り描画が反映されないケースがあった。直接 DOM サイズを更新し `layers` 配列をリセットすることで解決。

---

## 2026-05-24 — SAM3 モデル選択 / safetensors 対応

### 概要

`sam3.pt`・`sam3.safetensors`・`sam3.1_multiplex.pt`・`sam3.1_multiplex_fp16.safetensors` の 4 ファイルすべてをサポートし、右パネルのドロップダウンで実行時に切り替えられるようにした。

### 変更ファイル

- [sam3_inference.py](sam3_inference.py) — `list_models()`・`find_checkpoint(model_name)`・`_load_safetensors_checkpoint()`・`load_model(model_name)`・`run_inference(model_name)` を拡張
- [server.py](server.py) — segment エンドポイントが `model` フィールドを受け取り、status が `models` 配列を返すように変更
- [web/js/editor/tools/Sam3Tool.js](web/js/editor/tools/Sam3Tool.js) — `modelName` プロパティ追加、リクエストに `model` フィールドを付加
- [web/js/editor/MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — `_buildSam3Options()` にモデル選択ドロップダウンを追加

---

### 1. list_models() — モデル一覧取得

`models/sam3/` を走査し、ファイル名に `"sam3"` を含む有効なチェックポイントのみをリスト化する。全体を try/except で保護してエラー時は空リストを返す。

```python
def list_models() -> list:
    try:
        sam3_dir = _find_sam3_dir()
        if not sam3_dir.exists():
            return []
        results = []
        for suffix in (".pt", ".pth", ".safetensors"):
            for p in sorted(sam3_dir.glob(f"*{suffix}"), key=lambda x: x.name.lower()):
                if "sam3" not in p.name.lower():
                    continue            # mhr_model.pt などを除外
                if _is_torchscript_archive(str(p)):
                    continue            # TorchScript/JIT は除外
                results.append({"name": p.name, "path": str(p)})
        return results
    except Exception as e:
        log.warning("list_models() failed: %s", e)
        return []
```

`models/sam3/` には SAM3 以外のモデルが混在していることがある（例: `mhr_model.pt`）。ファイル名フィルタで除外することで誤検出を防ぐ。

---

### 2. find_checkpoint(model_name) — モデル名指定対応

`model_name` が指定された場合はそのファイルのみを確認する。指定なしの場合は従来の自動選択（"sam3" 優先・短い名前優先）を使用。

---

### 3. _load_safetensors_checkpoint() — safetensors C64 手動パース

**問題**: `safetensors 0.5.3` は `C64 (complex64)` dtype を `InvalidHeaderDeserialization` エラーで拒否する。SAM3 の `freqs_cis`（RoPE 位置エンコーディング）が C64 テンソルのため、`safetensors.torch.load_file()` は使えない。

**解決**: ヘッダー JSON を手動パースし、各テンソルのバイト列を直接 PyTorch テンソルに変換する。

```python
with open(path, "rb") as f:
    n = struct.unpack("<Q", f.read(8))[0]       # 先頭 8B = ヘッダーサイズ
    header = json.loads(f.read(n).decode("utf-8"))
    data_start = 8 + n
    for tensor_name, info in header.items():
        if tensor_name == "__metadata__": continue
        dtype_str = info["dtype"]
        f.seek(data_start + info["data_offsets"][0])
        raw = bytearray(f.read(info["data_offsets"][1] - info["data_offsets"][0]))
        if dtype_str in ("C64", "C128"):
            # float32 ペア（実部・虚部）として読み込み → view_as_complex
            flat = torch.frombuffer(raw, dtype=torch.float32)
            ckpt[tensor_name] = torch.view_as_complex(
                flat.reshape(*info["shape"], 2).contiguous()
            ).clone()
        else:
            ckpt[tensor_name] = torch.frombuffer(raw, dtype=_DTYPE_MAP[dtype_str]) \
                                     .reshape(info["shape"]).clone()
```

`.pt` の state_dict と同様に `"detector."` プレフィックスでフィルタリングしてから `load_state_dict(strict=False)` に渡す。FP16 safetensors（`sam3.1_multiplex_fp16.safetensors`）は `copy_()` が自動変換するためそのまま渡せる。

---

### 4. load_model() — safetensors 分岐

`.safetensors` の場合は `build_sam3_image_model(checkpoint_path=None, load_from_HF=False)` でアーキテクチャのみ構築し、後から `_load_safetensors_checkpoint()` でウェイトを注入する。

`.pt` を `build_sam3_image_model(checkpoint_path=path)` に渡すと `_load_checkpoint` → `torch.load` が呼ばれるため、PyTorch 2.6 対応の `weights_only=False` パッチをそのまま適用できる。

---

### 5. server.py — functools.partial で model_name を渡す

`run_in_executor` はキーワード引数を直接受け取れないため `functools.partial` を使用：

```python
model_name = str(data.get("model", "")).strip() or None
fn = functools.partial(run_inference, image_pil, prompt, max_masks, model_name)
masks = await loop.run_in_executor(None, fn)
```

status エンドポイントは `models` 配列（`[{"name": filename, "path": fullpath}, ...]`）を含むように変更。

---

### 6. MaskEditorModal.js — モデル選択ドロップダウン

`_buildSam3Options()` で status 取得後、`s.models` が 2 件以上の場合にドロップダウンを表示。

```javascript
const self = this;   // .then() 内での this バインディング保護
fetch("/mask_editor/sam3/status")
    .then(r => r.json())
    .then(s => {
        try {
            if (s.models && s.models.length > 0) {
                const modelSel = document.createElement("select");
                s.models.forEach(m => {
                    const o = document.createElement("option");
                    o.value = m.name; o.textContent = m.name;
                    modelSel.appendChild(o);
                });
                // ロード済みモデルを初期選択
                if (s.model_path) {
                    const loadedName = s.model_path.replace(/\\/g, "/").split("/").pop();
                    if ([...modelSel.options].some(o => o.value === loadedName))
                        modelSel.value = loadedName;
                }
                tool.modelName = modelSel.value;
                modelSel.onchange = () => { tool.modelName = modelSel.value; };
            }
        } catch (e) { console.error("[MaskEditor] SAM3 status parse error:", e); }
    });
```

---

### 7. デバッグ記録

#### エラー 1: ドロップダウンが表示されない（初回実装時）

**原因 A**: ComfyUI の Python モジュールキャッシュ（再起動が必要）  
**原因 B**: `list_models()` が `mhr_model.pt`・`model.safetensors` など非 SAM3 ファイルを返していた  
**修正**: ファイル名に `"sam3"` を含むもののみに絞り込む。`const self = this` でコールバック内の this バインディングを修正。

#### エラー 2: 実行環境が ComfyUI_3 だと思っていたが ComfyUI_4 だった

**原因**: トレースバックのパスを見ていなかった  
**修正**: トレースバックで `ComfyUI_4` を確認後、`ComfyUI_4` を優先コピー先に変更。`project_dirs.md` メモリを更新。

#### エラー 3: `_pickle.UnpicklingError: unpickling stack underflow`（sam3.safetensors ロード時）

**原因 A（第一段階）**: `ComfyUI_4` に古い `sam3_inference.py` が残っており、`build_sam3_image_model(checkpoint_path=safetensors_path)` → `_load_checkpoint` → `torch.load(safetensors_file)` → pickle エラー  
**原因 B（第二段階）**: `safetensors.torch.load_file()` が `InvalidHeaderDeserialization` — `safetensors 0.5.3` が C64 dtype を扱えない  
**修正**: 手動バイトパース `_load_safetensors_checkpoint()` を実装（前述の通り）

---

## 2026-05-24 — Sam3Tool（SAM3.1 AIセグメンテーション）実装

### 概要

テキストプロンプトを入力するだけで SAM3.1 がピクセル単位のセグメンテーションマスクを生成する **Sam3Tool** を実装した。候補マスクをサムネイルグリッドで表示し、クリックで選択してアクティブレイヤーに適用できる。

### 追加ファイル

- [sam3_inference.py](sam3_inference.py) — SAM3 モデルのロード・推論バックエンド
- [web/js/editor/tools/Sam3Tool.js](web/js/editor/tools/Sam3Tool.js) — フロントエンドツールクラス

### 変更ファイル

- [server.py](server.py) — SAM3 API エンドポイント追加
- [web/js/editor/MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — Sam3Tool 統合
- [web/css/maskEditor.css](web/css/maskEditor.css) — SAM3 UI スタイル
- [requirements.txt](requirements.txt) — `sam3` を追加

---

### 1. sam3_inference.py — 推論バックエンド

#### アーキテクチャ

グローバル `_model`, `_processor`, `_loaded_ckpt` でモデルをプロセス内に保持。同じチェックポイントで再ロード要求がきた場合は何もしない。

| 関数 | 役割 |
|---|---|
| `find_checkpoint()` | `models/sam3/` から有効な SAM3 state_dict を探す |
| `_is_torchscript_archive(path)` | TorchScript/JIT ファイルを除外する |
| `_find_bpe()` | BPE vocab ファイルを探し、なければ OpenAI CDN からダウンロード |
| `load_model(ckpt, device)` | モデルをロード（HuggingFace フォールバック付き） |
| `run_inference(image_pil, prompt, max_masks)` | 推論実行、mask_b64 リストを返す |
| `get_status()` | ロード状態・チェックポイント情報を返す |

#### チェックポイント優先順位

```python
def priority(p: pathlib.Path):
    name = p.name.lower()
    has_sam3 = "sam3" in name
    return (0 if has_sam3 else 1, len(name), name)
```

名前に "sam3" を含むファイルを優先し、その中でも短い名前（`sam3.pt` > `sam3.1_multiplex.pt`）を先に試す。

#### TorchScript 検出

```python
def _is_torchscript_archive(path: str) -> bool:
    import zipfile
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        if any(n.endswith("/data.pkl") or n == "archive/data.pkl" for n in names):
            return False  # 正規の state_dict
        if "constants.pkl" in names:
            return True   # TorchScript v1
        if any("producer_info.json" in n for n in names):
            return True   # torch.jit.save 新形式
        return False
```

正規の state_dict は `archive/data.pkl` を持つ。TorchScript は持たない代わりに `constants.pkl`（v1）か `producer_info.json`（PyTorch 2.x の `torch.jit.save`）を持つ。

#### PyTorch 2.6 weights_only パッチ

PyTorch 2.6 で `torch.load` のデフォルト `weights_only` が `True` に変更されたため、SAM3 の `.pt` ファイル（pickle オブジェクトを含む）がロードできなくなった。モデルビルダー呼び出し中だけ一時的にパッチする：

```python
_orig_load = torch.load
try:
    torch.load = lambda *a, **kw: _orig_load(*a, **{**kw, "weights_only": False})
    model = build_sam3_image_model(**kwargs)
finally:
    torch.load = _orig_load
```

#### BPE vocab 自動ダウンロード

`Sam3Processor` が CLIP テキストエンコーダに必要とする `bpe_simple_vocab_16e6.txt.gz` を `comfyui-rmbg/models/assets/` で探し、なければ OpenAI CDN から自動ダウンロードする。

#### 推論結果フォーマット

`run_inference()` が返す各エントリ：
```python
{
    "mask_b64": "data:image/png;base64,...",  # グレースケール L モード PNG
    "score":    float,                         # モデルの信頼度
    "area":     int,                           # マスクピクセル数
}
```
スコア降順でソートして返す。

---

### 2. server.py — SAM3 エンドポイント

```
GET  /mask_editor/sam3/status    → {loaded, ckpt_found, ckpt_path, jit_files, model_path}
POST /mask_editor/sam3/segment   ← {node_id, prompt, max_masks}
                                 → {masks: [{mask_b64, score, area}, ...]}
```

推論はブロッキング処理のため `loop.run_in_executor(None, run_inference, ...)` で非同期化。ノードキャッシュ (`_node_cache[node_id]`) から PIL Image を取得して推論に渡す。

---

### 3. Sam3Tool.js — フロントエンドツール

`BaseTool` を継承。キャンバス描画操作（`onMouseDown/Move/Up`）は持たない。

```javascript
async runInference(nodeId, prompt, maxMasks = 9)
    → POST /mask_editor/sam3/segment
    → this.results に [{mask_b64, score, area}] を格納
    → this.onResultsChange() コールバックで UI を更新通知

commitMask(maskB64)
    → グレースケール L モード PNG を RGBA に変換（輝度→アルファ）
    → mode="add": source-over で合成
    → mode="erase": destination-out で消去
```

#### 輝度→アルファ変換

```javascript
const d = imgData.data;
for (let i = 0; i < d.length; i += 4) {
    const lum = d[i];
    d[i] = d[i+1] = d[i+2] = 255;
    d[i+3] = lum;
}
```

SAM3 が出力するグレースケール PNG のルミナンス値をアルファチャンネルに変換してから合成する。

---

### 4. MaskEditorModal.js — Sam3Tool 統合

- `TOOL_DEFS` に `{ id: "sam3", icon: "✨", label: "SAM3" }` を追加
- `_buildSam3Options()` でツールオプションパネルを構築：
  - モデルステータス表示（Ready / 未ロード / JIT警告 / 未検出）
  - プロンプト入力（Enter → 推論実行）
  - Segment ボタン（スピナー付き）
  - Mode 選択（Add / Erase）
  - 結果グリッド（3列サムネイル、スコアバッジ、クリックで適用）
- マスク適用フロー: `_saveUndoState()` → `commitMask()` → `_syncDrawToLayer()` → `_updatePreview()` → `_refreshLayerThumbnail()`

---

### 5. デバッグ記録

#### エラー 1: `name 'Image' is not defined`

**原因**: `server.py` に `from PIL import Image` が欠けていた。  
**修正**: `server.py` の先頭 import に追加。

#### エラー 2: BPE vocab ファイルが見つからない

**原因**: 旧 `_find_bpe()` が `.json` ファイルを探していた。実際は `bpe_simple_vocab_16e6.txt.gz` で、`comfyui-rmbg/models/assets/` に配置される。  
**修正**: `_find_bpe()` を正しいファイル名・パスで再実装し、不在時は OpenAI CDN から自動ダウンロード。

#### エラー 3: `weights_only=True` による PyTorch 2.6 ロード失敗

**原因**: PyTorch 2.6 で `torch.load` のデフォルト動作が変わり、pickle オブジェクトを含む SAM3 ファイルが `weights_only=True` では読めなくなった。  
**修正**: `build_sam3_image_model()` 呼び出し中だけ `torch.load` をモンキーパッチして `weights_only=False` を強制。

#### エラー 4: `NotImplementedError` in `forward_magic_method` → マスク0件

**原因**: `models/sam3/` に `mhr_model.pt`（キャラクターアニメーション用 TorchScript モデル）がシンボリックリンクで存在し、これを SAM3 として誤ってロードしていた。  
`torch.jit.load(mhr_model.pt)` は `RecursiveScriptModule`（メソッド: `character_torch`, `face_expressions_model`, `pose_correctives_model`）を返す。`_load_checkpoint` が `"model" in ckpt` を実行すると TorchScript の `forward_magic_method` が `NotImplementedError` を送出。

当初の `_is_torchscript_archive()` は TorchScript v1（`constants.pkl` + `.py`）のみ検出し、PyTorch 2.x の `torch.jit.save` 新形式（`producer_info.json` を持つ ZIP）を見落としていた。

**修正**:
1. `_is_torchscript_archive()` に `producer_info.json` チェックを追加
2. 正規 state_dict の要件として `archive/data.pkl` の存在を必須化
3. `find_checkpoint()` で "sam3" を含む名前を優先

**確認**: `sam3.pt`（3.45 GB、`detector.*` キー形式）が正しくロードされることを確認。

---

## 2026-05-24 — ShapeTool 追加・Blur スライダー・バグ修正群

### 1. ShapeTool — 矩形・楕円マスク

**追加ファイル**: [ShapeTool.js](web/js/editor/tools/ShapeTool.js)

ドラッグで矩形または楕円のマスク領域を描画する。

#### 仕様

| プロパティ | 説明 |
|---|---|
| shape | `rect`（矩形）/ `ellipse`（楕円） |
| mode | `add`（白塗り）/ `erase`（destination-out） |

#### 操作

| 操作 | 動作 |
|---|---|
| ドラッグ | 開始点 → 終了点を対角とする矩形・楕円を描画 |
| Shift + ドラッグ | 開始点を**中心**とした正方形・正円を描画 |

ドラッグ中は `_vectorPreviewCanvas`（z-index: 3、VectorTool と共用）に青い点線でリアルタイムプレビューを描画。mouseup でプレビューをクリアし `drawCanvas` にコミット。

#### MaskEditorModal との統合ポイント

- `TOOL_DEFS` に `{ id: "shape", icon: "⬜", label: "Shape" }` 追加
- `_buildCanvasArea()` で `ShapeTool` を初期化し `_vectorPreviewCanvas` を `setPreviewCanvas()` で渡す
- `_setupCanvasEvents()` の mousemove ブランチに shape 専用分岐を追加（drawCanvas を更新しないため `_renderPreviewWithDrawCanvas()` を呼ばない）
- `_buildShapeOptions()` で shape 種類（Rectangle/Ellipse）とモードの選択 UI を構築

---

### 2. Blur スライダー — マスク全体にガウスぼかし

**変更ファイル**: [nodes.py](nodes.py), [MaskEditorModal.js](web/js/editor/MaskEditorModal.js), [maskEditor.css](web/css/maskEditor.css)

#### nodes.py

- `INPUT_TYPES` の `optional` に `blur_radius: (INT, {default: 0, min: 0, max: 200, step: 1})` 追加
- `process()` に `blur_radius=0` パラメータ追加。`invert_mask` 適用後に `ImageFilter.GaussianBlur(radius=blur_radius)` を適用

#### MaskEditorModal.js

- `this._blurRadius = 0` をコンストラクタに追加
- `open()` 初回・再表示の両パスで `_getBlurWidget()` からウィジェット値を読んでスライダーに同期
- `_buildFooter()` に `.me-blur-ctrl`（`Blur` ラベル + range スライダー + number 入力）を追加
- スライダー変更時に `_previewCanvas.style.filter = blur(Npx)` でリアルタイムプレビュー
- `_updatePreview()` / `_renderPreviewWithDrawCanvas()` でも filter を維持
- `_apply()` で `_getBlurWidget().value = this._blurRadius` を確実に更新
- `_getBlurWidget()` 追加: `node.widgets.find(w => w.name === "blur_radius")`

---

### 3. バグ修正

#### 3-1. BG変更後Runで古い画像が出力される (`IS_CHANGED` 未実装)

**原因**: `bg_image_b64` はサーバーキャッシュ経由で変わるため ComfyUI の標準変更検出では検知できず、ノードが前回の結果をキャッシュから返していた。

**修正 [nodes.py](nodes.py)**:
```python
@classmethod
def IS_CHANGED(cls, **kwargs):
    bg_b64 = _srv._node_cache.get(node_id, {}).get("bg_image_b64") or ""
    if bg_b64:
        return hashlib.md5(bg_b64[:512].encode()).hexdigest()
    return ""
```
`bg_image_b64` の MD5 を返すことで、BG 変更時にキャッシュが無効化されて再実行される。

#### 3-2. Edit Mask を開き直すと以前の画像が表示される

**原因**: `open()` の2回目以降パス（`if this._overlay`）で `_loadNodeImage()` を呼んでいなかった。

**修正 [MaskEditorModal.js](web/js/editor/MaskEditorModal.js)**:
```javascript
await this._loadNodeImage();
this._loadActiveLayerToDrawCanvas(); // 追加
this._renderBg();
this._updatePreview();
```

#### 3-3. モーダル表示中は BG を変更できない

**原因**: モーダルのオーバーレイがキャンバス全体を覆うため、ComfyUI キャンバス上の BG ウィジェットに触れない。

**修正**: モーダルフッターに `🖼 BG` ボタンを追加。ファイル選択後に `node._bgDataUrl`・`node._bgImg`・`node._bgWidget.name`・サーバーキャッシュ・モーダル背景をすべて更新。`maskEditor.js` で `node._bgWidget = bgWidget` を保存。

#### 3-4. 開き直すとマスクのプレビューが消える

**原因**: `_loadNodeImage()` → `_setBackgroundImage()` → `_resizeCanvases()` が **同サイズでも** `canvas.width = w` を再代入するため、全 canvas の内容がクリアされていた（`layer.canvas` は `layer.resize()` で復元されるが、2回目の `open()` では `_loadActiveLayerToDrawCanvas()` が呼ばれておらず `_drawCanvas` が空のままになった）。

**修正 [MaskEditorModal.js](web/js/editor/MaskEditorModal.js)**:
```javascript
_resizeCanvases(w, h) {
    if (this._canvasW === w && this._canvasH === h) return; // 同サイズなら何もしない
    ...
}
```
同サイズの場合は canvas を再代入しない。サイズが変わった場合の後始末は `_loadActiveLayerToDrawCanvas()` の追加（3-2 と共通）でカバー。

#### 3-5. subtract レイヤーが出力マスクに反映されない

**原因**: `_composite_layers()` が `for layer in layers_data` と正順（上→下）で処理していたが、`CanvasCompositor.composite()` は `[...layers].reverse()` で逆順（下→上）処理していた。

subtract レイヤーが先に処理されると `result=0` の状態で減算 → clip で 0 のまま → その後 add で白くなる → subtract が無効化される、という順序が原因。

**修正 [nodes.py](nodes.py)**:
```python
for layer in reversed(layers_data):  # JS の .reverse() と同じ下から上の順序に統一
```

---

## 2026-05-23 — TextTool・VectorTool 追加

### 1. TextTool — テキスト形状マスク

**追加ファイル**: [TextTool.js](web/js/editor/tools/TextTool.js)

キャンバスをクリックするとテキスト入力オーバーレイが表示され、`Stamp` または `Ctrl+Enter` でテキスト形状のマスクを確定する。

#### 仕様

| プロパティ | 説明 |
|---|---|
| text | スタンプするテキスト（改行で複数行対応） |
| fontFamily | フォントファミリー（11 種プリセット） |
| fontSize | 8 〜 400 px |
| bold / italic | 太字・斜体 |
| align | left / center / right |
| mode | add (白塗り) / erase (destination-out) |

複数行は `text.split("\n")` で処理、`lineHeight = fontSize × 1.2`。

#### MaskEditorModal との統合ポイント

- `mousedown` ブランチに `text` 分岐を追加。`_painting` フラグを立てず、undo は mousedown 時に保存（キャンセル時は余分な undo が積まれるが実害なし）
- オーバーレイ内の `mousedown` は `stopPropagation` でキャンバスイベントに伝播しない
- `TOOL_DEFS` に `{ id: "text", icon: "T", label: "Text" }` を追加
- `_buildTextOptions()` で右パネルにテキスト入力・フォント・サイズ・Bold/Italic・アライメント・モードの UI を構築

---

### 2. VectorTool — Catmull-Rom スプラインベクターマスク

**追加ファイル**: [VectorTool.js](web/js/editor/tools/VectorTool.js)

クリックでアンカーポイントを追加し、Catmull-Rom スプラインで滑らかなパスを描いてマスク領域を塗りつぶす。

#### スプライン実装

Catmull-Rom を Canvas2D の `bezierCurveTo` に変換:

```
各セグメント p1→p2 の制御点:
  cp1 = p1 + (p2 - p0) / 6
  cp2 = p2 - (p3 - p1) / 6
```

- **閉じたパス**: 両端ダミー `[pts[n-1], ...pts, pts[0], pts[1]]` で接続
- **開いたパス**: 端点を折り返し複製 `[2*p0 - p1, ...pts, 2*pn - pn-1]` で自然端条件に近似

#### プレビュー canvas

`_vectorPreviewCanvas`（z-index: 3、pointer-events: none）を `.me-canvas-container` に追加し VectorTool に渡す。`_resizeCanvases` と `_setZoom` も対象に追加。

プレビューで描画する要素:

| 要素 | 説明 |
|---|---|
| 黄色の実線 | 確定済みスプラインパス |
| 黄色の点線 | マウス位置へのルバーバンド線 |
| 赤い点線 | 最初の点近くでホバー時の「閉じたパスプレビュー」 |
| 黄色の円 | アンカーポイント（最初の点は大きめ） |
| 赤い円 | 最初の点にスナップ範囲（12 px）以内でホバー中 |
| 白い小円 | ホバー中のカーソル位置 |

#### キーボードショートカット

`_buildDOM` で `document.addEventListener("keydown", this._keyHandler)` を一度だけ登録。モーダルが非表示の場合はスキップ。

| キー | 動作 |
|---|---|
| `Esc` | パスをリセット |
| `Enter` | 開いたパスで確定 |
| `Backspace` / `Delete` | 最後のアンカーポイントを削除 |

#### undo タイミング

通常の `mousedown` 時 undo ではなく、`onBeforeCommit` コールバックでパス確定直前にのみ undo を保存。途中キャンセル（Esc）では undo が積まれない。

```javascript
this._tools.vector.onBeforeCommit = () => this._saveUndoState();
```

#### ツール切り替え

`_selectTool()` で vector → 他ツールに切り替える際に `tool.reset()` を呼び、プレビューをクリア。

---

## 2026-05-23 — ブラシアスペクト比修正 & ABR v2 block-length サポート & ABR v6 samp オフセット修正

### 1. 画像ブラシのアスペクト比修正

**症状**: abrViewer で正しく表示される炎ブラシが、インポート後の描画では縦横比が崩れて扁平になっていた。

**原因**:

[PaintTool.js](web/js/editor/tools/PaintTool.js) `_getStamp()` が `size × size` の正方形 Canvas を作成していたため、元画像のアスペクト比が無視されていた。  
また `_paintImageBrush()` でのスタンプ中心揃えが `size/2` 固定だったため、非正方形ブラシがずれて描画されていた。

**修正**:
- `_getStamp()`: `aspect = srcW / srcH` を計算し `stampW = size * aspect`、`stampH = size` でアスペクト比を維持
- `_paintImageBrush()`: 中心揃えを `stamp.width / 2`、`stamp.height / 2` に変更（実際のスタンプ寸法を使用）
- コーナーサンプリングのインデックスを `size` → `stampW` / `stampH` ベースに修正

**[BrushLibrary.js](web/js/editor/BrushLibrary.js)** サムネイルも同様に修正:
- `drawImage(img, 0, 0, 80, 80)` → fit-in-80×80-box（アスペクト比を維持してセンタリング）

### 2. ABR v2 (block-length format) サポート追加

**症状**: `01_Trav_CloudsVol1.abr` (ABR v2, sub_version=4) を Import .ABR すると 0 ブラシとなっていた。

**原因**:

既存の `_parse_v1v2` は v1/v2 の「連続レコード」形式を想定していたが、v2 では各ブラシブロックの前に 4 byte の `block_len` フィールドが付く形式（block-length prefix format）が使われる。このフィールドを `misc + spacing` の一部として誤読し、Unicode ネームバイトを bounds として解釈 → 無効なサイズで全ブラシがスキップされていた。

**修正 [abr_parser.py](abr_parser.py)**:

`_parse_v2` 関数を新規実装:

```
各レコード: type(2B) + block_len(4B) + block_data(block_len bytes)
sampled brush block:
  u32  misc/index
  u16  spacing
  pstr pascal string (通常空文字)
  u16  unicode_name_len
  bytes unicode_name (unicode_name_len × 2, UTF-16-BE, null 含む)
  u8   antiAlias
  4×i16 bounds_short (top, left, bottom, right)
  4×i32 bounds_long  (i16 が不足の場合に上書き)
  u16  depth
  bytes PackBits pixel data
```

`extract_brushes()` のディスパッチを更新: `version==2 and sub_version!=6` → `_parse_v2` を呼ぶ。

**結果**: `01_Trav_CloudsVol1.abr` から 3 ブラシ正常抽出（各 ~999×999 px）。

### 3. ABR v6 UUID-keyed samp エントリのオフセット修正

**症状**: `02_DropMaker-DreamWarrior.abr` (ABR v6, sub_version=1) を Import .ABR すると 0 ブラシとなっていた。

**原因**:

`_extract_v6sub2_entry` が bounds を offset 49 の `5 × BE u32` として読んでいたが、実際の構造は異なっていた。  
また bounds 値は **1/256 ピクセル単位の固定小数点**で格納されており、生の値をそのまま使うと 18944 など巨大な寸法になって全エントリが弾かれていた。

**正しい構造（リバースエンジニアリング）**:

```
offset  0: UUID Pstring (1B 長=36 + 36B UUID + 1B pad) = 38 bytes
offset 38: 4 × LE i16 crop bounds (top, left, bottom, right)
offset 46: 1 × LE u16 depth
offset 48: 4 × BE i32 canvas bounds — 単位は 1/256 px (÷256 でピクセル値)
offset 64: 1 × BE u16 depth (冗長)
offset 66: PackBits 圧縮 8bit グレースケールピクセルデータ
```

offset 48 の値は **256 で割る**ことでピクセル寸法が得られる（例: `0x00004a00 / 256 = 74`）。  
Entry 4 のように LE i16 crop bounds が無効値になるケースでも、BE i32 canvas bounds / 256 は常に正しい全体寸法を与える。

**修正 [abr_parser.py](abr_parser.py)** `_extract_v6sub2_entry`:

```python
raw_top, raw_left, raw_bot, raw_right = struct.unpack_from('>4i', entry_data, 48)
top, left, bot, right = raw_top//256, raw_left//256, raw_bot//256, raw_right//256
img_data = entry_data[66:]
```

**結果**: `02_DropMaker-DreamWarrior.abr` から 8/8 ブラシ正常抽出（74×74 〜 186×322 px）。

---

## 2026-05-23 — BGボタン・ノードプレビュー・レイヤー可視修正・Reloadボタン

### 1. レイヤー可視アイコン修正（ComfyUI CSS 衝突）

**症状**: レイヤーの 👁 アイコンをクリックして非表示にすると、アイコン自体が完全に消えて表示に戻せなかった。

**原因**: `me-layer-vis-btn.hidden` の `.hidden` が ComfyUI グローバル CSS の `.hidden { display: none }` に上書きされていた。

**修正 [maskEditor.css](web/css/maskEditor.css) / [MaskEditorModal.js](web/js/editor/MaskEditorModal.js)**:
- クラス名を `hidden` → `vis-off` に変更（衝突回避）
- `.me-layer-vis-btn.vis-off::after` で `::after` 疑似要素を使い 👁 の上に斜線を重ねて「非表示状態」を表現
- `position: relative` / `opacity: 0.45` で常にアイコンを表示しつつ視覚的に区別

### 2. モーダル Reload ボタン追加

**[MaskEditorModal.js](web/js/editor/MaskEditorModal.js)** `_buildFooter()`

フッターの Invert チェックの右隣に「⟳ Reload」ボタンを追加。  
`node._bgDataUrl` があればそちらを優先、なければ `/mask_editor/get_node_image` からサーバーキャッシュを取得して背景画像を再ロードする。

### 3. BGボタン・ノードプレビュー

**[maskEditor.js](web/js/maskEditor.js)**（大幅改修）

#### ノード上のボタン構成

| ウィジェット | 動作 |
|---|---|
| `🖼 BG` | ファイル選択 → `node._bgDataUrl` に保存、サーバーキャッシュ (`bg_image_b64`) に送信 |
| `🖼 BG ✕` | 再クリックで BG 画像をクリア |
| `👁 表示: 画像 / マスク` | プレビューモードトグル |
| `✏️  Edit Mask` | 従来のモーダル起動ボタン |

#### ノードプレビュー描画

`onDrawForeground` でノード下部に 160px のプレビュー領域を描画:
- アスペクト比を維持してセンタリング
- 左上に `IMAGE` / `MASK` ラベルを表示
- プレビュー画像がない場合は描画なし（ノード高さも増やさない）

#### Apply 後の自動マスク表示

`MaskEditorModal._apply()` が `updateNodeMaskPreview(node, dataUrl)` を呼び出し、プレビューモードを自動的に `mask` に切り替え。マスクは `_previewCanvas`（赤/青オーバーレイ）ではなく `compositor.composite()` で生成した白黒画像を使用。

#### `export function updateNodeMaskPreview`

`maskEditor.js` からエクスポートし、`MaskEditorModal.js` が `import` して使用。

### 4. BGキャッシュと接続画像キャッシュの分離

**背景**: `image` 入力接続時にキャッシュを `image_b64` で上書きしていたため、接続を切っても接続画像がキャッシュに残り、BG ボタン画像の代わりに使われていた。

**修正**:

| キー | 用途 |
|---|---|
| `image_b64` | `image` 入力接続時の画像（`process()` が上書き） |
| `bg_image_b64` | BG ボタンで選択した画像（`store_image` エンドポイントが独立管理） |

- **[server.py](server.py)**: `store_image` POST で `bg_image_b64` キーがあれば独立して保存。`get_node_image` は `image_b64 or bg_image_b64` の順で返す
- **[maskEditor.js](web/js/maskEditor.js)**: `_storeBgImage()` のペイロードを `{ bg_image_b64: dataUrl }` に変更
- **[nodes.py](nodes.py)**: `process()` で `image=None` の場合に `cache["bg_image_b64"]` を読み込んで `bg_image` に設定

### 5. MaskEditorModal の画像ロード優先順位

**[MaskEditorModal.js](web/js/editor/MaskEditorModal.js)** `_loadNodeImage()`:

```
1. node._bgDataUrl が存在する → JS メモリから即座にロード
2. なければ /mask_editor/get_node_image からサーバーキャッシュを取得
   （image 接続あり → image_b64、なし → bg_image_b64 を返す）
```

---

## 2026-05-22 — ブラシ描画エンジン刷新 & invert_mask 双方向連動 & ABR 保存形式修正

### 変更の背景

- ノードの `invert_mask` トグルとモーダルの Invert チェックボックスが OR 結合だったため、どちらを操作しても同じ結果になっていた
- 円形ブラシの hardness 動作が Photoshop と異なり、中心の濃度が `hardness` 値で頭打ちになっていた
- 1ストローク内でスタンプが重なるとアルファが累積し、思わぬ浮き彫り模様になっていた
- ABR インポート時のアルファ変換が逆で、ブラシが「バウンディングボックス全体の白矩形」にスタンプされていた
- ブラシライブラリのサムネイルが白地に黒い点で表示されており、ブラシ形状が分かりにくかった

### 1. invert_mask ↔ モーダル Invert 双方向連動

**[nodes.py](nodes.py)**
- `invert_mask or data.get("inverted", False)` → `invert_mask` 単独に変更
- `layer_data.inverted` は廃止。反転状態はノードウィジェット `invert_mask` のみが管理する

**[MaskEditorModal.js](web/js/editor/MaskEditorModal.js)**
- `_getInvertWidget()` 追加: `node.widgets.find(w => w.name === "invert_mask")`
- `open()` 再表示パス: ウィジェット値を読んで `_invertCheck` を同期
- `open()` 初回パス: `layer_data.inverted` の引き継ぎを廃止し、ウィジェット値で初期化
- Invert `onchange`: `invertCheck.checked` → ウィジェット値に書き戻し + `setDirtyCanvas(true)`
- `_apply()`: apply 時にもウィジェット値を更新

### 2. ブラシ描画エンジン刷新 (Photoshop 互換)

**[PaintTool.js](web/js/editor/tools/PaintTool.js)**（全面改修）

#### Photoshop 互換 hardness

従来は `alpha = hardness` 固定だった中心部を、`innerRadius = r * hardness` のラジアルグラデーションに変更:
```
innerR (100% opaque) → outerR (0% opaque)
hardness=1.0 のとき innerR=r → シャープエッジ
hardness=0.0 のとき innerR=0 → 中心から周辺に向けてフルグラデーション
```

#### ストロークバッファ（intra-stroke 累積防止）

`_baseCanvas` (ストローク開始時点のスナップショット) + `_strokeCanvas` (現ストロークの最大値) の2バッファ構成:
- スタンプ描画: `_strokeCanvas` に `source-over` で重ね描き
- 画面反映 (毎スタンプ後): `base` → `lighten(_stroke)` で合成
  - `lighten` = max 演算: 同一ストローク内で同じ箇所に何度スタンプしても最大値のみ採用
  - 過剰な濃度累積なし、スタンプ間隔を狭くしても均一な太さを保持
- ストローク終了 (`mouseup` / `mouseleave`): 合成結果を `_baseCanvas` にコミット

#### コーナー輝度による黒地/白地自動判定

画像ブラシのアルファ変換時に、4コーナーの輝度平均で背景色を自動判定:
- 白地 (`bgLum > 0.5`): `alpha = 1 - lum`（暗い部分がブラシ）
- 黒地またはアルファあり: `alpha = lum`（明るい部分がブラシ）

### 3. ABR 保存形式修正

**[abr_parser.py](abr_parser.py)**

ABR raw データの実仕様が判明: **`bright(255) = full paint`、`dark(0) = background`**  
（以前の DEVLOG「ABR は dark=paint」は誤記。ABR の raw grayscale はそのままアルファに使える）

変更前（誤）:
```python
img = img.point(lambda p: 255 - p)  # 反転してからグレースケール保存
```

変更後（正）:
```python
rgba = Image.new('RGBA', img.size, (255, 255, 255, 0))
rgba.putalpha(img)  # 反転なし: bright=opaque のまま RGBA PNG に保存
```

RGBA PNG として保存することで `_getStamp()` の `canvas.drawImage` がアルファチャンネルをそのまま利用でき、バウンディングボックス全体のスタンプ問題が解消。

### 4. ブラシサムネイル Canvas 化

**[BrushLibrary.js](web/js/editor/BrushLibrary.js)**

`<img>` タグ → `<canvas>` (80×80, 黒背景) に変更:
```javascript
ctx.fillStyle = "#000";
ctx.fillRect(0, 0, 80, 80);
thumbImg.onload = () => { ctx.drawImage(thumbImg, 0, 0, 80, 80); };
```
RGBA PNG (白シェイプ + アルファ) をそのまま黒背景に合成するため、Photoshop のブラシプレビューと同形式（黒地に白いブラシ形状）で表示される。

### 5. ブラシプレビュー修正

**[MaskEditorModal.js](web/js/editor/MaskEditorModal.js)** `_renderBrushPreview`

画像ブラシ選択時に `tool.brushImage`（元画像）を直接描画していたが、RGBA PNG 形式では白矩形になるため `tool._getStamp(size)` を呼び出してアルファ変換済みのスタンプ Canvas を描画するよう変更。

---

## 2026-05-22 — ブラシ角度スライダー & マスク反転トグル

### 追加機能

#### 1. ブラシ角度スライダー (0° ~ 360°)
- [PaintTool.js](web/js/editor/tools/PaintTool.js) に `angle` プロパティ追加
- 画像ブラシスタンプ時に `ctx.translate → rotate → drawImage` で回転描画
- 円形ブラシでは無効（回転しても変化なし）
- [MaskEditorModal.js](web/js/editor/MaskEditorModal.js) のブラシ設定 UI にスライダー追加
- ブラシプレビューも角度を反映して表示

#### 2. ノード上のマスク反転トグル
- [nodes.py](nodes.py) の `INPUT_TYPES` に `invert_mask: BOOLEAN` を追加（`required`）
- `label_on="inverted"`, `label_off="normal"` で状態を視覚化
- `process()` で `invert_mask or data.get("inverted", False)` を反転条件として OR 結合

ワークフローに保存される設定のため、ノードを再ロードしても状態が保持される。

---

## 2026-05-22 — ABR v6 sub2 (Photoshop CC) サポート完成

### 課題

前セッションで実装した ABR インポート機能のうち、Photoshop CC が生成する `version=6, sub_version=2` の ABR ファイルが解析できなかった。
「Import .ABR ボタン押下後に変化なし、404 エラー」という症状で、原因の切り分けから着手。

### デバッグの流れ

1. **JS フロー確認** — `BrushLibrary.js` の `_importAbr()` に `console.log` を追加。`onchange` → `addEventListener("change", …)` に変更、`this._abrInput = input` で GC 防止。
   → 結果: JS 側は完全に動作。サーバーから `{ok: true, imported: 0}` が返っていた。
2. **`abr_parser.py` のデバッグ** — `extract_brushes` に `print` 追加で `version=6, sub_version=2` を確認。
3. **`samp` ブロック解析の破綻** — `entry_len` が異常値に化けるエラーが発生。バイナリを HEX ダンプして調査。
4. **UUID 構造の発見** — 各エントリの先頭が `$xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` 形式の UUID Pstring。
5. **`desc` ブロックは標準 ActionDescriptor** — `descriptor_version=16` + Unicode name + classID + items。
6. **正規表現で UUID をスキャン** — `samp` 全体から 20 個の UUID 位置を取得。各エントリのサイズが 2-3MB で均一であることを確認。
7. **エントリ間アライメント判明** — `4 byte entry_len + N byte data + 4-byte境界パディング`。

### v6 sub2 フォーマット仕様（リバースエンジニアリング）

```
samp block:
  for each brush:
    4 bytes:    entry_len
    N bytes:    entry data:
      offset 0:  UUID Pstring (1B長=36 + 36B UUID + 1B padding) = 38 bytes
      offset 38: 11-byte header (01 00 00 00 00 00 03 00 + 3B size_high)
      offset 49: 5 × big-endian LONG: top, left, bottom, right, extra
      offset 69+: PackBits-compressed 8-bit grayscale image data
    padding:    to align next entry to 4-byte boundary

desc block:
  4 bytes:    descriptor_version (= 16)
  ActionDescriptor:
    Unicode name (4B length + N*2B UTF-16-BE)
    classID (key format: "null")
    items:
      "Brsh" (VlLs) → list of brush objects
        each: Objc "brushPreset" → contains Objc "Brsh" (sampledBrush)
          → Nm (TEXT, name), Dmtr (UntF #Pxl, diameter), Angl, Rndn, ...
```

### 実装のキー修正

1. `_read_descriptor` を Photoshop 標準形式（Unicode name 含む）に修正
2. `_extract_v6sub2_entry` を新規実装
   - UUID パターンマッチで entry 境界検出
   - 5 × LONG bounds 抽出
   - 3 段戦略 (raw 8bit → zlib → PackBits) で画像復号
   - PackBits 結果が想定サイズに ~5% 未満不足の場合はゼロパディング救済
3. `desc` の名前を samp の UUID 順に sequential mapping

### 結果

- テストファイル「20 Soft Brushes.abr」(49MB): 20/20 ブラシ抽出成功
- 「Free Tartan Photoshop Brushes.abr」(78MB): 15/15 成功
- entry#15 だけ PackBits 出力が 19,335 bytes (0.35%) 不足していたが、ゼロパディング救済機能で正常保存

### 既知の制限

- ABR ファイルが持つ内部メタデータの名前が正しくないことがある（Photoshop CC の保存ミス）
  例: brush#5 の名前が "Soft Brush 7" になっていて #6 が抜けて見える
- これは ABR 作成側の問題で、本パーサーでは修正不可

### 後始末

- 全 `print` を `logging` 経由に変更（`log.info` / `log.debug` / `log.warning`）
- `BrushLibrary.js` の `console.log` を削除
- メモリ（`project_mask_editor.md`）をデバッグ完了状態に更新

---

## 2026-05-21 — 画像ブラシ + ブラシライブラリ + ABR パーサー初版

### 追加ファイル

- [abr_parser.py](abr_parser.py) — ABR v1/v2/v6/v10 パーサー
- [BrushLibrary.js](web/js/editor/BrushLibrary.js) — ブラシライブラリの floating modal UI

### 変更ファイル

- [server.py](server.py) — ブラシエンドポイント追加
  - `GET /mask_editor/brushes/list` — フォルダツリー取得
  - `GET /mask_editor/brushes/raw?path=...` — 画像配信
  - `POST /mask_editor/brushes/import` — PNG/JPG/WebP/BMP フォルダインポート
  - `POST /mask_editor/brushes/upload_abr` — ABR ファイル解析・保存
- [PaintTool.js](web/js/editor/tools/PaintTool.js) — 画像ブラシスタンプ機能
  - グレースケール画像をブラシとして使用、輝度をアルファに変換
  - キャッシュされたスタンプ Canvas でサイズ/硬さ変更時のみ再生成
- [MaskEditorModal.js](web/js/editor/MaskEditorModal.js) — ブラシセレクター UI 統合
- [maskEditor.css](web/css/maskEditor.css) — ブラシライブラリスタイル

### ブラシ保存先

`{install_dir}/brushes/` 配下に自動作成。フォルダ階層を維持。

### 色変換

ABR は `dark = paint`、本システムは `bright = paint` のため、抽出時に自動反転。

---

## 2026-05-XX (初期) — Phase 1 実装完了

### 実装範囲

- **Edit Mask モーダル** — ノード上のボタンからブラウザ内エディタを起動
- **ペイントツール** — ブラシサイズ・硬さ・add/erase モード
- **カラー選択ツール** — 色クリックで類似領域を選択、tolerance / feather、add/subtract
- **透過抽出ツール** — 入力 IMAGE のアルファチャンネルからマスク生成
- **レイヤー管理** — 追加・削除・可視切替・add/subtract モード・ドラッグで並べ替え
- **Undo/Redo** — 各レイヤー 30 段までスタック
- **Apply フロー** — エディタ → `layer_data` ウィジェット → ノード実行で `MASK` + `IMAGE` 出力
- **入力対応** — `IMAGE` / `MASK` 入力を任意接続可能

### ファイル構成

```
nodes.py            # MaskEditorNode の INPUT_TYPES / process()
server.py           # PromptServer API、画像/マスクキャッシュ
__init__.py         # NODE_CLASS_MAPPINGS, WEB_DIRECTORY
web/                # フロントエンド
```

### 技術スタック

- Python: `nodes.py` + `server.py` (PromptServer の routes に登録)
- JS: ES Modules、`app.registerExtension` で ComfyUI に組み込み
- WEB_DIRECTORY = `"./web"` で静的ファイル配信

### 将来の課題

- **Sam3Tool** — SAM 3/3.1 AI セグメンテーション (HuggingFace gated model、要申請)

### Why Phase 1 でリリース

コア機能を先にリリースして、Phase 2 の重い AI 統合は後回し。
