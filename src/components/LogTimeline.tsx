/**
 * 作業ログ（log.md）をタイムラインとして表示するコンポーネントです。
 *
 * - エントリを新しい日付から順に並べます。同じ日付では、後から追記したエントリを先にします
 * - 操作の種類（ingest / query / lint / schema）のチェックで、表示するエントリを絞り込みます
 * - エントリの本文は通常のページと同じく描画するため、作成・更新したページへ wikilink で移動できます
 * - スキーマの形式に合わない見出しは、タイムラインとは別の区画に解析エラーとして示します
 */
import { useId, useMemo, useState } from 'react'
import { LOG_OPERATIONS, parseLog, type LogEntry, type LogOperation } from '../lib/log'
import type { WikiIndex } from '../lib/wikiIndex'
import { MarkdownView } from './MarkdownView'

/** LogTimeline の引数です。 */
export interface LogTimelineProps {
  /** log.md の本文（frontmatter を除いたもの）です。 */
  markdown: string
  index: WikiIndex
  pagePath: string
  vaultId: string
  readBlob: (path: string) => Promise<Blob>
}

/** タイムラインの 1 項目です。order は log.md の中での順番で、表示の key と同じ日付内の並びに使います。 */
type TimelineItem = { entry: Extract<LogEntry, { kind: 'entry' }>; order: number }

/** 作業ログのタイムラインです。 */
export function LogTimeline({ markdown, index, pagePath, vaultId, readBlob }: LogTimelineProps) {
  const { preamble, entries } = useMemo(() => parseLog(markdown), [markdown])
  const [visibleOperations, setVisibleOperations] = useState<ReadonlySet<LogOperation>>(() => new Set(LOG_OPERATIONS))
  const invalidHeadingId = useId()

  // 日付の新しい順に並べ、同じ日付ではファイルの後ろ（後から追記したもの）を先にします
  const timeline = entries
    .flatMap((entry, order): TimelineItem[] => (entry.kind === 'entry' ? [{ entry, order }] : []))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.order - a.order)
  const invalidEntries = entries.filter((entry) => entry.kind === 'invalid')
  const shown = timeline.filter((item) => visibleOperations.has(item.entry.operation))

  const toggle = (operation: LogOperation) => {
    setVisibleOperations((current) => {
      const next = new Set(current)
      if (next.has(operation)) next.delete(operation)
      else next.add(operation)
      return next
    })
  }

  const renderMarkdown = (text: string) => <MarkdownView markdown={text} index={index} pagePath={pagePath} vaultId={vaultId} readBlob={readBlob} />

  return (
    <div className="log-timeline">
      {preamble && renderMarkdown(preamble)}

      {invalidEntries.length > 0 && (
        <section className="log-invalid" aria-labelledby={invalidHeadingId}>
          <h2 id={invalidHeadingId}>
            形式に合わない見出し <span className="count">{invalidEntries.length}</span>
          </h2>
          <p className="muted small">
            見出しが <code>## [YYYY-MM-DD] &lt;ingest|query|lint|schema&gt; | &lt;タイトル&gt;</code> の形式ではないため、タイムラインに含めていません。
          </p>
          <ul>
            {invalidEntries.map((entry, position) => (
              <li key={position}>
                <code>{entry.heading}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <fieldset className="log-filter">
        <legend>表示する種類</legend>
        {LOG_OPERATIONS.map((operation) => (
          <label key={operation}>
            <input type="checkbox" checked={visibleOperations.has(operation)} onChange={() => toggle(operation)} />
            {operation} <span className="count">{timeline.filter((item) => item.entry.operation === operation).length}</span>
          </label>
        ))}
      </fieldset>

      {shown.length === 0 && <p className="muted">表示するエントリはありません。</p>}
      <ol className="log-entries" aria-label="タイムライン">
        {shown.map(({ entry, order }) => (
          <li key={order} className="log-entry">
            <p className="log-entry-meta">
              <time dateTime={entry.date}>{entry.date}</time>
              <span className="badge">{entry.operation}</span>
            </p>
            <h2>{entry.title}</h2>
            {entry.body && renderMarkdown(entry.body)}
          </li>
        ))}
      </ol>
    </div>
  )
}
