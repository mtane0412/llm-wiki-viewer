/**
 * 意見クラスタの分析結果（意見の散布図・クラスタの一覧・選んだクラスタの意見の原文）を表示するコンポーネントです。
 * LLM が生成したラベルがあれば、クラスタの名前に見出しを添え、選んだクラスタの説明を「LLM が生成した要約」であることと根拠にした意見とともに表示します。
 *
 * 意見 CSV を分析した直後の画面と、書き出した JSON を raw/ から開いた画面の両方で使います。
 */
import { useId, useState } from 'react'
import type { ClusterLabel } from '../lib/clusterLabels'
import type { OpinionClusterResult } from '../lib/opinionClusters'
import { clusterName } from './clusterName'
import { groupColor } from './groupColor'
import { ScatterPlot } from './ScatterPlot'

/** OpinionClustersView の引数です。 */
export interface OpinionClustersViewProps {
  result: OpinionClusterResult
  /** LLM が生成したクラスタのラベルです。生成していないクラスタの分は含みません。 */
  labels?: ClusterLabel[]
}

/** 意見クラスタの分析結果です。 */
export function OpinionClustersView({ result, labels = [] }: OpinionClustersViewProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const headingId = useId()
  const bodyById = new Map(result.comments.map((comment) => [comment.id, comment.body]))
  const summary = `${result.comments.length} 件の意見を、意味が近いほど近くに配置した散布図です。${result.clusters
    .map((cluster) => `${clusterName(cluster.id)}は ${cluster.commentIds.length} 件`)
    .join('、')}です。`
  const points = result.comments.map((comment) => ({ key: comment.id, x: comment.x, y: comment.y, group: comment.cluster, label: `${comment.id}: ${comment.body}` }))
  const selectedCluster = selected === null ? undefined : result.clusters[selected]
  const labelOf = (clusterId: number) => labels.find((label) => label.clusterId === clusterId)
  const selectedLabel = selectedCluster && labelOf(selectedCluster.id)

  return (
    <div className="opinion-clusters">
      <ScatterPlot points={points} summary={summary} highlightedGroup={selected} />
      <section className="lint-section" aria-labelledby={headingId}>
        <h2 id={headingId}>クラスタ</h2>
        <p className="muted">クラスタを選ぶと、属する意見の原文を、クラスタの中心に近い（クラスタを代表する）順に表示します。</p>
        <div className="cluster-buttons">
          {result.clusters.map((cluster) => (
            <button
              key={cluster.id}
              type="button"
              className="button"
              aria-pressed={selected === cluster.id}
              onClick={() => setSelected(selected === cluster.id ? null : cluster.id)}
            >
              <span className="legend-swatch" style={{ background: groupColor(cluster.id) }} />
              {`${clusterName(cluster.id)}${labelOf(cluster.id) ? `: ${labelOf(cluster.id)?.label}` : ''}（${cluster.commentIds.length} 件）`}
            </button>
          ))}
        </div>
        {selectedLabel && (
          <div className="cluster-label">
            <p>
              <strong>{selectedLabel.label}</strong> <span className="badge">LLM が生成した要約</span>
            </p>
            <p>{selectedLabel.description}</p>
            <p className="muted">根拠にした意見（クラスタの中心に近い順）:</p>
            <ul className="cluster-basis" aria-label={`${clusterName(selectedLabel.clusterId)} のラベルの根拠にした意見`}>
              {selectedLabel.basisCommentIds.map((id) => (
                <li key={id}>
                  <code className="lint-target">{id}</code>
                  <span>{bodyById.get(id)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {selectedCluster && (
          <ul className="lint-list" aria-label={`${clusterName(selectedCluster.id)} の意見`}>
            {selectedCluster.commentIds.map((id) => (
              <li key={id}>
                <span>{bodyById.get(id)}</span>
                <code className="lint-target">{id}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
