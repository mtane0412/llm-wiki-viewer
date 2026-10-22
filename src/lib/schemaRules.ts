/**
 * Wiki のスキーマ（CLAUDE.md）から、frontmatter の規則（必須項目と type の選択肢）を読み取るモジュールです。
 *
 * llm-wiki-init のテンプレートでは、「Frontmatter（必須）」の節に次のような例のコードブロックを置きます。
 * ```yaml
 * ---
 * title: …
 * type: concept | entity | source | analysis | overview
 * sources: ["[[…]]"]
 * updated: YYYY-MM-DD
 * ---
 * ```
 * このブロック（言語が yaml か、`---` の行を含み、type の行を含むコードブロック）の最上位のキーを必須項目とし、
 * type の行の `|` 区切りの値を type の選択肢とします。コメントに「任意」「optional」「省略可」と書いたキーは必須項目に含めません。
 * CLAUDE.md の書式は Wiki ごとに異なり得るため、読み取れない場合は推測で補わず、読み取れない理由を返します。
 */
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

/** 読み取りの結果です。読み取れなかった場合は理由を持ちます。 */
export type RuleResult<T> = { ok: true; value: T } | { ok: false; reason: string }

/** frontmatter の規則です。 */
export interface FrontmatterRules {
  /** 必須項目のキーです。sources は「sources 未記載」の指摘で扱うため含めません。 */
  requiredKeys: RuleResult<string[]>
  /** type の選択肢です。 */
  typeValues: RuleResult<string[]>
}

/**
 * 例のコードブロックの最上位のキーの行です（`key: 値`）。日本語のキーと引用符で囲んだキーも読み取ります。
 * コロンの後に空白か行末が続く場合だけをキーとし、`https://…` のような行はキーとみなしません。
 */
const TOP_LEVEL_KEY = /^["']?([^\s"'#:-][^"':]*?)["']?\s*:(?:\s|$)/

/** type の行です。 */
const TYPE_LINE = /^type\s*:(.*)$/m

/** type の選択肢 1 つの書式です（空白・区切り記号を含まない文字列。日本語も含みます）。 */
const TYPE_VALUE = /^[^\s|#,]+$/u

/** 任意の項目であることを示すコメントの語です。 */
const OPTIONAL_MARK = /任意|optional|省略可/i

/** frontmatter の例とみなすコードブロックの言語です。 */
const YAML_LANGS = new Set(['yaml', 'yml'])

/** 「sources 未記載」の指摘で扱うため、必須項目の欠けとしては数えないキーです。 */
const KEYS_CHECKED_ELSEWHERE = new Set(['sources'])

/** frontmatter の例のコードブロックの内容と、その type の行の値です。 */
interface FrontmatterExample {
  lines: string[]
  typeLineValue: string
}

/**
 * CLAUDE.md のコードブロックのうち、frontmatter の例を探します。
 * 言語が yaml か `---` の行を含み、かつ type の行を含む最初のコードブロックです（コマンドや型の例のブロックは使いません）。
 */
function findFrontmatterExample(schema: string): FrontmatterExample | null {
  let found: FrontmatterExample | null = null
  visit(unified().use(remarkParse).parse(schema), 'code', (node) => {
    if (found !== null) return
    const lines = node.value.split(/\r?\n/)
    const looksLikeFrontmatter = YAML_LANGS.has(node.lang?.toLowerCase() ?? '') || lines.some((line) => line.trim() === '---')
    const typeLine = TYPE_LINE.exec(node.value)
    if (looksLikeFrontmatter && typeLine) found = { lines, typeLineValue: typeLine[1] }
  })
  return found
}

/** 行のコメント（` #` 以降）を返します。コメントが無ければ空文字です。 */
function commentOf(line: string): string {
  const position = line.search(/\s#/)
  return position < 0 ? '' : line.slice(position)
}

/** type の行の値から、`|` 区切りの選択肢を読み取ります。 */
function parseTypeValues(typeLineValue: string): RuleResult<string[]> {
  const value = typeLineValue.replace(/\s#.*$/, '').trim()
  const candidates = value.split('|').map((item) => item.trim())
  if (candidates.length < 2 || !candidates.every((item) => TYPE_VALUE.test(item))) {
    return { ok: false, reason: 'CLAUDE.md の frontmatter の例から type の選択肢を読み取れないため、判定していません（`type: a | b | c` の形式の行が必要です）。' }
  }
  return { ok: true, value: candidates }
}

/**
 * スキーマから frontmatter の規則を読み取ります。
 *
 * @param schema - CLAUDE.md の内容
 * @returns 必須項目と type の選択肢。読み取れないものは理由を持ちます
 */
export function parseFrontmatterRules(schema: string): FrontmatterRules {
  const example = findFrontmatterExample(schema)
  if (example === null) {
    const reason = 'CLAUDE.md に frontmatter の例（yaml のコードブロックで type の行を含むもの）が見つからないため、判定していません。'
    return { requiredKeys: { ok: false, reason }, typeValues: { ok: false, reason } }
  }
  const keys = example.lines.flatMap((line) => {
    const key = TOP_LEVEL_KEY.exec(line)?.[1]
    return key === undefined || KEYS_CHECKED_ELSEWHERE.has(key) || OPTIONAL_MARK.test(commentOf(line)) ? [] : [key]
  })
  const requiredKeys: RuleResult<string[]> =
    keys.length > 0
      ? { ok: true, value: [...new Set(keys)] }
      : { ok: false, reason: 'CLAUDE.md の frontmatter の例から必須項目を読み取れないため、判定していません。' }
  return { requiredKeys, typeValues: parseTypeValues(example.typeLineValue) }
}
