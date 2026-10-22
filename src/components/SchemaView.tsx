/**
 * Wiki のスキーマ（リポジトリ直下の CLAUDE.md）を表示するコンポーネントです。
 *
 * LLM Wiki では CLAUDE.md が Wiki の運用ルールです。本文は Wiki のページと同じく描画し、wikilink は Wiki のページへのリンクにします。
 * 変更は Wiki の自動の再読み込みと同じ仕組みで反映されます（loadVault.ts）。
 */
import type { MarkdownFile, WikiIndex } from '../lib/wikiIndex'
import { MarkdownView } from './MarkdownView'

/** SchemaView の引数です。 */
export interface SchemaViewProps {
  schema: MarkdownFile
  index: WikiIndex
  vaultId: string
  readBlob: (path: string) => Promise<Blob>
}

/** Wiki のスキーマです。 */
export function SchemaView({ schema, index, vaultId, readBlob }: SchemaViewProps) {
  return (
    <article className="page">
      <header className="page-header">
        <p className="page-path">
          <span className="badge badge-raw">スキーマ</span>
          {schema.path}
        </p>
      </header>
      <MarkdownView markdown={schema.content} index={index} pagePath={schema.path} vaultId={vaultId} readBlob={readBlob} />
    </article>
  )
}
