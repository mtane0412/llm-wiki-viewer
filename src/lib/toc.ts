/**
 * ページ本文（Markdown）から、目次に使う見出しの一覧を取り出すモジュールです。
 *
 * 本文の描画（MarkdownView）と同じく GFM と wikilink の変換を通してから見出しの文字列を作ります。
 * こうすることで、目次の見出しの文字列が、本文の見出し要素に付く id（描画後の文字列）と一致します。
 */
import type { Root } from 'mdast'
import { toString } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { remarkWikilink, type RemarkWikilinkOptions } from './remarkWikilink'

/** 目次の 1 項目です。 */
export interface TocHeading {
  /** 見出しの段（h1 なら 1）です。 */
  depth: number
  /** 見出しの文字列です。本文の見出し要素の id と同じ値です。 */
  text: string
}

/**
 * Markdown の本文から見出しを出現順に取り出します。
 *
 * @param markdown - frontmatter を除いた本文
 * @param wikilinkOptions - 本文の描画と同じ wikilink の解決方法（見出しの中の wikilink の表示名に使います）
 * @returns 見出しの一覧。コードブロックの中の `#` は含みません
 */
export function extractHeadings(markdown: string, wikilinkOptions: RemarkWikilinkOptions): TocHeading[] {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkWikilink, wikilinkOptions)
  const tree: Root = processor.parse(markdown)
  // remarkWikilink は構文木をその場で書き換えるため、変換後の tree をそのまま読みます
  processor.runSync(tree)
  const headings: TocHeading[] = []
  visit(tree, 'heading', (node) => {
    // 描画時の見出しの id は、子要素の文字列から作ります（画像の alt は文字列に含まれません）
    headings.push({ depth: node.depth, text: toString(node, { includeImageAlt: false }).trim() })
  })
  return headings
}
