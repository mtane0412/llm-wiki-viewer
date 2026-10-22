# LLM Wiki Viewer

Karpathy の「LLM Wiki」パターンで作った Wiki フォルダ（`wiki/` と `raw/`）を、ブラウザで閲覧する読み取り専用のビューアです。
File System Access API でローカルのフォルダを直接読むため、サーバーは不要で、ファイルは端末の外に送信されません。

## 機能

- Obsidian 形式の wikilink（`[[page]]`・`[[folder/page]]`・`[[page#見出し|表示名]]`・表の中の `[[page\|表示名]]`・`![[画像]]`）の解決と描画
- wikilink のホバープレビュー（マウスまたはキーボードのフォーカスで、リンク先のタイトル・`type`・本文の冒頭を表示）
- frontmatter（`type`・`tags`・`aliases`・`updated`・`sources`）の表示、バックリンク、見出しの目次
- ソース要約ページなどで、そのページを `sources` に挙げて根拠にしているページを本文のバックリンクと分けて表示
- Lint: 壊れたリンク・未作成ページ（赤リンク）の参照数順の一覧・孤立ページ・`sources` 未記載・frontmatter の YAML エラー・`index.md` に載っていないページ・frontmatter の必須項目の欠けと `type` の値の誤り（必須項目と `type` の選択肢は `CLAUDE.md` の frontmatter の例から読み取ります）・どの wiki ページからも参照されていない `raw/` の元資料（要約で取りこぼした資料の点検に使います）
- `log.md` のタイムライン表示（日付順・操作の種類での絞り込み・形式に合わない見出しの検出）
- タグ・`type` の一覧（件数付き）と、タグ・`type` で絞り込んだページの一覧（URL で共有・再読み込みできます）
- Obsidian 形式の callout（`> [!warning] 矛盾` など）の描画と、Wiki 全体の「未解決の矛盾・問い」（warning・question）の一覧
- raw/ の CSV の表示: ファイル一覧と wikilink から開けます。Polis 形式の投票 CSV（1 列目の見出しが `participant`、残りの列が意見の `comment-id`、値は `1`（賛成）・`-1`（反対）・`0` または空（未投票・パス）。Polis のエクスポートの participant-votes.csv をそのまま読めます）は、同じフォルダの意見 CSV（`comment-id`・`comment-body` の列を持つ CSV。広聴AI・Polis の comments.csv と同じ形式）と組み合わせて、主成分分析による参加者の散布図、k-means による意見グループ、グループごとの代表的な意見、すべてのグループで賛成が多い意見（合意点）を表示します。集計はブラウザ内で行い、乱数の種を固定しているため同じ入力からは同じ結果が出ます
- 広聴AI 風の意見クラスタ: 意見 CSV を開いて「意見を分析」を押すと、ブラウザ内の埋め込みモデル（[Ruri v3 30m](https://huggingface.co/cl-nagoya/ruri-v3-30m) の ONNX 版 `sirasagi62/ruri-v3-30m-ONNX`。WebGPU が使えれば WebGPU、使えなければ WASM で動かします）で意見をベクトルにし、k-means でクラスタに分け、主成分分析で散布図に描きます。クラスタを選ぶと属する意見の原文を `comment-id` 付きで一覧します。意見は端末の外に送りません。埋め込みの結果は入力の内容とモデルのハッシュをキーに IndexedDB にキャッシュし、結果は JSON で書き出せます（書き出した JSON を `raw/` に置くと、モデル無しで結果を表示できます）。「ラベルを生成」を押すと、各クラスタの代表的な意見（クラスタの中心に近い順に最大 10 件）から、ブラウザ内の LLM（Qwen3.5 0.8B の ONNX 版 `onnx-community/Qwen3.5-0.8B-Text-ONNX`。WebGPU が必要）でクラスタの見出しと説明を生成し、「LLM が生成した要約」であることと根拠にした意見の `comment-id` とともに表示します（ラベルも IndexedDB にキャッシュし、JSON の書き出しに含めます）
- 論点マップ: 熟議の構造化の手法 IBIS（論点 → 立場 → 賛否の論拠）で書いたページから、論点ごとに「立場 → 賛成の論拠・反対の論拠（と出典）」の木を表示し、関係の誤り・欠け、片方の論拠しか無い立場（議論の偏り）、`sources` の無い論拠を Lint で指摘します（スキーマは下の「論点マップのスキーマ」）
- リポジトリ直下の `CLAUDE.md`（Wiki のスキーマ）の表示（変更も自動で反映）
- 最近の更新（`updated` の新しい順）と、前回の閲覧以降に内容が変わったページ・新しいページの表示（既読の記録は Wiki ごとに IndexedDB に保存）
- ページ間リンクのグラフ（`type` で色分け）
- 複数の Wiki の登録・切り替えと横断検索（検索結果は `#/{Wiki の id}/search?q={検索語}` の URL でも開けます。`&all=1` を付けるとすべての Wiki が対象）
- ブラウザ操作エージェント（Claude in Chrome など）が扱いやすい画面: タブのタイトルに表示中の画面と Wiki の名前を出し、リンクとフォルダの開閉ボタンに名前を明示します
- LLM が `wiki/` を更新すると 3 秒以内に自動で反映

## 使い方

```bash
npm install
npm run dev
```

Chrome・Edge などの Chromium 系ブラウザで開き、「Wiki フォルダを開く」から、`wiki/` を含むリポジトリのフォルダ（または `wiki/` フォルダ自体）を選びます。
開いたフォルダは IndexedDB に登録され、次回の起動時に自動で開きます（ブラウザが許可を取り消した場合は「再接続」を押します）。

Safari・Firefox では `<input webkitdirectory>` で読み込みます。この場合は選択した時点のスナップショットで、変更の自動反映と次回の再表示はできません。

## 論点マップのスキーマ

論点マップを使う Wiki では、`CLAUDE.md` に次のような規則を書き、LLM に論点・立場・論拠を別々のページとして書かせます。
`issue` / `supports` / `opposes` は、`type` が `position`・`argument` のページに書いたものだけを関係として読みます。
`CLAUDE.md` の frontmatter の例で `type` の選択肢を定めている場合は、`issue`・`position`・`argument` も選択肢に加えます（加えないと Lint の「type の値の誤り」として指摘されます）。

````markdown
## 論点マップ（IBIS）

論点・立場・論拠は 1 つずつ別のページにする。

- 論点（問い）: `type: issue`
- 論点に対する立場: `type: position` と、どの論点への立場かを `issue` に書く
- 立場を支える・崩す論拠: `type: argument` と、支える立場を `supports`、崩す立場を `opposes` に書き、根拠の資料を `sources` に書く

```yaml
---
title: 給食費を無償化すべきか
type: issue
---
```

```yaml
---
title: 所得制限を設けて無償化する
type: position
issue: "[[給食費を無償化すべきか]]"
---
```

```yaml
---
title: 子育て世帯の負担が減る
type: argument
supports: ["[[所得制限を設けて無償化する]]"]
sources: ["[[sources/市の家計調査]]"]
---
```
````

## 意見クラスタの通信

意見クラスタの初回の分析とラベルの生成では、次のファイルをダウンロードします。意見の本文は送信しません。
ダウンロードしたファイルはブラウザのキャッシュ（Cache API）に保存し、以後はネットワークが無くても分析できます。

- 埋め込みモデル（Hugging Face の `sirasagi62/ruri-v3-30m-ONNX`）: WASM では 8 ビット量子化版とトークナイザーで約 44 MB、WebGPU では fp16 版とトークナイザーで約 80 MB
- ONNX Runtime の wasm（jsDelivr の CDN。Transformers.js の既定の取得先です）
- ラベルの生成を使う場合は LLM（Hugging Face の `onnx-community/Qwen3.5-0.8B-Text-ONNX`）: 4 ビット量子化・fp16 版とトークナイザーで約 490 MB。WebGPU（shader-f16 対応）が使えない環境では、ラベル付けを実行できないことを理由とともに表示します（クラスタと散布図はラベル無しで使えます）

## 読み込みの方針

- `wiki/` があれば `wiki/` と `raw/` だけをたどります。無ければ選択したフォルダ全体を Wiki とみなします
- `wiki/` を含むリポジトリのフォルダを選んだ場合は、リポジトリ直下の `CLAUDE.md` をスキーマとして読み込みます（`wiki/` フォルダ自体を選んだ場合は表示しません）
- `raw/` はファイル名だけを列挙し、元資料の本文は開いたときに読み込みます（検索はファイル名のみ）
- `.git` を持つフォルダ（`raw/` に複製したリポジトリ）、隠しフォルダ、`node_modules` はたどりません
- 変更の監視は `wiki/` 側だけを対象にし、変更を検知したときに `raw/` の一覧も取り直します

## 構成

| ディレクトリ | 内容 |
|---|---|
| `src/lib` | frontmatter・wikilink・log.md の解析、リンクの解決、索引・lint・グラフ・検索・目次（UI に依存しない純粋な関数） |
| `src/source` | `WikiSource`（読み込み手段の抽象）と、File System Access API・ファイル一覧の実装、読み込み器、登録の保存 |
| `src/app` | Wiki の状態管理とハッシュルーティングの React フック |
| `src/components` | 画面の部品 |

## 開発

```bash
npm test            # Vitest
npm run type-check  # TypeScript
npm run lint        # oxlint（警告ゼロ）
npm run build
```
