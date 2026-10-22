/**
 * Wiki のページ間リンクをネットワーク図として表示するコンポーネントです。
 *
 * ノードはページ、色はページの type（無ければフォルダ）、大きさはリンクの本数を表します。
 * ノードをクリックするとそのページへ移動します。描画には react-force-graph-2d（canvas）を使います。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { buildGraphData, type GraphNode } from '../lib/graph'
import { formatRoute } from '../lib/route'
import type { WikiIndex } from '../lib/wikiIndex'

/** GraphView の引数です。 */
export interface GraphViewProps {
  index: WikiIndex
  vaultId: string
  /** ページへ移動する関数です。 */
  onNavigate: (hash: string) => void
}

/** グループの色分けに使う色です。CSS 変数 --graph-1 〜 --graph-8 を順に割り当てます。 */
const PALETTE_SIZE = 8
/** 拡大率がこの値以上になったら、すべてのノードにラベルを表示します。 */
const LABEL_ZOOM_THRESHOLD = 2.5
/** 拡大率に関わらずラベルを表示する、リンク本数の多いノードの件数です。 */
const ALWAYS_LABELED_COUNT = 12
/** ノード同士の反発の強さです（負の値ほど強く離れます）。 */
const CHARGE_STRENGTH = -90
/** ノードの大きさの基準（半径の係数）です。 */
const NODE_REL_SIZE = 3

/** CSS 変数の値を読み取ります。 */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 要素の大きさを追跡するフックです。 */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/** ページ間リンクのグラフです。 */
export default function GraphView({ index, vaultId, onNavigate }: GraphViewProps) {
  const data = useMemo(() => buildGraphData(index), [index])
  const groups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of data.nodes) counts.set(node.group, (counts.get(node.group) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1]).map(([group, count], position) => ({ group, count, colorVar: `--graph-${(position % PALETTE_SIZE) + 1}` }))
  }, [data])
  const colorOf = useMemo(() => {
    const map = new Map(groups.map((item) => [item.group, cssVar(item.colorVar)]))
    return (group: string) => map.get(group) ?? cssVar('--muted')
  }, [groups])
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const graphRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined)
  // リンクの多い上位のノードだけ、縮小表示でもラベルを出します
  const labeled = useMemo(
    () => new Set([...data.nodes].sort((a, b) => b.degree - a.degree).slice(0, ALWAYS_LABELED_COUNT).map((node) => node.id)),
    [data],
  )

  // 全体表示への自動ズームはデータごとに 1 回だけ行い、ノードのドラッグ後に表示範囲を戻さないようにします
  const fitted = useRef(false)
  useEffect(() => {
    fitted.current = false
    graphRef.current?.d3Force('charge')?.strength(CHARGE_STRENGTH)
  }, [data])

  return (
    <div className="graph">
      <div className="graph-header">
        <h1>グラフ</h1>
        <p className="muted">{`${data.nodes.length} ページ・${data.links.length} 本のリンク（index と log は除外）。ノードをクリックするとページを開きます。`}</p>
        <ul className="graph-legend" aria-label="凡例">
          {groups.map((item) => (
            <li key={item.group}>
              <span className="legend-swatch" style={{ background: `var(${item.colorVar})` }} />
              {item.group}
              <span className="muted">{item.count}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="graph-canvas" ref={containerRef}>
        <ForceGraph2D<GraphNode>
          ref={graphRef}
          graphData={data}
          nodeRelSize={NODE_REL_SIZE}
          cooldownTicks={200}
          onEngineStop={() => {
            if (fitted.current) return
            fitted.current = true
            graphRef.current?.zoomToFit(400, 40)
          }}
          width={size.width}
          height={size.height}
          nodeId="id"
          nodeLabel="label"
          nodeVal={(node) => 1 + Math.sqrt(node.degree)}
          nodeColor={(node) => colorOf(node.group)}
          linkColor={() => cssVar('--graph-link')}
          nodeCanvasObjectMode={() => 'after'}
          nodeCanvasObject={(node, context, globalScale) => {
            if (globalScale < LABEL_ZOOM_THRESHOLD && !labeled.has(node.id)) return
            const fontSize = 12 / globalScale
            context.font = `${fontSize}px sans-serif`
            context.textAlign = 'center'
            context.textBaseline = 'top'
            context.fillStyle = cssVar('--text')
            context.fillText(node.label, node.x ?? 0, (node.y ?? 0) + Math.sqrt(1 + Math.sqrt(node.degree)) * NODE_REL_SIZE + 2)
          }}
          onNodeClick={(node) => onNavigate(formatRoute({ view: 'page', vaultId, path: node.id, heading: undefined }))}
        />
      </div>
    </div>
  )
}
