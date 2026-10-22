/**
 * Wiki 全体の「未解決の矛盾・問い」を一覧表示するコンポーネントです。
 *
 * LLM Wiki のスキーマでは、ソース間の矛盾を `> [!warning] 矛盾`、推測を `> [!question] 未確認` の callout で書きます。
 * それらをページごとに集め、矛盾と未確認の区画に分けて、ページへのリンクと本文の抜粋を並べます。
 */
import { useId, useMemo } from 'react'
import { collectCallouts, type CalloutMention } from '../lib/callout'
import { formatRoute } from '../lib/route'
import type { WikiIndex } from '../lib/wikiIndex'

/** CalloutsView の引数です。 */
export interface CalloutsViewProps {
  index: WikiIndex
  vaultId: string
}

/** 一覧に載せる callout の種類と、区画の見出し・説明です。 */
const SECTIONS = [
  { type: 'warning', title: '矛盾', description: 'ソース間の矛盾を示す callout（> [!warning]）です。' },
  { type: 'question', title: '未確認', description: '推測や未確認の事項を示す callout（> [!question]）です。' },
] as const

/** 一覧に載せる callout の種類です。 */
const LISTED_CALLOUT_TYPES: string[] = SECTIONS.map((section) => section.type)

/** callout の区画です。 */
function CalloutSection({ title, description, mentions, index, vaultId }: {
  title: string
  description: string
  mentions: CalloutMention[]
  index: WikiIndex
  vaultId: string
}) {
  const headingId = useId()
  return (
    <section className="lint-section" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {title} <span className="count">{mentions.length}</span>
      </h2>
      <p className="muted">{description}</p>
      {mentions.length === 0 ? (
        <p className="lint-ok">該当する callout はありません。</p>
      ) : (
        <ul className="lint-list">
          {mentions.map((mention, position) => (
            <li key={`${mention.pagePath}-${position}`}>
              <a href={formatRoute({ view: 'page', vaultId, path: mention.pagePath, heading: undefined })}>
                {index.pageByPath.get(mention.pagePath)?.title ?? mention.pagePath}
              </a>
              <span className="muted callout-mention-title">{mention.title}</span>
              {mention.text && <p className="callout-mention-text">{mention.text}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 未解決の矛盾・問いの一覧です。 */
export function CalloutsView({ index, vaultId }: CalloutsViewProps) {
  const mentions = useMemo(() => collectCallouts(index.pages, LISTED_CALLOUT_TYPES), [index.pages])
  return (
    <div className="lint">
      <h1>未解決の矛盾・問い</h1>
      {SECTIONS.map((section) => (
        <CalloutSection
          key={section.type}
          title={section.title}
          description={section.description}
          mentions={mentions.filter((mention) => mention.type === section.type)}
          index={index}
          vaultId={vaultId}
        />
      ))}
    </div>
  )
}
