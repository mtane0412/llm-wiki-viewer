/**
 * 2 次元の点を、グループごとに色分けして描く散布図のコンポーネントです。
 *
 * 投票の集計（参加者）と意見クラスタ（意見）で使います。点の座標は描画領域に収まるように拡大・縮小し、
 * 図の内容は aria-label の要約で、各点の名前は title で示します。
 */
import { groupColor } from './groupColor'

/** 散布図の点です。 */
export interface ScatterPoint {
  /** 点を区別する値（参加者・意見の id）です。 */
  key: string
  x: number
  y: number
  /** グループ（意見グループ・クラスタ）の番号です。色分けに使います。 */
  group: number
  /** 点の名前です（マウスを載せると表示します）。 */
  label: string
}

/** ScatterPlot の引数です。 */
export interface ScatterPlotProps {
  points: ScatterPoint[]
  /** 図の内容の要約です（スクリーンリーダー向けの名前になります）。 */
  summary: string
  /** 強調するグループの番号です。ほかのグループの点を薄くします。 */
  highlightedGroup?: number | null
}

/** 散布図の描画領域の大きさ（viewBox の幅と高さ）です。 */
const PLOT_SIZE = 320
/** 散布図の余白です。 */
const PLOT_PADDING = 16
/** 散布図の点の半径です。 */
const POINT_RADIUS = 5
/** 強調していないグループの点の不透明度です。 */
const DIMMED_OPACITY = 0.2

/** 値の最小値と最大値を求めます（大きな配列でも Math.min(...values) のようにスタックを使い切らないよう 1 つずつ比べます）。 */
function bounds(values: number[]): { min: number; max: number } {
  return values.reduce((range, value) => ({ min: Math.min(range.min, value), max: Math.max(range.max, value) }), { min: Infinity, max: -Infinity })
}

/** 散布図です。 */
export function ScatterPlot({ points, summary, highlightedGroup = null }: ScatterPlotProps) {
  const xBounds = bounds(points.map((point) => point.x))
  const yBounds = bounds(points.map((point) => point.y))
  // 座標の範囲を描画領域に合わせます（範囲が 0 の軸は中央に置きます）
  const scale = (value: number, { min, max }: { min: number; max: number }) =>
    max === min ? PLOT_SIZE / 2 : PLOT_PADDING + ((value - min) / (max - min)) * (PLOT_SIZE - PLOT_PADDING * 2)
  return (
    <svg className="vote-scatter" viewBox={`0 0 ${PLOT_SIZE} ${PLOT_SIZE}`} role="img" aria-label={summary}>
      {points.map((point) => (
        <circle
          key={point.key}
          cx={scale(point.x, xBounds)}
          cy={scale(point.y, yBounds)}
          r={POINT_RADIUS}
          fill={groupColor(point.group)}
          opacity={highlightedGroup === null || highlightedGroup === point.group ? 1 : DIMMED_OPACITY}
        >
          <title>{point.label}</title>
        </circle>
      ))}
    </svg>
  )
}
