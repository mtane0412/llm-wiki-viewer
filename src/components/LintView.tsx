/**
 * lint の指摘（壊れたリンク・孤立ページ・sources 未記載・frontmatter エラー・index.md 未掲載）を一覧表示するコンポーネントです。
 * 壊れたリンクは、未作成のリンク先ごとに参照数の多い順に並べた「未作成ページ（赤リンク）」としても表示します。
 *
 * LLM Wiki の Lint 操作で LLM に直させる前に、人が全体の健全性を確認するための画面です。
 */
import type { ReactNode } from 'react'
import { useId, useMemo } from 'react'
import { formatRoute } from '../lib/route'
import { rankRedLinks, type LintIssue, type WikiIndex } from '../lib/wikiIndex'

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
  { kind: 'not-in-index', title: 'index.md 未掲載', description: 'Wiki ルート直下の index.md からリンクされていないページです（index・log・overview を除く）。' },
]

/** 指摘の種類ごとの区画です。 */
function IssueSection({
  title,
  description,
  count,
  unavailableReason,
  children,
}: {
  title: string
  description: string
  count: number
  /** 判定の前提が欠けていて判定していない場合の理由です。指定すると「指摘はありません」の代わりに表示します。 */
  unavailableReason?: string
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section className="lint-section" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {title} <span className="count">{count}</span>
      </h2>
      <p className="muted">{description}</p>
      {unavailableReason ? <p className="lint-unavailable">{unavailableReason}</p> : count === 0 ? <p className="lint-ok">指摘はありません。</p> : children}
    </section>
  )
}

/** lint の指摘の一覧です。 */
export function LintView({ index, vaultId }: LintViewProps) {
  const redLinks = useMemo(() => rankRedLinks(index.issues), [index.issues])
  const pageLink = (path: string) => (
    <a href={formatRoute({ view: 'page', vaultId, path, heading: undefined })}>{index.pageByPath.get(path)?.title ?? path}</a>
  )

  return (
    <div className="lint">
      <h1>Lint</h1>
      <p className="muted">{`${index.pages.filter((page) => page.area === 'wiki').length} ページ中、${index.issues.length} 件の指摘があります。`}</p>
      <IssueSection
        title="未作成ページ（赤リンク）"
        description="リンクされているのにページが無いリンク先を、参照元のページ数の多い順に並べています。参照の多いものほど、独立したページにする候補です。"
        count={redLinks.length}
      >
        <ol className="lint-list">
          {redLinks.map((redLink) => (
            <li key={redLink.target}>
              <code className="lint-target">{redLink.target}</code>
              <span className="count">{`${redLink.pages.length} ページ`}</span>
              <ul className="red-link-sources">
                {redLink.pages.map((path) => (
                  <li key={path}>{pageLink(path)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </IssueSection>
      {SECTIONS.map((section) => {
        const issues = index.issues.filter((issue) => issue.kind === section.kind)
        // 壊れたリンクはページごとにまとめて表示します
        const byPage = new Map<string, LintIssue[]>()
        for (const issue of issues) byPage.set(issue.page, [...(byPage.get(issue.page) ?? []), issue])
        return (
          <IssueSection
            key={section.kind}
            title={section.title}
            description={section.description}
            count={issues.length}
            unavailableReason={
              section.kind === 'not-in-index' && index.indexPagePath === null
                ? 'Wiki ルート直下に index.md が見つからないため、判定していません。'
                : undefined
            }
          >
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
