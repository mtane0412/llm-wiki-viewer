/**
 * 最近の更新と、前回の閲覧以降に内容が変わったページを表示するコンポーネントです。
 *
 * - 前回の閲覧以降に変わったページ: 既読の時点から内容が変わったページ（更新あり）と、新しく作られたページ（新規）
 * - 最近更新されたページ: frontmatter の updated の新しい順。updated の無いページは含めず、件数だけを示します
 * LLM が ingest で複数のページを一度に作成・更新したとき、どのページが変わったかを確かめるための画面です。
 */
import { useId, type ReactNode } from 'react'
import type { SeenPagesState } from '../app/useSeenPages'
import { recentlyUpdated, type PageChange } from '../lib/changes'
import { formatRoute } from '../lib/route'
import type { WikiIndex } from '../lib/wikiIndex'

/** RecentView の引数です。 */
export interface RecentViewProps {
  index: WikiIndex
  vaultId: string
  seenPages: SeenPagesState
}

/** 変化の種類ごとの表示名です。 */
const CHANGE_LABELS: Record<PageChange, string> = { new: '新規', changed: '更新あり' }

/** 見出しつきの区画です。 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section className="lint-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  )
}

/** 最近の更新の画面です。 */
export function RecentView({ index, vaultId, seenPages }: RecentViewProps) {
  const changes = seenPages.status === 'ready' ? seenPages.changes : null
  const pageLink = (path: string) => (
    <a href={formatRoute({ view: 'page', vaultId, path, heading: undefined })}>{index.pageByPath.get(path)?.title ?? path}</a>
  )
  const changeBadge = (path: string) => {
    const change = changes?.get(path)
    return change && <span className={`badge change-${change}`}>{CHANGE_LABELS[change]}</span>
  }

  const changedPaths = changes ? [...changes.keys()].sort((a, b) => (index.pageByPath.get(a)?.title ?? a).localeCompare(index.pageByPath.get(b)?.title ?? b)) : []
  const updated = recentlyUpdated(index.pages)
  const withoutUpdated = index.pages.filter((page) => page.area === 'wiki' && page.loaded && page.updated === undefined).length

  return (
    <div className="lint">
      <h1>最近の更新</h1>
      <Section title="前回の閲覧以降に変わったページ">
        <p className="muted">開いた時点の内容から変わったページと、新しく作られたページです。ページを開くと既読になります。</p>
        {seenPages.status === 'error' ? (
          <p role="alert" className="error-banner">
            {seenPages.message}
          </p>
        ) : seenPages.status === 'loading' ? (
          <p className="muted">既読の記録を読み込んでいます…</p>
        ) : changedPaths.length === 0 ? (
          <p className="lint-ok">変わったページはありません。</p>
        ) : (
          <ul className="lint-list">
            {changedPaths.map((path) => (
              <li key={path}>
                {pageLink(path)} {changeBadge(path)}
                <span className="muted lint-path">{path}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="最近更新されたページ">
        <p className="muted">
          frontmatter の updated の新しい順です。
          {withoutUpdated > 0 && ` updated の無い ${withoutUpdated} ページは含めていません。`}
        </p>
        {updated.length === 0 ? (
          <p className="muted">updated を持つページはありません。</p>
        ) : (
          <ul className="lint-list">
            {updated.map((page) => (
              <li key={page.path}>
                <time className="recent-date" dateTime={page.updated}>
                  {page.updated}
                </time>
                {pageLink(page.path)} {changeBadge(page.path)}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
