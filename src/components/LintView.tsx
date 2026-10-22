/**
 * lint の指摘（壊れたリンク・孤立ページ・sources 未記載・frontmatter エラー・index.md 未掲載・
 * frontmatter の必須項目の欠け・type の値の誤り・取り込まれていない元資料・論点マップの関係の誤りと欠け・議論の偏り・
 * sources の無い論拠）を一覧表示するコンポーネントです。
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
const SECTIONS: {
  kind: LintIssue['kind']
  title: string
  /** 区画の説明です。索引の内容（スキーマの選択肢など）を含める場合は関数にします。 */
  description: string | ((index: WikiIndex) => string)
  /** 判定の前提が欠けていて判定できない場合に、その理由を返します。判定できる場合は undefined です。 */
  unavailableReason?: (index: WikiIndex) => string | undefined
}[] = [
  { kind: 'broken-link', title: '壊れたリンク', description: 'リンク先のページが見つからない wikilink です。' },
  { kind: 'orphan', title: '孤立ページ', description: 'どの wiki ページからもリンクされていないページです（index・log・overview を除く）。' },
  { kind: 'missing-sources', title: 'sources 未記載', description: 'frontmatter の sources が空のページです（ソース要約ページと目次類を除く）。' },
  { kind: 'frontmatter-error', title: 'frontmatter エラー', description: 'frontmatter の YAML を解析できないページです。' },
  {
    kind: 'not-in-index',
    title: 'index.md 未掲載',
    description: 'Wiki ルート直下の index.md の本文からリンクされていないページです（ルート直下の index・log・overview と、孤立ページを除く）。',
    unavailableReason: (index) => (index.indexPagePath === null ? 'Wiki ルート直下に index.md が見つからないため、判定していません。' : undefined),
  },
  {
    kind: 'missing-frontmatter-keys',
    title: 'frontmatter の必須項目の欠け',
    description: (index) =>
      index.frontmatterRules.requiredKeys.ok
        ? `CLAUDE.md の frontmatter の例にある項目（${index.frontmatterRules.requiredKeys.value.join('・')}）が無いか空のページです（目次類を除く。sources は「sources 未記載」で扱います）。`
        : 'CLAUDE.md の frontmatter の例にある項目が無いか空のページです。',
    unavailableReason: (index) => (index.frontmatterRules.requiredKeys.ok ? undefined : index.frontmatterRules.requiredKeys.reason),
  },
  {
    kind: 'invalid-type',
    title: 'type の値の誤り',
    description: (index) =>
      index.frontmatterRules.typeValues.ok
        ? `type の値が、CLAUDE.md で定めた選択肢（${index.frontmatterRules.typeValues.value.join('・')}）に無いページです。`
        : 'type の値が、CLAUDE.md で定めた選択肢に無いページです。',
    unavailableReason: (index) => (index.frontmatterRules.typeValues.ok ? undefined : index.frontmatterRules.typeValues.reason),
  },
  {
    kind: 'unreferenced-raw',
    title: '取り込まれていない元資料',
    description:
      'raw/ の元資料（Markdown 以外のファイルを含む）のうち、どの wiki ページの本文のリンク・埋め込みや sources からも参照されていないものです。要約の過程で取りこぼした資料がないかを確かめるために使います（raw のファイルどうしのリンクは参照に数えません）。',
  },
  {
    kind: 'invalid-relation',
    title: '論点マップの関係の誤り',
    description: '立場の issue のリンク先が論点（type: issue）でないか、論拠の supports・opposes のリンク先が立場（type: position）でない関係です。リンク先が無い場合も含みます。',
  },
  {
    kind: 'missing-relation',
    title: '論点マップの関係の欠け',
    description: 'issue の無い立場（type: position）と、supports・opposes のどちらも無い論拠（type: argument）です。論点マップに表示されません。',
  },
  {
    kind: 'one-sided-position',
    title: '議論の偏り',
    description: '賛成の論拠と反対の論拠の片方にしか論拠が無い立場です（論拠がまだ 1 つも無い立場を除く）。',
  },
  { kind: 'unsourced-argument', title: 'sources の無い論拠', description: 'frontmatter の sources が空の論拠（type: argument）です。' },
]

/** 指摘の詳細（リンク先・エラーの内容・欠けた項目など）を描画します。ページだけで分かる指摘では何も描画しません。 */
function IssueDetail({ issue }: { issue: LintIssue }) {
  switch (issue.kind) {
    case 'broken-link':
      return <code className="lint-target">{issue.target}</code>
    case 'frontmatter-error':
      return <pre className="lint-message">{issue.message}</pre>
    case 'missing-frontmatter-keys':
      return (
        <>
          {issue.keys.map((key) => (
            <code key={key} className="lint-target">
              {key}
            </code>
          ))}
        </>
      )
    case 'invalid-type':
      return <code className="lint-target">{issue.type}</code>
    case 'invalid-relation':
      return (
        <>
          <code className="lint-target">{`${issue.key}: ${issue.target}`}</code>
          <span className="muted">{issue.actualType === null ? 'リンク先が無い' : issue.actualType === undefined ? 'リンク先に type が無い' : `リンク先の type: ${issue.actualType}`}</span>
        </>
      )
    case 'missing-relation':
      return <code className="lint-target">{issue.key === 'issue' ? 'issue' : 'supports・opposes'}</code>
    case 'one-sided-position':
      return <span className="muted">{issue.missing === 'opposes' ? '反対の論拠が無い' : '賛成の論拠が無い'}</span>
    case 'orphan':
    case 'missing-sources':
    case 'not-in-index':
    case 'unreferenced-raw':
    case 'unsourced-argument':
      return null
    default: {
      const exhaustive: never = issue
      return exhaustive
    }
  }
}

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
        {/* 判定していない区画では、指摘が 0 件だと誤解されないよう件数の代わりに — を表示します */}
        {title} <span className="count">{unavailableReason ? '—' : count}</span>
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
            description={typeof section.description === 'function' ? section.description(index) : section.description}
            count={issues.length}
            unavailableReason={section.unavailableReason?.(index)}
          >
            <ul className="lint-list">
              {[...byPage].map(([path, pageIssues]) => (
                <li key={path}>
                  {/* Markdown 以外の元資料（CSV・画像など）は開く画面が無いため、リンクにせずパスだけを示します */}
                  {index.pageByPath.has(path) && pageLink(path)}
                  <span className="muted lint-path">{path}</span>
                  {pageIssues.map((issue, position) => (
                    <IssueDetail key={position} issue={issue} />
                  ))}
                </li>
              ))}
            </ul>
          </IssueSection>
        )
      })}
    </div>
  )
}
