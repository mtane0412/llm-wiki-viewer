/**
 * 意見クラスタのラベル（短い見出しと説明）を LLM で生成するための、プロンプトの組み立てと出力の検証を行うモジュールです。
 *
 * 各クラスタの代表的な意見（クラスタの中心に近い順に一定件数）を LLM に渡し、見出しと説明を JSON で出力させます。
 * LLM の出力が想定の形式でない場合は、黙って空のラベルにせず LabelFormatError にします（画面で失敗として表示します）。
 * LLM 自体は src/llm にあり、このモジュールはモデル無しでテストできます。
 */
import type { OpinionClusterResult } from './opinionClusters'

/** ラベルの根拠として LLM に渡す意見です。 */
export interface BasisComment {
  id: string
  body: string
}

/** LLM のチャットのメッセージです。 */
export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/** LLM が生成したラベルです。 */
export interface GeneratedLabel {
  /** 短い見出しです。 */
  label: string
  /** 説明です。 */
  description: string
}

/** クラスタのラベルと、その根拠にした意見です。 */
export interface ClusterLabel extends GeneratedLabel {
  clusterId: number
  /** 根拠として LLM に渡した意見の id です。 */
  basisCommentIds: string[]
}

/** LLM の出力が想定の形式でないことを示すエラーです。 */
export class LabelFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LabelFormatError'
  }
}

/**
 * プロンプト（buildLabelMessages）の版です。プロンプトを変えたら上げ、古いプロンプトで生成したラベルのキャッシュを使わないようにします。
 */
export const LABEL_PROMPT_VERSION = 1

/** 見出しの長さの目安（文字数）です。プロンプトで指示します。 */
const LABEL_MAX_LENGTH = 20
/** 説明の長さの目安（文字数）です。プロンプトで指示します。 */
const DESCRIPTION_MAX_LENGTH = 100

/**
 * クラスタの中心に近い順に、ラベルの根拠にする意見を選びます。
 *
 * @param result - 意見クラスタの分析結果（クラスタの意見は中心に近い順に並んでいます）
 * @param clusterId - クラスタの番号
 * @param limit - 選ぶ件数の上限
 * @returns 根拠にする意見
 * @throws Error - クラスタが分析結果の意見に無い id を指している場合
 */
export function pickBasisComments(result: OpinionClusterResult, clusterId: number, limit: number): BasisComment[] {
  const bodyById = new Map(result.comments.map((comment) => [comment.id, comment.body]))
  return (result.clusters[clusterId]?.commentIds ?? []).slice(0, limit).map((id) => {
    const body = bodyById.get(id)
    // 分析結果の不整合を空の本文で隠すと、ラベルの品質が黙って下がるため、エラーにします
    if (body === undefined) throw new Error(`クラスタ ${clusterId + 1} の意見「${id}」が分析結果の意見にありません。`)
    return { id, body }
  })
}

/**
 * ラベルを生成させるメッセージを組み立てます。
 *
 * @param basis - 根拠にする意見
 * @returns LLM に渡すメッセージ
 */
export function buildLabelMessages(basis: BasisComment[]): ChatMessage[] {
  const list = basis.map((comment, position) => `${position + 1}. ${comment.body}`).join('\n')
  return [
    { role: 'system', content: 'あなたは、住民から集めた意見を整理する担当者です。指示された JSON だけを出力します。' },
    {
      role: 'user',
      content: `次の意見は、内容が近いものとして 1 つのまとまりに分けられました。\n\n${list}\n\nこのまとまりの見出し（${LABEL_MAX_LENGTH} 文字以内）と説明（${DESCRIPTION_MAX_LENGTH} 文字以内）を、次の形式の JSON だけで出力してください。\n{"label": "見出し", "description": "説明"}`,
    },
  ]
}

/** 値が空白だけでない文字列かを判定します。 */
function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * 文字列の中の最初の { から、それと釣り合う } までを取り出します。文字列リテラルの中の波かっこは数えません。
 * JSON の後ろに波かっこを含む文章や 2 つ目の JSON が続く出力でも、最初の JSON だけを取り出すために使います。
 *
 * @returns 取り出した部分。{ が無いか釣り合う } が無ければ null です
 */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  for (let position = start; position < text.length; position++) {
    const char = text[position]
    if (inString) {
      if (char === '\\') position++
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) return text.slice(start, position + 1)
    }
  }
  return null
}

/**
 * LLM の出力から見出しと説明を取り出します。コードブロックや前後の文章に囲まれた JSON も読みます。
 *
 * @param text - LLM の出力
 * @returns 見出しと説明（前後の空白を除きます）
 * @throws LabelFormatError - JSON が見つからない場合、label・description が無いか空の場合
 */
export function parseLabelOutput(text: string): GeneratedLabel {
  const json = firstJsonObject(text)
  if (json === null) throw new LabelFormatError(`LLM の出力に JSON がありません: ${text}`)
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (cause) {
    throw new LabelFormatError(`LLM の出力を JSON として読めません（${cause instanceof Error ? cause.message : String(cause)}）: ${text}`)
  }
  if (typeof data !== 'object' || data === null) throw new LabelFormatError(`LLM の出力が JSON のオブジェクトではありません: ${text}`)
  const label: unknown = Reflect.get(data, 'label')
  const description: unknown = Reflect.get(data, 'description')
  if (!isFilledString(label)) throw new LabelFormatError(`LLM の出力に label（見出し）がありません: ${text}`)
  if (!isFilledString(description)) throw new LabelFormatError(`LLM の出力に description（説明）がありません: ${text}`)
  return { label: label.trim(), description: description.trim() }
}
