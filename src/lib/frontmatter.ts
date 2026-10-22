/**
 * Markdown 先頭の YAML frontmatter を解析するモジュールです。
 *
 * LLM Wiki の各ページは `title` / `type` / `tags` / `sources` などを frontmatter に持ちます。
 * YAML が壊れていてもアプリ全体は止めず、`error` に理由を入れて lint の指摘として表示します。
 */
import { parse } from 'yaml'

/** frontmatter の解析結果です。 */
export interface FrontmatterResult {
  /** YAML を解析したオブジェクトです。frontmatter が無い場合や解析に失敗した場合は空オブジェクトです。 */
  data: Record<string, unknown>
  /** frontmatter を除いた本文です。 */
  body: string
  /** 先頭に frontmatter ブロックがあったかどうかです。 */
  hasFrontmatter: boolean
  /** YAML の解析に失敗した場合のエラーメッセージです。 */
  error?: string
}

/** 先頭の `---` から次の `---` までを frontmatter とみなす正規表現です。 */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Markdown 文字列から frontmatter と本文を分離します。
 *
 * @param text - Markdown ファイルの内容
 * @returns 解析した frontmatter と本文
 */
export function parseFrontmatter(text: string): FrontmatterResult {
  const match = FRONTMATTER_PATTERN.exec(text)
  if (!match) {
    return { data: {}, body: text, hasFrontmatter: false }
  }
  const body = text.slice(match[0].length)
  try {
    const parsed: unknown = parse(match[1])
    if (parsed === null || parsed === undefined) {
      return { data: {}, body, hasFrontmatter: true }
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: {}, body, hasFrontmatter: true, error: 'frontmatter がキーと値のオブジェクトではありません' }
    }
    return { data: parsed as Record<string, unknown>, body, hasFrontmatter: true }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { data: {}, body, hasFrontmatter: true, error: message }
  }
}
