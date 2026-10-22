/**
 * 2 次元の点を、グループごとに色分けして描く散布図のコンポーネントです。
 *
 * 投票の集計（参加者）と意見クラスタ（意見）で使います。点の座標は描画領域に収まるように拡大・縮小し、
 * 図の内容は aria-label の要約で、各点の名前は title で示します。
 * 点に caption がある場合は、点の横に文字で書きます（参加者の少ない投票の集計で、誰がどこにいるかを見せるために使います）。
 * 同じ位置に重なる点の caption は、重ねて書くと読めないため、1 か所に 1 つ 1 行で積んで書きます（1 行につなぐと図の幅からはみ出すためです）。
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
  /** 点の横に書く文字です。省略した場合は書きません。 */
  caption?: string
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
/** 点の横に書く文字と点の間隔です。 */
const CAPTION_GAP = 7
/** 点の横に書く文字の高さの調整（文字の中央を点の高さに揃える量）です。 */
const CAPTION_BASELINE_OFFSET = 3
/** 同じ位置に積んで書く caption の行の間隔です。 */
const CAPTION_LINE_HEIGHT = 11
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
  const placed = points.map((point) => ({ point, cx: scale(point.x, xBounds), cy: scale(point.y, yBounds) }))
  // 描画上で同じ位置（座標を丸めて一致する位置）にある点の caption を、その位置の最初の点にまとめます
  const captionsByPosition = new Map<string, { firstKey: string; captions: string[] }>()
  for (const { point, cx, cy } of placed) {
    if (point.caption === undefined) continue
    const position = `${Math.round(cx)},${Math.round(cy)}`
    const entry = captionsByPosition.get(position)
    if (entry) entry.captions.push(point.caption)
    else captionsByPosition.set(position, { firstKey: point.key, captions: [point.caption] })
  }
  const captionsOf = new Map([...captionsByPosition.values()].map((entry) => [entry.firstKey, entry.captions]))
  return (
    <svg className="vote-scatter" viewBox={`0 0 ${PLOT_SIZE} ${PLOT_SIZE}`} role="img" aria-label={summary}>
      {placed.map(({ point, cx, cy }) => {
        const captions = captionsOf.get(point.key)
        const opacity = highlightedGroup === null || highlightedGroup === point.group ? 1 : DIMMED_OPACITY
        // 右半分の点は、文字がはみ出さないように点の左側に書きます
        const onRightHalf = cx > PLOT_SIZE / 2
        return (
          <g key={point.key} opacity={opacity}>
            <circle cx={cx} cy={cy} r={POINT_RADIUS} fill={groupColor(point.group)}>
              <title>{point.label}</title>
            </circle>
            {captions !== undefined && (
              <text className="scatter-caption" textAnchor={onRightHalf ? 'end' : 'start'}>
                {captions.map((caption, line) => (
                  // 積んだ行の全体の中央が点の高さに来るように、1 行目を上にずらします
                  <tspan
                    key={line}
                    x={onRightHalf ? cx - CAPTION_GAP : cx + CAPTION_GAP}
                    y={cy + CAPTION_BASELINE_OFFSET + (line - (captions.length - 1) / 2) * CAPTION_LINE_HEIGHT}
                  >
                    {caption}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
