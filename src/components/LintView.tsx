/**
 * lint の指摘（壊れたリンク・孤立ページ・sources 未記載・frontmatter エラー）を一覧表示するコンポーネントです。
 *
 * LLM Wiki の Lint 操作で LLM に直させる前に、人が全体の健全性を確認するための画面です。
 */
import type { ReactNode } from 'react'
import { useId } from 'react'
import { formatRoute } from '../lib/route'
import type { LintIssue, WikiIndex } from '../lib/wikiIndex'

/** LintView の引数です。 */
export interface LintViewProps {
  index: WikiIndex
  vaultId: string
}

/** 指摘の種類ごとの見出しと説明です。 */
const SECTIONS: { kind: LintIssue['kind']; title: string; description: string }[] = [
  { kind: 'broken-link', title: '壊れたリンク', description: 'リンク先のページが見つからない wikilink です。' },
  { kind: 'orphan', title: '孤立ページ', description: 'どの wiki ページからもリンクされていないページです（index・log・overview を除く）。' },
  { kind: 'missing-sources', title: 'sources 未記載', description: 'frontmatter の sources が空のページです（ソース要約ページと目次類を除く）。' },
  { kind: 'frontmatter-error', title: 'frontmatter エラー', description: 'frontmatter の YAML を解析できないページです。' },
]

/** 指摘の種類ごとの区画です。 */
function IssueSection({ title, description, count, children }: { title: string; description: string; count: number; children: ReactNode }) {
  const headingId = useId()
  return (
    <section className="lint-section" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {title} <span className="count">{count}</span>
      </h2>
      <p className="muted">{description}</p>
      {count === 0 ? <p className="lint-ok">指摘はありません。</p> : children}
    </section>
  )
}

/** lint の指摘の一覧です。 */
export function LintView({ index, vaultId }: LintViewProps) {
  const pageLink = (path: string) => (
    <a href={formatRoute({ view: 'page', vaultId, path, heading: undefined })}>{index.pageByPath.get(path)?.title ?? path}</a>
  )

  return (
    <div className="lint">
      <h1>Lint</h1>
      <p className="muted">{`${index.pages.filter((page) => page.area === 'wiki').length} ページ中、${index.issues.length} 件の指摘があります。`}</p>
      {SECTIONS.map((section) => {
        const issues = index.issues.filter((issue) => issue.kind === section.kind)
        // 壊れたリンクはページごとにまとめて表示します
        const byPage = new Map<string, LintIssue[]>()
        for (const issue of issues) byPage.set(issue.page, [...(byPage.get(issue.page) ?? []), issue])
        return (
          <IssueSection key={section.kind} title={section.title} description={section.description} count={issues.length}>
            <ul className="lint-list">
              {[...byPage].map(([path, pageIssues]) => (
                <li key={path}>
                  {pageLink(path)}
                  <span className="muted lint-path">{path}</span>
                  {pageIssues.map((issue, position) =>
                    issue.kind === 'broken-link' ? (
                      <code key={position} className="lint-target">
                        {issue.target}
                      </code>
                    ) : issue.kind === 'frontmatter-error' ? (
                      <pre key={position} className="lint-message">
                        {issue.message}
                      </pre>
                    ) : null,
                  )}
                </li>
              ))}
            </ul>
          </IssueSection>
        )
      })}
    </div>
  )
}
