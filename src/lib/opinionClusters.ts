/**
 * 広聴AI 風の意見クラスタを作るモジュールです（埋め込み以降の計算）。
 *
 * 埋め込みモデルが出した意見のベクトルを、k-means で意味の近い意見のクラスタに分け、主成分分析で 2 次元の散布図の座標にします。
 * あわせて、分析結果のキャッシュのキー（入力の内容とモデルのハッシュ）と、結果の JSON の書き出し・読み込みを扱います。
 * 書き出した JSON を raw/ に置けば、モデル無しで結果を表示できます。
 *
 * 埋め込みモデル自体は src/embedding にあり、このモジュールはモデル無しでテストできます。乱数の種は固定し、同じ入力から同じ結果を返します。
 */
import { kMeans, projectToPlane } from './clustering'
import type { Comment } from './opinions'

/** k-means の乱数の種です。結果を再現できるように固定します。 */
const SEED = 1
/** 書き出す JSON の形式の名前です。読み込むときに、ほかの JSON と区別するために使います。 */
const JSON_FORMAT = 'llm-wiki-viewer/opinion-clusters'
/** 書き出す JSON の形式の版です。 */
const JSON_VERSION = 1

/** クラスタに分けた意見 1 件です。 */
export interface ClusteredComment {
  id: string
  body: string
  /** 散布図の座標です。 */
  x: number
  y: number
  /** 属するクラスタの番号です。 */
  cluster: number
}

/** 意見のクラスタです。 */
export interface OpinionCluster {
  /** 0 から始まるクラスタの番号です。意見の多い順に振ります。 */
  id: number
  /** 属する意見の id です。クラスタの中心に近い（クラスタを代表する）順に並べます。 */
  commentIds: string[]
}

/** 意見クラスタの分析結果です。 */
export interface OpinionClusterResult {
  /** 意見 CSV の順に並べた意見です。 */
  comments: ClusteredComment[]
  clusters: OpinionCluster[]
}

/** 2 つのベクトルの距離の 2 乗です。 */
function squaredDistance(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0)
}

/**
 * 意見の埋め込みから、意見のクラスタと散布図の座標を求めます。
 *
 * クラスタは埋め込みの空間で k-means により分け、散布図の座標は主成分分析で求めます。
 *
 * @param comments - 意見 CSV の意見
 * @param embeddings - 意見ごとの埋め込み（comments と同じ順）
 * @param clusterCount - クラスタの数（1 以上、意見の件数以下）
 * @returns 分析結果
 * @throws Error - 意見と埋め込みの件数が合わない場合、クラスタ数が範囲外の場合
 */
export function clusterOpinions(comments: Comment[], embeddings: number[][], clusterCount: number): OpinionClusterResult {
  if (comments.length !== embeddings.length) throw new Error(`意見（${comments.length} 件）と埋め込み（${embeddings.length} 件）の件数が合いません。`)
  if (!Number.isInteger(clusterCount) || clusterCount < 1 || clusterCount > comments.length) {
    throw new Error(`クラスタ数は 1 以上、意見の件数（${comments.length}）以下にしてください。`)
  }
  const labels = clusterCount === 1 ? comments.map(() => 0) : kMeans(embeddings, clusterCount, SEED)
  const coordinates = projectToPlane(embeddings)

  // クラスタの番号を、意見の多い順（同数なら元の番号の順）に振り直します
  const members = new Map<number, number[]>()
  labels.forEach((label, index) => members.set(label, [...(members.get(label) ?? []), index]))
  const ordered = [...members.entries()].sort(([labelA, a], [labelB, b]) => b.length - a.length || labelA - labelB)
  const clusterOf = new Map(ordered.map(([label], position) => [label, position]))

  const clusters = ordered.map(([, indexes], position) => {
    const center = embeddings[0].map((_, dimension) => indexes.reduce((sum, index) => sum + embeddings[index][dimension], 0) / indexes.length)
    const byCloseness = [...indexes].sort((a, b) => squaredDistance(embeddings[a], center) - squaredDistance(embeddings[b], center) || a - b)
    return { id: position, commentIds: byCloseness.map((index) => comments[index].id) }
  })
  return {
    comments: comments.map((comment, index) => ({
      id: comment.id,
      body: comment.body,
      x: coordinates[index][0],
      y: coordinates[index][1],
      cluster: clusterOf.get(labels[index]) ?? 0,
    })),
    clusters,
  }
}

/**
 * 分析結果のキャッシュのキーを、入力の内容とモデルの SHA-256 のハッシュとして求めます。
 *
 * @param input - 意見 CSV の内容
 * @param modelId - 埋め込みモデルの id
 * @returns 16 進数のハッシュ
 */
export async function analysisCacheKey(input: string, modelId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${modelId}\n${input}`))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** JSON に書き出す、分析の条件です。 */
export interface ClusterJsonMeta {
  /** 埋め込みモデルの id です。 */
  modelId: string
  /** 分析した意見 CSV のパスです。 */
  source: string
}

/** 読み込んだ JSON の内容です。 */
export interface ClusterJson extends ClusterJsonMeta {
  result: OpinionClusterResult
}

/**
 * 分析結果を JSON の文字列にします。
 *
 * @param result - 分析結果
 * @param meta - 分析の条件
 * @returns 整形した JSON の文字列
 */
export function serializeClusterJson(result: OpinionClusterResult, meta: ClusterJsonMeta): string {
  return JSON.stringify({ format: JSON_FORMAT, version: JSON_VERSION, ...meta, comments: result.comments, clusters: result.clusters }, null, 2)
}

/** 値がオブジェクト（配列と null を除く）かを判定します。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 意見クラスタの JSON の形式の誤りです。 */
function invalid(detail: string): Error {
  return new Error(`意見クラスタの JSON の形式ではありません: ${detail}`)
}

/** JSON の comments の要素を検証して取り出します。 */
function parseComment(value: unknown, position: number): ClusteredComment {
  if (!isRecord(value)) throw invalid(`comments[${position}] がオブジェクトではありません。`)
  const { id, body, x, y, cluster } = value
  if (typeof id !== 'string' || typeof body !== 'string' || typeof x !== 'number' || typeof y !== 'number' || typeof cluster !== 'number') {
    throw invalid(`comments[${position}] に id・body（文字列）と x・y・cluster（数値）が必要です。`)
  }
  return { id, body, x, y, cluster }
}

/** JSON の clusters の要素を検証して取り出します。 */
function parseCluster(value: unknown, position: number, commentIds: Set<string>): OpinionCluster {
  if (!isRecord(value) || value.id !== position || !Array.isArray(value.commentIds)) {
    throw invalid(`clusters[${position}] に id（${position}）と commentIds（配列）が必要です。`)
  }
  const ids = value.commentIds.map((id, index) => {
    if (typeof id !== 'string' || !commentIds.has(id)) throw invalid(`clusters[${position}].commentIds[${index}] の意見「${String(id)}」が comments にありません。`)
    return id
  })
  return { id: position, commentIds: ids }
}

/**
 * 書き出した JSON を読み込み、分析結果に戻します。
 *
 * @param text - JSON の文字列
 * @returns 分析結果と分析の条件
 * @throws Error - JSON として読めない場合、意見クラスタの JSON の形式でない場合
 */
export function parseClusterJson(text: string): ClusterJson {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (cause) {
    throw new Error(`JSON として読めません: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (!isRecord(data) || data.format !== JSON_FORMAT) throw invalid(`format が ${JSON_FORMAT} ではありません。`)
  if (data.version !== JSON_VERSION) throw invalid(`version ${String(data.version)} には対応していません。`)
  const { modelId, source } = data
  if (typeof modelId !== 'string' || typeof source !== 'string') throw invalid('modelId と source（文字列）が必要です。')
  if (!Array.isArray(data.comments) || !Array.isArray(data.clusters)) throw invalid('comments と clusters（配列）が必要です。')
  const comments = data.comments.map(parseComment)
  const commentIds = new Set(comments.map((comment) => comment.id))
  const clusters = data.clusters.map((cluster, position) => parseCluster(cluster, position, commentIds))
  const outOfRange = comments.find((comment) => !Number.isInteger(comment.cluster) || comment.cluster < 0 || comment.cluster >= clusters.length)
  if (outOfRange) throw invalid(`意見「${outOfRange.id}」の cluster（${outOfRange.cluster}）に対応するクラスタがありません。`)
  return { result: { comments, clusters }, modelId, source }
}
