/**
 * LLM Wiki の作業ログ（`log.md`）を解析するモジュールです。
 *
 * スキーマでは、log.md の見出しを `## [YYYY-MM-DD] <ingest|query|lint|schema> | <タイトル>` の形式で書くと定めています。
 * `##` の見出しごとに本文を区切り、形式どおりの見出しは日付・種類・タイトルに分解します。
 * 形式に合わない `##` の見出しは捨てずに解析エラーとして残し、画面で区別して示せるようにします。
 * 見出しの判定には Markdown の構文木を使うため、コードブロックの中の `##` は見出しとして扱いません。
 */
import type { Heading } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { basename, dirname, stripMarkdownExtension } from './path'

/** スキーマで定めた操作の種類です。 */
export const LOG_OPERATIONS = ['ingest', 'query', 'lint', 'schema'] as const

/** 操作の種類です。 */
export type LogOperation = (typeof LOG_OPERATIONS)[number]

/** log.md の 1 エントリ（`##` の見出し 1 つとその本文）です。 */
export type LogEntry =
  | {
      kind: 'entry'
      /** 見出しの日付（YYYY-MM-DD）です。 */
      date: string
      operation: LogOperation
      title: string
      /** 見出しの次の行から、次の `##` の見出しの直前までの Markdown です。 */
      body: string
    }
  | {
      kind: 'invalid'
      /** 形式に合わなかった見出しの文字列（`## ` を除いたもの）です。 */
      heading: string
      body: string
    }

/** log.md の解析結果です。 */
export interface ParsedLog {
  /** 最初の `##` の見出しより前の Markdown（`# 作業ログ` などの前書き）です。 */
  preamble: string
  /** ファイルに書かれた順のエントリです。 */
  entries: LogEntry[]
}

/** スキーマどおりの見出しの文字列（`## ` を除いたもの）の形式です。 */
const ENTRY_HEADING = new RegExp(`^\\[(\\d{4})-(\\d{2})-(\\d{2})\\]\\s+(${LOG_OPERATIONS.join('|')})\\s+\\|\\s+(\\S.*?)\\s*$`)

/** 年月日が実在する日付かを判定します（2 月 30 日などを除くため）。 */
function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** 見出しの文字列を解析し、形式どおりならエントリに、合わなければ解析エラーにします。 */
function toEntry(heading: string, body: string): LogEntry {
  const match = ENTRY_HEADING.exec(heading)
  if (!match) return { kind: 'invalid', heading, body }
  const [, year, month, day, operation, title] = match
  if (!isValidDate(Number(year), Number(month), Number(day))) return { kind: 'invalid', heading, body }
  // operation は ENTRY_HEADING の選択肢（LOG_OPERATIONS）のどれかに一致しています
  return { kind: 'entry', date: `${year}-${month}-${day}`, operation: operation as LogOperation, title, body }
}

/**
 * log.md の本文を、`##` の見出しごとのエントリに分けて解析します。
 *
 * @param markdown - frontmatter を除いた log.md の本文
 * @returns 前書きと、ファイルに書かれた順のエントリ
 */
export function parseLog(markdown: string): ParsedLog {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown)
  // 最上位の `##` の見出しだけを区切りにします（引用やリストの中の見出しは本文の一部です）
  const headings = tree.children.filter((node): node is Heading => node.type === 'heading' && node.depth === 2)

  const startOf = (node: Heading) => node.position?.start.offset ?? 0
  const endOf = (node: Heading) => node.position?.end.offset ?? 0
  const entries = headings.map((node, position) => {
    const next = headings[position + 1]
    const raw = markdown.slice(startOf(node), endOf(node))
    // ATX 形式の `## ` と末尾の閉じ `#` を除いた、見出しの元の文字列を照合に使います
    const heading = raw.replace(/^##[ \t]*/, '').replace(/[ \t]+#+[ \t]*$/, '').trim()
    const body = markdown.slice(endOf(node), next ? startOf(next) : markdown.length).trim()
    return toEntry(heading, body)
  })

  const preamble = markdown.slice(0, headings.length > 0 ? startOf(headings[0]) : markdown.length).trim()
  return { preamble, entries }
}

/**
 * ページが Wiki ルート直下の log.md（作業ログ）かを判定します。
 *
 * @param path - ページのパス
 * @param wikiRoot - Wiki ルートのフォルダ（wiki/ が無い場合は空文字）
 * @returns 作業ログなら true
 */
export function isLogPage(path: string, wikiRoot: string): boolean {
  return dirname(path) === wikiRoot && stripMarkdownExtension(basename(path)).toLowerCase() === 'log'
}
