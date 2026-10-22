/**
 * 意見の分析で使う、種を固定した乱数・2 次元への射影（主成分分析）・k-means によるクラスタリングのモジュールです。
 *
 * 同じ入力からは必ず同じ結果を返すように、乱数は種から作り、主成分分析の初期値も固定します。
 * UI に依存しない純粋な関数です。
 */

/** 2 次元の点です。 */
export type Point2D = [number, number]

/** 主成分分析のべき乗法の反復回数の上限です。 */
const POWER_ITERATIONS = 200
/** べき乗法の収束の判定に使う、反復前後のベクトルの差の閾値です。 */
const POWER_TOLERANCE = 1e-10
/** k-means の反復回数の上限です。 */
const KMEANS_ITERATIONS = 100

/**
 * 種から乱数の関数を作ります（mulberry32）。
 *
 * @param seed - 乱数の種
 * @returns 0 以上 1 未満の値を返す関数。同じ種からは同じ列を返します
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** ベクトルの内積です。 */
function dot(a: number[], b: number[]): number {
  let sum = 0
  for (let index = 0; index < a.length; index++) sum += a[index] * b[index]
  return sum
}

/** ベクトルを長さ 1 にします。長さが 0 のベクトルはそのまま返します。 */
function normalize(vector: number[]): number[] {
  const length = Math.sqrt(dot(vector, vector))
  return length === 0 ? vector : vector.map((value) => value / length)
}

/**
 * 中心化した行列の、指定した方向と直交する中で分散が最大の方向（主成分）を、べき乗法で求めます。
 * 共分散行列を作らず、X^T (X v) を繰り返し計算するため、次元が大きい埋め込みでも使えます。
 */
function principalAxis(centered: number[][], dimension: number, orthogonalTo: number[][]): number[] {
  // 初期値は固定します（すべての成分が同じだと特定の主成分と直交しやすいため、添字で少しずらします）
  let vector = normalize(Array.from({ length: dimension }, (_, index) => 1 + index / dimension))
  for (let iteration = 0; iteration < POWER_ITERATIONS; iteration++) {
    const scores = centered.map((row) => dot(row, vector))
    let next = new Array<number>(dimension).fill(0)
    centered.forEach((row, rowIndex) => {
      for (let index = 0; index < dimension; index++) next[index] += row[index] * scores[rowIndex]
    })
    // 求め済みの主成分の方向を取り除きます（グラム・シュミットの直交化）
    for (const axis of orthogonalTo) {
      const projection = dot(next, axis)
      next = next.map((value, index) => value - projection * axis[index])
    }
    next = normalize(next)
    const change = next.reduce((sum, value, index) => sum + (value - vector[index]) ** 2, 0)
    vector = next
    if (change < POWER_TOLERANCE) break
  }
  // 主成分の符号は任意のため、絶対値の最も大きい成分が正になるように揃えて結果を再現できるようにします
  const largest = vector.reduce((best, value) => (Math.abs(value) > Math.abs(best) ? value : best), 0)
  return largest < 0 ? vector.map((value) => -value) : vector
}

/**
 * 点を主成分分析で 2 次元に射影します。
 *
 * @param rows - 同じ次元の点（行）の配列
 * @returns 各点の第 1・第 2 主成分の座標。次元が 1 の場合、2 つ目の座標は 0 です
 */
export function projectToPlane(rows: number[][]): Point2D[] {
  if (rows.length === 0) return []
  const dimension = rows[0].length
  const means = Array.from({ length: dimension }, (_, index) => rows.reduce((sum, row) => sum + row[index], 0) / rows.length)
  const centered = rows.map((row) => row.map((value, index) => value - means[index]))
  const first = principalAxis(centered, dimension, [])
  const second = dimension > 1 ? principalAxis(centered, dimension, [first]) : null
  return centered.map((row) => [dot(row, first), second ? dot(row, second) : 0])
}

/** 2 点間の距離の 2 乗です。 */
function squaredDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let index = 0; index < a.length; index++) sum += (a[index] - b[index]) ** 2
  return sum
}

/**
 * k-means（初期値は k-means++）で点をクラスタに分けます。
 *
 * @param points - 同じ次元の点の配列
 * @param clusterCount - クラスタの数（点の数以下）
 * @param seed - 初期値を選ぶ乱数の種
 * @returns 各点のクラスタの番号（0 から clusterCount - 1）
 */
export function kMeans(points: number[][], clusterCount: number, seed: number): number[] {
  const random = createRandom(seed)
  // k-means++: 既存の中心から遠い点ほど選ばれやすくして、初期の中心を選びます
  const centers: number[][] = [points[Math.floor(random() * points.length)]]
  while (centers.length < clusterCount) {
    const weights = points.map((point) => centers.reduce((nearest, center) => Math.min(nearest, squaredDistance(point, center)), Infinity))
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    let threshold = random() * total
    let chosen = weights.findIndex((weight) => (threshold -= weight) < 0)
    // すべての点が既存の中心と重なっている場合は、まだ中心でない最初の点を選びます
    if (total === 0 || chosen < 0) chosen = points.findIndex((point) => !centers.includes(point))
    centers.push(points[chosen])
  }

  let labels = new Array<number>(points.length).fill(-1)
  for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
    const next = points.map((point) => {
      let best = 0
      centers.forEach((center, index) => {
        if (squaredDistance(point, center) < squaredDistance(point, centers[best])) best = index
      })
      return best
    })
    if (next.every((label, index) => label === labels[index])) break
    labels = next
    centers.forEach((center, clusterIndex) => {
      const members = points.filter((_, index) => labels[index] === clusterIndex)
      if (members.length === 0) return
      centers[clusterIndex] = center.map((_, dimension) => members.reduce((sum, member) => sum + member[dimension], 0) / members.length)
    })
  }
  return labels
}

/**
 * クラスタ分けのシルエット係数（-1 から 1。高いほど、クラスタ内が近くクラスタ間が遠い）の平均を求めます。
 * 参加者が数千人でも使えるように距離の行列は作らず、点ごとにクラスタ別の距離の合計だけを持ちます（時間は点の数の 2 乗、追加のメモリはクラスタ数に比例）。
 */
function silhouette(points: number[][], labels: number[]): number {
  const clusterCount = Math.max(...labels) + 1
  const sizes = new Array<number>(clusterCount).fill(0)
  for (const label of labels) sizes[label]++
  let total = 0
  points.forEach((point, index) => {
    const sums = new Array<number>(clusterCount).fill(0)
    points.forEach((other, otherIndex) => {
      if (otherIndex !== index) sums[labels[otherIndex]] += Math.sqrt(squaredDistance(point, other))
    })
    const ownSize = sizes[labels[index]] - 1
    // 1 点だけのクラスタの点は 0 とします
    if (ownSize === 0) return
    const own = sums[labels[index]] / ownSize
    let nearest = Infinity
    sums.forEach((sum, cluster) => {
      if (cluster !== labels[index] && sizes[cluster] > 0) nearest = Math.min(nearest, sum / sizes[cluster])
    })
    const denominator = Math.max(own, nearest)
    if (denominator > 0 && Number.isFinite(nearest)) total += (nearest - own) / denominator
  })
  return total / points.length
}

/** chooseClusters の設定です。 */
export interface ChooseClustersOptions {
  /** 試すクラスタの数の上限です（下限は 2 です）。 */
  maxClusters: number
  /** k-means の乱数の種です。 */
  seed: number
}

/**
 * 2 から maxClusters までのクラスタ数で k-means を行い、シルエット係数の最も高い分け方を返します。
 * 係数が同じなら、クラスタ数の少ない方を選びます。
 *
 * @param points - 同じ次元の点の配列（2 点以上）
 * @param options - クラスタ数の上限と乱数の種
 * @returns 各点のクラスタの番号
 */
export function chooseClusters(points: number[][], options: ChooseClustersOptions): number[] {
  const upper = Math.min(options.maxClusters, points.length)
  let best = kMeans(points, Math.min(2, points.length), options.seed)
  let bestScore = silhouette(points, best)
  for (let count = 3; count <= upper; count++) {
    const labels = kMeans(points, count, options.seed)
    const score = silhouette(points, labels)
    if (score > bestScore) {
      best = labels
      bestScore = score
    }
  }
  return best
}
