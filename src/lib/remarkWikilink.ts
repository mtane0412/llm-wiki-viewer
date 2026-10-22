/**
 * Markdown の構文木（mdast）の中の wikilink を、リンクや画像のノードに変換する remark プラグインです。
 *
 * テキストノードだけを対象にするため、コードブロックとインラインコードの中は変換されません。
 * GFM の表の中でエスケープした `[[page\|表示名]]` は、解析後のテキストでは `[[page|表示名]]` になります。
 */
import type { Root, PhrasingContent } from 'mdast'
import { findAndReplace } from 'mdast-util-find-and-replace'
import { basename } from './path'
import { parseWikilink } from './wikilink'

/** 埋め込みのうち画像として表示する拡張子です。 */
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i

/** プラグインの設定です。 */
export interface RemarkWikilinkOptions {
  /** リンク先を解決し、ファイルのパスを返します。解決できなければ null です。 */
  resolve: (target: string) => string | null
  /** ページのタイトルを返します。 */
  titleOf: (path: string) => string
  /** ページへのリンクの href を作ります。 */
  hrefOf: (path: string, heading: string | undefined) => string
}

/** 埋め込み画像に付けるクラス名です。画像の src が Wiki フォルダからのパスであることを示します。 */
export const EMBED_CLASS = 'wikilink-embed'

/**
 * wikilink を変換する remark プラグインです。
 *
 * @param options - リンクの解決方法
 */
export function remarkWikilink(options: RemarkWikilinkOptions) {
  return (tree: Root) => {
    findAndReplace(tree, [
      /(!?)\[\[([^\]\n]+?)\]\]/g,
      (_whole: string, bang: string, inner: string): PhrasingContent | false => {
        const { target, heading, alias } = parseWikilink(inner)
        if (!target) return false
        const resolved = options.resolve(target)

        if (!resolved) {
          return {
            type: 'emphasis',
            data: { hName: 'span', hProperties: { className: ['wikilink-broken'], title: `リンク先が見つかりません: ${target}` } },
            children: [{ type: 'text', value: alias ?? target }],
          }
        }
        if (bang === '!' && IMAGE_EXTENSION.test(resolved)) {
          return { type: 'image', url: resolved, alt: alias ?? basename(resolved), data: { hProperties: { className: [EMBED_CLASS] } } }
        }
        const label = alias ?? (heading ? `${options.titleOf(resolved)} › ${heading}` : options.titleOf(resolved))
        return {
          type: 'link',
          url: options.hrefOf(resolved, heading),
          data: { hProperties: { className: ['wikilink'] } },
          children: [{ type: 'text', value: label }],
        }
      },
    ])
  }
}
