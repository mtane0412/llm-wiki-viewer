/**
 * frontmatter の値（YAML を解析した unknown の値）を、索引で扱う文字列・文字列の配列・wikilink のリンク先に変換するモジュールです。
 *
 * YAML は `2026-10-14` を日付として、単一の値を配列でない値として解釈するため、ここで表記の揺れを吸収します。
 */
import { parseWikilink } from './wikilink'

/** 値が空でなければ文字列にします。YAML が日付として解釈した値も文字列（YYYY-MM-DD）にします。 */
export function toOptionalString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (value === null || value === undefined || value === '') return undefined
  return String(value)
}

/**
 * 値を文字列の配列として取り出します。単一の文字列は 1 要素の配列にします。
 * 要素は toOptionalString と同じく文字列にし（日付は YYYY-MM-DD）、空白だけの要素は除きます。
 */
export function toStringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' || value instanceof Date ? [value] : []
  return items.map(toOptionalString).filter((item): item is string => item !== undefined && item.trim() !== '')
}

/**
 * frontmatter の値（`"[[ページ]]"` の配列または単一の文字列）から、wikilink のリンク先を取り出します。
 * `[[...]]` で囲まれていない要素は、そのままリンク先として扱います。
 */
export function parseLinkTargets(value: unknown): string[] {
  return toStringList(value)
    .map((item) => {
      const match = /^\s*\[\[([^\]]+)\]\]\s*$/.exec(item)
      return parseWikilink(match ? match[1] : item).target
    })
    .filter(Boolean)
}
