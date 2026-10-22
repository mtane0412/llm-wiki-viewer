/**
 * ページの全文検索を行うモジュールです。
 *
 * 日本語は空白で単語が区切られないため、形態素解析ではなく部分一致で検索します。
 * 空白で区切った複数の語は、すべてを含むページだけを返します（AND 検索）。
 * 数百〜数千ページ規模の Wiki を想定しており、索引は作らずに毎回走査します。
 */
import type { WikiPage } from './wikiIndex'

/** 検索結果の 1 件です。 */
export interface SearchResult {
  path: string
  title: string
  /** 本文の一致箇所の前後を抜き出した文字列です。本文に一致が無ければ空文字です。 */
  snippet: string
  score: number
}

/** 一致した場所ごとの点数です。タイトルの一致を最も重く扱います。 */
const SCORE = { title: 10, alias: 8, tag: 5, path: 3, body: 1 } as const
/** 抜粋で一致箇所の前後に含める文字数です。 */
const SNIPPET_RADIUS = 40
/** 既定の最大件数です。 */
const DEFAULT_LIMIT = 50

/** 本文中の最初の一致箇所の前後を抜き出します。 */
function makeSnippet(body: string, lowerBody: string, term: string): string {
  const position = lowerBody.indexOf(term)
  if (position < 0) return ''
  const start = Math.max(0, position - SNIPPET_RADIUS)
  const end = Math.min(body.length, position + term.length + SNIPPET_RADIUS)
  const text = body.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${text}${end < body.length ? '…' : ''}`
}

/**
 * ページを検索し、点数の高い順に返します。
 *
 * @param pages - 検索対象のページ
 * @param query - 検索語（空白区切りで AND 検索）
 * @param limit - 最大件数
 * @returns 検索結果
 */
export function searchPages(pages: WikiPage[], query: string, limit = DEFAULT_LIMIT): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const results: SearchResult[] = []
  for (const page of pages) {
    const fields = {
      title: page.title.toLowerCase(),
      alias: page.aliases.join('\n').toLowerCase(),
      tag: page.tags.join('\n').toLowerCase(),
      path: page.path.toLowerCase(),
      body: page.body.toLowerCase(),
    }
    let score = 0
    let matchedAll = true
    for (const term of terms) {
      const termScore = (Object.keys(fields) as (keyof typeof fields)[]).reduce(
        (sum, field) => sum + (fields[field].includes(term) ? SCORE[field] : 0),
        0,
      )
      if (termScore === 0) {
        matchedAll = false
        break
      }
      score += termScore
    }
    if (!matchedAll) continue
    const snippetTerm = terms.find((term) => fields.body.includes(term))
    results.push({
      path: page.path,
      title: page.title,
      snippet: snippetTerm ? makeSnippet(page.body, fields.body, snippetTerm) : '',
      score,
    })
  }
  return results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit)
}
