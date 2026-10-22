/**
 * wikilink のホバープレビューに表示する内容（リンク先のタイトル・type・本文の冒頭）を作るモジュールです。
 *
 * - `[[page]]` は、本文の先頭の h1 を除いた冒頭を返します
 * - `[[page#見出し]]` は、その見出しの直後から、同じか上の段の次の見出しまでを返します
 * - 本文は Markdown の記号を除いた 1 行の文字列にし、wikilink は表示名（無ければ書かれたリンク先）に置き換えます
 * - 内容を読み込んでいない元資料（raw/）は、開いたときに読み込むことを示します
 */
import type { RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { WikiIndex } from './wikiIndex'

/** 本文の冒頭として表示する最大の文字数です。 */
export const EXCERPT_LENGTH = 160

/** プレビューの内容です。 */
export type LinkPreview =
  | {
      kind: 'page'
      title: string
      type?: string
      /** リンクで指定された見出しです。 */
      heading?: string
      /** 本文の冒頭（または見出しの直後）です。 */
      excerpt: string
      /** 指定された見出しがページに見つからなかった場合に true です。 */
      missingHeading?: boolean
    }
  | {
      /** 内容を読み込んでいない元資料です。 */
      kind: 'unloaded'
      title: string
    }

/** 本文を解析する Markdown の解析器です。 */
const parser = unified().use(remarkParse).use(remarkGfm)

/** wikilink の記法です。 */
const WIKILINK = /!?\[\[([^\]\n|#]*)(?:#[^\]\n|]*)?(?:\|([^\]\n]+))?\]\]/g

/** ノードの並びを、Markdown の記号を除いた 1 行の文字列にします。 */
function plainText(nodes: RootContent[]): string {
  return nodes
    .map((node) => toString(node, { includeImageAlt: false }))
    .join(' ')
    .replace(WIKILINK, (_whole, target: string, alias: string | undefined) => (alias ?? target).trim())
    .replace(/\s+/g, ' ')
    .trim()
}

/** 文字列を EXCERPT_LENGTH 文字までに切り、切った場合は末尾に … を付けます。 */
function truncate(text: string): string {
  const characters = [...text]
  return characters.length > EXCERPT_LENGTH ? `${characters.slice(0, EXCERPT_LENGTH).join('')}…` : text
}

/** 指定した見出しの直後から、同じか上の段の次の見出しまでのノードを返します。見出しが無ければ null です。 */
function sectionAfter(nodes: RootContent[], heading: string): RootContent[] | null {
  const start = nodes.findIndex((node) => node.type === 'heading' && toString(node).trim() === heading)
  if (start < 0) return null
  const startNode = nodes[start]
  const depth = startNode.type === 'heading' ? startNode.depth : 0
  const end = nodes.findIndex((node, position) => position > start && node.type === 'heading' && node.depth <= depth)
  return nodes.slice(start + 1, end < 0 ? nodes.length : end)
}

/**
 * リンク先のページのプレビューを作ります。
 *
 * @param index - Wiki の索引
 * @param path - リンク先のページのパス（解決済みであること）
 * @param heading - リンクで指定された見出し（`[[page#見出し]]`）
 * @returns プレビューの内容
 */
export function previewOf(index: WikiIndex, path: string, heading: string | undefined): LinkPreview {
  const page = index.pageByPath.get(path)
  // 呼び出し元は解決済みのパスを渡すため、索引に無いのは前提の誤りです
  if (!page) throw new Error(`プレビューするページが索引にありません: ${path}`)
  if (!page.loaded) return { kind: 'unloaded', title: page.title }

  const nodes = parser.parse(page.body).children
  if (heading) {
    const section = sectionAfter(nodes, heading)
    if (!section) return { kind: 'page', title: page.title, type: page.type, heading, excerpt: '', missingHeading: true }
    return { kind: 'page', title: page.title, type: page.type, heading, excerpt: truncate(plainText(section)) }
  }
  // ページの題名と重なる先頭の h1 は除きます
  const [first, ...rest] = nodes
  const body = first?.type === 'heading' && first.depth === 1 ? rest : nodes
  return { kind: 'page', title: page.title, type: page.type, excerpt: truncate(plainText(body)) }
}
