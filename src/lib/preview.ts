/**
 * wikilink のホバープレビューに表示する内容（リンク先のタイトル・type・本文の冒頭）を作るモジュールです。
 *
 * - `[[page]]` は、本文の先頭の h1 を除いた冒頭を返します
 * - `[[page#見出し]]` は、その見出しの直後から、同じか上の段の次の見出しまでを返します
 * - 本文は Markdown の記号・コード・HTML・画像を除いた 1 行の文字列にし、wikilink は本文の描画と同じ表示名に置き換えます
 * - 作ったプレビューは索引ごとにキャッシュし、同じリンクに何度マウスを重ねても本文を解析し直しません
 * - 内容を読み込んでいない元資料（raw/）は、開いたときに読み込むことを示します
 */
import type { Nodes, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { createWikilinkOptions, remarkWikilink } from './remarkWikilink'
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

/** 抜粋に含めないノードの種類です（コード・生の HTML・画像）。 */
const SKIPPED_TYPES = new Set(['code', 'html', 'image', 'imageReference'])

/** 子がブロック（段落・リストの項目・表の行など）であるノードの種類です。子の文字列の間に空白を入れます。 */
const BLOCK_CONTAINER_TYPES = new Set(['root', 'blockquote', 'list', 'listItem', 'table', 'tableRow'])

/** ノードの文字列を返します。ブロックの区切りには空白を入れ、コード・HTML・画像は除きます。 */
function textOf(node: Nodes): string {
  if (SKIPPED_TYPES.has(node.type)) return ''
  if ('children' in node) return node.children.map(textOf).join(BLOCK_CONTAINER_TYPES.has(node.type) ? ' ' : '')
  return 'value' in node ? node.value : ''
}

/** ノードの並びを 1 行の文字列にし、EXCERPT_LENGTH 文字までに切ります。切った場合は末尾に … を付けます。 */
function excerptOf(nodes: RootContent[]): string {
  let text = ''
  for (const node of nodes) {
    text = `${text} ${textOf(node)}`.replace(/\s+/g, ' ').trim()
    // 抜粋に必要な長さに達したら、残りのノードは文字列にしません
    if ([...text].length > EXCERPT_LENGTH) break
  }
  const characters = [...text]
  return characters.length > EXCERPT_LENGTH ? `${characters.slice(0, EXCERPT_LENGTH).join('')}…` : text
}

/** 指定した見出しの直後から、同じか上の段の次の見出しまでのノードを返します。見出しが無ければ null です。 */
function sectionAfter(nodes: RootContent[], heading: string): RootContent[] | null {
  // 見出しの文字列は、目次（toc.ts）と同じく本文の見出しの id と同じ規則で作ります
  const start = nodes.findIndex((node) => node.type === 'heading' && toString(node, { includeImageAlt: false }).trim() === heading)
  if (start < 0) return null
  const startNode = nodes[start]
  const depth = startNode.type === 'heading' ? startNode.depth : 0
  const end = nodes.findIndex((node, position) => position > start && node.type === 'heading' && node.depth <= depth)
  return nodes.slice(start + 1, end < 0 ? nodes.length : end)
}

/** 索引ごとの、作成済みのプレビューです。索引が作り直されると、古い索引ごと捨てられます。 */
const cache = new WeakMap<WikiIndex, Map<string, LinkPreview>>()

/**
 * リンク先のページのプレビューを作ります。
 *
 * @param index - Wiki の索引
 * @param path - リンク先のページのパス（解決済みであること）
 * @param heading - リンクで指定された見出し（`[[page#見出し]]`）
 * @returns プレビューの内容
 */
export function previewOf(index: WikiIndex, path: string, heading: string | undefined): LinkPreview {
  const cached = cache.get(index) ?? new Map<string, LinkPreview>()
  cache.set(index, cached)
  const key = `${path}\u0000${heading ?? ''}`
  const hit = cached.get(key)
  if (hit) return hit
  const preview = buildPreview(index, path, heading)
  cached.set(key, preview)
  return preview
}

/** プレビューを作ります（previewOf のキャッシュが無い場合の処理です）。 */
function buildPreview(index: WikiIndex, path: string, heading: string | undefined): LinkPreview {
  const page = index.pageByPath.get(path)
  // 呼び出し元は解決済みのパスを渡すため、索引に無いのは前提の誤りです
  if (!page) throw new Error(`プレビューするページが索引にありません: ${path}`)
  if (!page.loaded) return { kind: 'unloaded', title: page.title }

  // 本文の描画と同じく wikilink を表示名に変換します（URL は使わないため、Wiki の id は空にします）
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkWikilink, createWikilinkOptions(index, path, ''))
  const tree = processor.parse(page.body)
  processor.runSync(tree)
  const nodes = tree.children

  if (heading) {
    const section = sectionAfter(nodes, heading)
    if (!section) return { kind: 'page', title: page.title, type: page.type, heading, excerpt: '', missingHeading: true }
    return { kind: 'page', title: page.title, type: page.type, heading, excerpt: excerptOf(section) }
  }
  // ページの題名と重なる先頭の h1 は除きます
  const [first, ...rest] = nodes
  const body = first?.type === 'heading' && first.depth === 1 ? rest : nodes
  return { kind: 'page', title: page.title, type: page.type, excerpt: excerptOf(body) }
}
