/**
 * 投票 CSV の Polis 風の集計結果（参加者の散布図・意見グループと代表的な意見・合意点）を表示するコンポーネントです。
 *
 * 意見の本文は、同じフォルダの意見 CSV から引きます。意見 CSV が複数ある場合は、どれを使うかを選べます。
 * 集計は src/lib/polis.ts の純粋関数で行い、形式の誤りは行と列を示して表示します。
 */
import { useId, useMemo, useState, type ReactNode } from 'react'
import { parseCommentTable, type Comment } from '../lib/opinions'
import { analyzeVotes, parseVoteMatrix, type VoteAnalysis } from '../lib/polis'
import { groupColor } from './groupColor'
import { ScatterPlot } from './ScatterPlot'

/** 意見 CSV のパスと、解析した行です。 */
export interface CommentTable {
  path: string
  rows: string[][]
}

/** VoteAnalysisView の引数です。 */
export interface VoteAnalysisViewProps {
  /** 投票 CSV の行です。 */
  voteRows: string[][]
  /** 同じフォルダにある意見 CSV です（パスの順）。 */
  commentTables: CommentTable[]
}

/** グループの番号から、表示名（グループ A・B…）を作ります。 */
function groupName(id: number): string {
  return `グループ ${String.fromCharCode('A'.charCodeAt(0) + id)}`
}

/** 割合を百分率の文字列にします。 */
function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** 参加者の散布図です。グループごとに色分けします。 */
function ParticipantScatterPlot({ analysis }: { analysis: VoteAnalysis }) {
  const summary = `${analysis.points.length} 人の参加者を、投票の傾向が近いほど近くに配置した散布図です。${analysis.groups
    .map((group) => `${groupName(group.id)}は ${group.participants.length} 人`)
    .join('、')}です。`
  const points = analysis.points.map((point) => ({ key: point.participant, x: point.x, y: point.y, group: point.group, label: `${point.participant}（${groupName(point.group)}）` }))
  return <ScatterPlot points={points} summary={summary} />
}

/** 区画です。見出しを区画の名前にします。 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section className="lint-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  )
}

/** 意見の本文と id を表示します。 */
function CommentText({ id, comments }: { id: string; comments: Map<string, Comment> }) {
  return (
    <>
      <span>{comments.get(id)?.body ?? ''}</span>
      <code className="lint-target">{id}</code>
    </>
  )
}

/** 集計の結果、またはエラーです。 */
type Outcome = { ok: true; analysis: VoteAnalysis; comments: Map<string, Comment> } | { ok: false; message: string }

/** 投票の集計結果の画面です。 */
export function VoteAnalysisView({ voteRows, commentTables }: VoteAnalysisViewProps) {
  const [selectedPath, setSelectedPath] = useState(commentTables[0]?.path)
  const selectId = useId()
  const table = commentTables.find((candidate) => candidate.path === selectedPath)

  const outcome = useMemo<Outcome | null>(() => {
    if (!table) return null
    try {
      const comments = parseCommentTable(table.rows)
      const matrix = parseVoteMatrix(
        voteRows,
        comments.map((comment) => comment.id),
      )
      return { ok: true, analysis: analyzeVotes(matrix), comments: new Map(comments.map((comment) => [comment.id, comment])) }
    } catch (cause) {
      return { ok: false, message: cause instanceof Error ? cause.message : String(cause) }
    }
  }, [table, voteRows])

  if (!table) {
    return (
      <p role="alert" className="error-banner">
        同じフォルダに意見 CSV（comment-id と comment-body の列を持つ CSV）が見つかりません。投票 CSV の意見の本文を引くために、意見 CSV を同じフォルダに置いてください。
      </p>
    )
  }
  return (
    <div className="vote-analysis">
      <p className="muted">投票 CSV を集計し、参加者を投票の傾向で意見グループに分けて、グループごとの代表的な意見と、すべてのグループが賛成する意見（合意点）を示します。</p>
      {commentTables.length > 1 ? (
        <p>
          <label htmlFor={selectId}>意見 CSV</label>{' '}
          <select id={selectId} value={table.path} onChange={(event) => setSelectedPath(event.target.value)}>
            {commentTables.map((candidate) => (
              <option key={candidate.path} value={candidate.path}>
                {candidate.path}
              </option>
            ))}
          </select>
        </p>
      ) : (
        <p className="muted">{`意見の本文は ${table.path} から引いています。`}</p>
      )}
      {outcome && !outcome.ok && (
        <p role="alert" className="error-banner">
          {`集計できませんでした: ${outcome.message}`}
        </p>
      )}
      {outcome?.ok && (
        <>
          <ParticipantScatterPlot analysis={outcome.analysis} />
          <Section title="合意点">
            <p className="muted">すべてのグループで賛成が多い（賛成率が 60% 以上の）意見です。</p>
            {outcome.analysis.consensus.length === 0 ? (
              <p className="muted">すべてのグループで賛成が多い意見はありません。</p>
            ) : (
              <ul className="lint-list">
                {outcome.analysis.consensus.map((item) => (
                  <li key={item.commentId}>
                    <CommentText id={item.commentId} comments={outcome.comments} />
                    <span className="muted vote-rates">
                      {item.agreeRates.map((rate, group) => `${groupName(group)} ${percent(rate)}`).join('・')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {outcome.analysis.groups.map((group) => (
            <Section key={group.id} title={`${groupName(group.id)}（${group.participants.length} 人）`}>
              <p className="muted">
                <span className="legend-swatch" style={{ background: groupColor(group.id) }} />
                このグループで、ほかのグループより特に賛成・反対が多い意見です。
              </p>
              {group.representative.length === 0 ? (
                <p className="muted">ほかのグループと比べて特に賛成・反対が多い意見はありません。</p>
              ) : (
                <ul className="lint-list">
                  {group.representative.map((item) => (
                    <li key={item.commentId}>
                      <CommentText id={item.commentId} comments={outcome.comments} />
                      <span className="muted vote-rates">
                        {`${item.direction === 'agree' ? '賛成' : '反対'}が多い: このグループ ${percent(item.groupRate)}・ほかのグループ ${percent(item.otherRate)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ))}
        </>
      )}
    </div>
  )
}
