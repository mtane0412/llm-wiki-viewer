# LLM Wiki Viewer

Karpathy の「LLM Wiki」パターンで作った Wiki フォルダ（`wiki/` と `raw/`）を、ブラウザで閲覧する読み取り専用のビューアです。
File System Access API でローカルのフォルダを直接読むため、サーバーは不要で、ファイルは端末の外に送信されません。

## 機能

- Obsidian 形式の wikilink（`[[page]]`・`[[folder/page]]`・`[[page#見出し|表示名]]`・表の中の `[[page\|表示名]]`・`![[画像]]`）の解決と描画
- frontmatter（`type`・`tags`・`aliases`・`updated`・`sources`）の表示、バックリンク、見出しの目次
- Lint: 壊れたリンク・孤立ページ・`sources` 未記載・frontmatter の YAML エラー
- ページ間リンクのグラフ（`type` で色分け）
- 複数の Wiki の登録・切り替えと横断検索
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
- `raw/` はファイル名だけを列挙し、元資料の本文は開いたときに読み込みます（検索はファイル名のみ）
- `.git` を持つフォルダ（`raw/` に複製したリポジトリ）、隠しフォルダ、`node_modules` はたどりません
- 変更の監視は `wiki/` 側だけを対象にし、変更を検知したときに `raw/` の一覧も取り直します

## 構成

| ディレクトリ | 内容 |
|---|---|
| `src/lib` | frontmatter・wikilink の解析、リンクの解決、索引・lint・グラフ・検索（UI に依存しない純粋な関数） |
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
