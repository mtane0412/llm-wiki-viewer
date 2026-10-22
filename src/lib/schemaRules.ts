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
 * このブロックの最上位のキーを必須項目とし、type の行の `|` 区切りの値を type の選択肢とします。
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

/** 例のコードブロックの最上位のキーの行です（`key: 値`）。 */
const TOP_LEVEL_KEY = /^([A-Za-z_][\w-]*)\s*:/

/** type の行です。 */
const TYPE_LINE = /^type\s*:(.*)$/m

/** type の選択肢 1 つの書式です。 */
const TYPE_VALUE = /^[\w-]+$/

/** 「sources 未記載」の指摘で扱うため、必須項目の欠けとしては数えないキーです。 */
const KEYS_CHECKED_ELSEWHERE = new Set(['sources'])

/** CLAUDE.md のコードブロックのうち、frontmatter の例（type の行を含むもの）を探します。 */
function findFrontmatterExample(schema: string): string | null {
  let found: string | null = null
  visit(unified().use(remarkParse).parse(schema), 'code', (node) => {
    if (found === null && TYPE_LINE.test(node.value)) found = node.value
  })
  return found
}

/** type の行の値から、`|` 区切りの選択肢を読み取ります。 */
function parseTypeValues(example: string): RuleResult<string[]> {
  const value = (TYPE_LINE.exec(example)?.[1] ?? '').replace(/#.*$/, '').trim()
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
    const reason = 'CLAUDE.md に frontmatter の例（type の行を含むコードブロック）が見つからないため、判定していません。'
    return { requiredKeys: { ok: false, reason }, typeValues: { ok: false, reason } }
  }
  const keys = example
    .split(/\r?\n/)
    .map((line) => TOP_LEVEL_KEY.exec(line)?.[1])
    .filter((key): key is string => key !== undefined && !KEYS_CHECKED_ELSEWHERE.has(key))
  return { requiredKeys: { ok: true, value: [...new Set(keys)] }, typeValues: parseTypeValues(example) }
}
