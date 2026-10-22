/**
 * Wiki のスキーマ（リポジトリ直下の CLAUDE.md）を表示するコンポーネントです。
 *
 * LLM Wiki では CLAUDE.md が Wiki の運用ルールです。本文は Wiki のページと同じく描画し、wikilink は Wiki のページへのリンクにします。
 * frontmatter は本文として描画せず、本文の中の見出しへのリンク（`#見出し`）はスキーマ画面の見出しを指します。
 * 変更は Wiki の自動の再読み込みと同じ仕組みで反映されます（loadVault.ts）。
 */
import { useCallback, useEffect } from 'react'
import { parseFrontmatter } from '../lib/frontmatter'
import { formatRoute } from '../lib/route'
import type { MarkdownFile, WikiIndex } from '../lib/wikiIndex'
import { MarkdownView } from './MarkdownView'

/** SchemaView の引数です。 */
export interface SchemaViewProps {
  schema: MarkdownFile
  index: WikiIndex
  vaultId: string
  /** URL で指定された見出し（`?h=`）です。 */
  heading: string | undefined
  readBlob: (path: string) => Promise<Blob>
}

/** Wiki のスキーマです。 */
export function SchemaView({ schema, index, vaultId, heading, readBlob }: SchemaViewProps) {
  const selfHref = useCallback((target: string | undefined) => formatRoute({ view: 'schema', vaultId, heading: target }), [vaultId])

  // 見出しを指定して開いた場合は、通常のページと同じくその見出しまでスクロールします
  useEffect(() => {
    if (heading) document.getElementById(heading)?.scrollIntoView({ block: 'start' })
    else window.scrollTo?.({ top: 0 })
  }, [heading])

  return (
    <article className="page">
      <header className="page-header">
        <p className="page-path">
          <span className="badge schema-badge">スキーマ</span>
          {schema.path}
        </p>
      </header>
      <MarkdownView
        markdown={parseFrontmatter(schema.content).body}
        index={index}
        pagePath={schema.path}
        vaultId={vaultId}
        readBlob={readBlob}
        selfHref={selfHref}
      />
    </article>
  )
}
