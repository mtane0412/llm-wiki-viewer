/**
 * Obsidian 形式の wikilink（`[[page#見出し|表示名]]`）を解析するモジュールです。
 *
 * 表の中では区切りの `|` を `\|` とエスケープする書き方があるため、両方を表示名の区切りとして扱います。
 * コードブロックとインラインコードの中にある `[[...]]` はリンクとみなしません。
 */

/** wikilink の構成要素です。 */
export interface WikilinkParts {
  /** リンク先（拡張子 .md は取り除きます）です。 */
  target: string
  /** `#` 以降の見出しです。 */
  heading: string | undefined
  /** `|` 以降の表示名です。 */
  alias: string | undefined
}

/** 本文から取り出した wikilink です。 */
export interface ExtractedWikilink extends WikilinkParts {
  /** `![[...]]` 形式の埋め込みかどうかです。 */
  embed: boolean
}

/** `[[` と `]]` に囲まれた wikilink を見つける正規表現です。 */
export const WIKILINK_PATTERN = /(!?)\[\[([^\]\n]+?)\]\]/g

/**
 * wikilink の内側（`[[` と `]]` の間）を解析します。
 *
 * @param inner - `[[` と `]]` の間の文字列
 * @returns リンク先・見出し・表示名
 */
export function parseWikilink(inner: string): WikilinkParts {
  const pipeMatch = /\\?\|/.exec(inner)
  const linkPart = pipeMatch ? inner.slice(0, pipeMatch.index) : inner
  const alias = pipeMatch ? inner.slice(pipeMatch.index + pipeMatch[0].length).trim() : undefined
  const hashIndex = linkPart.indexOf('#')
  const rawTarget = hashIndex >= 0 ? linkPart.slice(0, hashIndex) : linkPart
  const heading = hashIndex >= 0 ? linkPart.slice(hashIndex + 1).trim() : undefined
  return {
    target: rawTarget.trim().replace(/\.md$/i, ''),
    heading: heading || undefined,
    alias: alias || undefined,
  }
}

/**
 * コードブロックとインラインコードを同じ長さの空白に置き換えます。
 * 位置を保つことで、置き換え後の文字列に対する検索結果をそのまま扱えます。
 */
function maskCode(body: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ')
  return body
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, blank)
    .replace(/`[^`\n]+`/g, blank)
}

/**
 * Markdown 本文に含まれる wikilink をすべて取り出します。
 *
 * @param body - frontmatter を除いた Markdown 本文
 * @returns 出現順の wikilink の一覧
 */
export function extractWikilinks(body: string): ExtractedWikilink[] {
  const links: ExtractedWikilink[] = []
  for (const match of maskCode(body).matchAll(WIKILINK_PATTERN)) {
    const parts = parseWikilink(match[2])
    if (parts.target) {
      links.push({ ...parts, embed: match[1] === '!' })
    }
  }
  return links
}
