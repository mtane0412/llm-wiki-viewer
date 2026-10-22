# LLM Wiki Viewer

Karpathy の「LLM Wiki」パターンで作った Wiki フォルダ（`wiki/` と `raw/`）を、ブラウザで閲覧する読み取り専用のビューアです。
File System Access API でローカルのフォルダを直接読むため、サーバーは不要で、ファイルは端末の外に送信されません。

## 機能

- Obsidian 形式の wikilink（`[[page]]`・`[[folder/page]]`・`[[page#見出し|表示名]]`・表の中の `[[page\|表示名]]`・`![[画像]]`）の解決と描画
- wikilink のホバープレビュー（マウスまたはキーボードのフォーカスで、リンク先のタイトル・`type`・本文の冒頭を表示）
- frontmatter（`type`・`tags`・`aliases`・`updated`・`sources`）の表示、バックリンク、見出しの目次
- ソース要約ページなどで、そのページを `sources` に挙げて根拠にしているページを本文のバックリンクと分けて表示
- Lint: 壊れたリンク・未作成ページ（赤リンク）の参照数順の一覧・孤立ページ・`sources` 未記載・frontmatter の YAML エラー・`index.md` に載っていないページ・frontmatter の必須項目の欠けと `type` の値の誤り（必須項目と `type` の選択肢は `CLAUDE.md` の frontmatter の例から読み取ります）
- `log.md` のタイムライン表示（日付順・操作の種類での絞り込み・形式に合わない見出しの検出）
- タグ・`type` の一覧（件数付き）と、タグ・`type` で絞り込んだページの一覧（URL で共有・再読み込みできます）
- Obsidian 形式の callout（`> [!warning] 矛盾` など）の描画と、Wiki 全体の「未解決の矛盾・問い」（warning・question）の一覧
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
