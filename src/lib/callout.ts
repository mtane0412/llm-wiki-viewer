/**
 * Obsidian 形式の callout（`> [!type] タイトル`）を扱うモジュールです。
 *
 * - remarkCallout: 本文の描画時に、callout の引用ブロックを種類つきの枠（タイトル部と本文部）に変換する remark プラグイン
 * - extractCallouts / collectCallouts: ページや Wiki 全体から callout を集める関数（「矛盾・未確認」の一覧に使います）
 *
 * LLM Wiki のスキーマでは、ソース間の矛盾を `> [!warning] 矛盾`、推測を `> [!question] 未確認` で書くと定めています。
 * Obsidian の別名（`caution` → `warning` など）は正規の種類にまとめ、未知の種類はそのまま小文字で扱います。
 */
import type { Blockquote, BlockContent, DefinitionContent, Paragraph, PhrasingContent, Root, Text } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type { WikiPage } from './wikiIndex'

/** Obsidian の callout の別名と、正規の種類の対応です。`constructor` などの組み込みのプロパティ名と混ざらないよう Map にします。 */
const CALLOUT_ALIASES = new Map(
  Object.entries({
    summary: 'abstract',
    tldr: 'abstract',
    hint: 'tip',
    important: 'tip',
    check: 'success',
    done: 'success',
    help: 'question',
    faq: 'question',
    caution: 'warning',
    attention: 'warning',
    fail: 'failure',
    missing: 'failure',
    error: 'danger',
    cite: 'quote',
  }),
)

/** 見た目（色・アイコン）を定めている callout の種類です。これ以外は既定の見た目で描画します。 */
const KNOWN_CALLOUT_TYPES = new Set([
  'note',
  'abstract',
  'info',
  'todo',
  'tip',
  'success',
  'question',
  'warning',
  'failure',
  'danger',
  'bug',
  'example',
  'quote',
])

/** callout を取り出すための Markdown の解析器です（GFM の表などの中の callout の記法を本文と区別するため GFM を含めます）。 */
const parser = unified().use(remarkParse).use(remarkGfm)

/** callout の先頭行の `[!type]` と折りたたみの記号（+ / -）です。 */
const MARKER = /^\[!([^\]\s]+)\][+-]?[ \t]*/

/** callout の記法の解析結果です。 */
export interface CalloutMarker {
  /** 正規の種類（小文字・別名は正規の名前に変換済み）です。 */
  type: string
  /** タイトルです。省略された場合は種類の名前（先頭を大文字）です。 */
  title: string
}

/** ページから取り出した callout です。 */
export interface ExtractedCallout {
  type: string
  title: string
  /** 本文を 1 行の文字列にしたものです（Markdown の記号は除き、wikilink は書かれたままです）。 */
  text: string
}

/** Wiki 全体から集めた callout です。 */
export interface CalloutMention extends ExtractedCallout {
  /** callout を含むページのパスです。 */
  pagePath: string
}

/** 書かれたままの種類を、正規の種類に変換します。 */
function canonicalType(rawType: string): string {
  const lower = rawType.toLowerCase()
  return CALLOUT_ALIASES.get(lower) ?? lower
}

/** タイトルが省略された場合の既定のタイトル（種類の名前の先頭を大文字にしたもの）です。 */
function defaultTitle(rawType: string): string {
  const lower = rawType.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * callout の先頭行（`[!type] タイトル`）を解析します。
 *
 * @param line - 引用ブロックの先頭行から `> ` を除いた文字列
 * @returns 種類とタイトル。callout の記法でなければ null
 */
export function parseCalloutMarker(line: string): CalloutMarker | null {
  return matchMarker(line)?.marker ?? null
}

/** 文字列の先頭の `[!type]` を解析し、種類・タイトルと、`[!type]` の部分の文字数を返します。 */
function matchMarker(line: string): { marker: CalloutMarker; length: number } | null {
  const match = MARKER.exec(line)
  if (!match) return null
  const rawType = match[1]
  const title = line.slice(match[0].length).trim()
  return { marker: { type: canonicalType(rawType), title: title || defaultTitle(rawType) }, length: match[0].length }
}

/** 引用ブロックを callout として分解した結果です。 */
interface CalloutParts {
  marker: CalloutMarker
  /** タイトルの行のインライン要素です。タイトルが省略された場合は空です。 */
  titleNodes: PhrasingContent[]
  /** タイトルの行より後ろの本文です。 */
  bodyNodes: (BlockContent | DefinitionContent)[]
}

/**
 * 引用ブロックを callout のタイトルと本文に分解します。callout でなければ null です。
 *
 * 先頭の段落の 1 行目（最初の改行まで）がタイトルで、残りの行と 2 つ目以降のブロックが本文です。
 * タイトルの行に wikilink や強調があっても、インライン要素のまま残します。
 */
function splitCallout(node: Blockquote): CalloutParts | null {
  const [first, ...restBlocks] = node.children
  if (first?.type !== 'paragraph') return null
  const [head, ...restInline] = first.children
  if (head?.type !== 'text') return null
  const matched = matchMarker(head.value.split('\n')[0])
  if (!matched) return null
  const { marker } = matched

  // 先頭のテキストから `[!type]` を除き、最初の改行の位置でタイトルと本文の行に分けます
  const afterMarker: Text = { type: 'text', value: head.value.slice(matched.length) }
  const titleNodes: PhrasingContent[] = []
  const restLineNodes: PhrasingContent[] = []
  let inTitle = true
  for (const child of [afterMarker, ...restInline]) {
    if (!inTitle) {
      restLineNodes.push(child)
      continue
    }
    const newline = child.type === 'text' ? child.value.indexOf('\n') : -1
    if (child.type === 'text' && newline >= 0) {
      titleNodes.push({ type: 'text', value: child.value.slice(0, newline) })
      restLineNodes.push({ type: 'text', value: child.value.slice(newline + 1) })
      inTitle = false
    } else if (child.type === 'break') {
      inTitle = false
    } else {
      titleNodes.push(child)
    }
  }

  const hasTitle = titleNodes.some((child) => toString(child).trim() !== '')
  const restParagraph: Paragraph[] = restLineNodes.some((child) => toString(child).trim() !== '') ? [{ type: 'paragraph', children: restLineNodes }] : []
  return { marker, titleNodes: hasTitle ? titleNodes : [], bodyNodes: [...restParagraph, ...restBlocks] }
}

/**
 * callout の引用ブロックを、種類つきの枠に変換する remark プラグインです。
 *
 * 変換後の HTML は `div.callout.callout-{種類}[data-callout]` の中に、`div.callout-title` と `div.callout-content` を持ちます。
 * 見た目を定めていない種類は `callout-default` の見た目にします。
 */
export function remarkCallout() {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node) => {
      // 変換で作った本文の要素（callout-content）は callout の判定から外します。中の入れ子の引用は引き続きたどります
      if (node.data?.hName) return
      const parts = splitCallout(node)
      if (!parts) return
      const { type } = parts.marker
      const style = KNOWN_CALLOUT_TYPES.has(type) ? type : 'default'
      node.data = { hName: 'div', hProperties: { className: ['callout', `callout-${style}`], dataCallout: type } }
      const title: Paragraph = {
        type: 'paragraph',
        data: { hName: 'div', hProperties: { className: ['callout-title'] } },
        children: parts.titleNodes.length > 0 ? parts.titleNodes : [{ type: 'text', value: parts.marker.title }],
      }
      const content: Blockquote = {
        type: 'blockquote',
        data: { hName: 'div', hProperties: { className: ['callout-content'] } },
        children: parts.bodyNodes,
      }
      node.children = parts.bodyNodes.length > 0 ? [title, content] : [title]
    })
  }
}

/**
 * ノードの文字列を返します。入れ子の callout は別の項目として取り出すため、引用の深さを問わず除きます。
 */
function textWithoutCallouts(node: BlockContent | DefinitionContent): string {
  if (node.type !== 'blockquote') return toString(node)
  if (splitCallout(node)) return ''
  return node.children.map(textWithoutCallouts).join(' ')
}

/**
 * Markdown の本文から callout を出現順に取り出します。
 *
 * @param markdown - frontmatter を除いた本文
 * @returns callout の種類・タイトル・本文の文字列（コードブロックの中は含みません）
 */
export function extractCallouts(markdown: string): ExtractedCallout[] {
  // callout を含まない大半のページは、構文木を作らずに済ませます
  if (!markdown.includes('[!')) return []
  const tree = parser.parse(markdown)
  const callouts: ExtractedCallout[] = []
  visit(tree, 'blockquote', (node) => {
    const parts = splitCallout(node)
    if (!parts) return
    const title = parts.titleNodes.map((child) => toString(child)).join('').trim() || parts.marker.title
    const text = parts.bodyNodes
      .map(textWithoutCallouts)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    callouts.push({ type: parts.marker.type, title, text })
  })
  return callouts
}

/**
 * Wiki のページから、指定した種類の callout を集めます。
 *
 * @param pages - 索引のページ（内容を読み込んでいないページは対象外です）
 * @param types - 集める callout の正規の種類
 * @returns ページのパスの順、ページ内では出現順に並べた callout
 */
export function collectCallouts(pages: WikiPage[], types: string[]): CalloutMention[] {
  const wanted = new Set(types)
  return pages
    .filter((page) => page.loaded)
    .flatMap((page) => extractCallouts(page.body).flatMap((callout) => (wanted.has(callout.type) ? [{ pagePath: page.path, ...callout }] : [])))
}
