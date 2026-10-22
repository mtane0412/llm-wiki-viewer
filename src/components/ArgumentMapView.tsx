/**
 * 論点マップ（IBIS: 論点 → 立場 → 賛否の論拠）を表示するコンポーネントです。
 *
 * 論点（type: issue）ごとに区画を作り、その論点に対する立場（type: position）と、
 * 立場を支える論拠・崩す論拠（type: argument）を、論拠の出典（sources）とともに並べます。
 * 関係の誤りや議論の偏りは Lint の画面で指摘します。
 */
import { useId, useMemo } from 'react'
import { buildArgumentMap, type PositionNode } from '../lib/argumentMap'
import { formatRoute } from '../lib/route'
import type { WikiIndex } from '../lib/wikiIndex'

/** ArgumentMapView の引数です。 */
export interface ArgumentMapViewProps {
  index: WikiIndex
  vaultId: string
}

/** ページのタイトルです。ページが見つからない場合はパスを返します。 */
function pageTitle(index: WikiIndex, path: string): string {
  return index.pageByPath.get(path)?.title ?? path
}

/** ページへのリンクです。ページのタイトルを表示します。 */
function PageLink({ index, vaultId, path }: { index: WikiIndex; vaultId: string; path: string }) {
  return <a href={formatRoute({ view: 'page', vaultId, path, heading: undefined })}>{pageTitle(index, path)}</a>
}

/** 賛成または反対の論拠の一覧です。各論拠に出典（sources）を添えます。 */
function ArgumentList({ label, paths, index, vaultId }: { label: string; paths: string[]; index: WikiIndex; vaultId: string }) {
  return (
    <div className="argument-side">
      <p className="argument-side-label">
        {label} <span className="count">{paths.length}</span>
      </p>
      {paths.length === 0 ? (
        <p className="muted">なし</p>
      ) : (
        <ul aria-label={label}>
          {paths.map((path) => {
            const sources = (index.outgoing.get(path) ?? []).filter((link) => link.origin === 'frontmatter')
            return (
              <li key={path}>
                <PageLink index={index} vaultId={vaultId} path={path} />
                {sources.length > 0 && (
                  // 論拠のリンクと見分けられるよう、出典は左に罫線を引いた小さな入れ子の一覧にします
                  <div className="argument-sources">
                    <span className="argument-sources-label">出典</span>
                    {/* list-style: none でも Safari が一覧として読み上げるよう、role="list" を明示します */}
                    <ul role="list" aria-label={`${pageTitle(index, path)}の出典`}>
                      {sources.map((source, sourceIndex) => (
                        // 同じ出典が 2 回書かれていてもキーが重ならないよう、順番を含めます
                        <li key={`${sourceIndex}:${source.target}`}>
                          {source.resolvedPath === null ? (
                            <code className="lint-target">{source.target}</code>
                          ) : (
                            <PageLink index={index} vaultId={vaultId} path={source.resolvedPath} />
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** 論点 1 つの区画です。 */
function IssueSection({ path, positions, index, vaultId }: { path: string; positions: PositionNode[]; index: WikiIndex; vaultId: string }) {
  const headingId = useId()
  return (
    <section className="lint-section" aria-labelledby={headingId}>
      <h2 id={headingId}>
        <PageLink index={index} vaultId={vaultId} path={path} />
      </h2>
      {positions.length === 0 ? (
        <p className="muted">この論点に対する立場はまだありません。</p>
      ) : (
        <ul className="lint-list">
          {positions.map((position) => (
            <li key={position.path}>
              <PageLink index={index} vaultId={vaultId} path={position.path} />
              <div className="argument-sides">
                <ArgumentList label="賛成の論拠" paths={position.supports} index={index} vaultId={vaultId} />
                <ArgumentList label="反対の論拠" paths={position.opposes} index={index} vaultId={vaultId} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 論点マップです。 */
export function ArgumentMapView({ index, vaultId }: ArgumentMapViewProps) {
  const issues = useMemo(() => buildArgumentMap(index), [index])
  return (
    <div className="lint">
      <h1>論点マップ</h1>
      <p className="muted">論点（type: issue）ごとに、立場（type: position）と、立場を支える・崩す論拠（type: argument）を並べています。</p>
      {issues.length === 0 ? (
        <p className="notice">
          type: issue のページがありません。論点のページに type: issue、立場のページに type: position と issue: &quot;[[論点]]&quot;、論拠のページに type:
          argument と supports（または opposes）: [&quot;[[立場]]&quot;] を書くと、ここに論点マップを表示します。
        </p>
      ) : (
        issues.map((issue) => <IssueSection key={issue.path} path={issue.path} positions={issue.positions} index={index} vaultId={vaultId} />)
      )}
    </div>
  )
}
