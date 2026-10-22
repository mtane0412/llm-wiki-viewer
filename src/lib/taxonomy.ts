/**
 * ページの frontmatter の tags と type を集計し、絞り込んだページの一覧を作るモジュールです。
 *
 * タグ・type の一覧画面と、タグ・type で絞り込んだページの一覧画面で使います。
 * タグと type は frontmatter に書かれた文字列のまま比較します（大文字小文字も区別します）。
 */
import type { WikiPage } from './wikiIndex'

/** タグまたは type の値と、それを持つページの数です。 */
export interface ValueCount {
  value: string
  count: number
}

/** 値ごとの件数を数え、多い順（同数なら値の文字列の順）に並べます。 */
function countValues(valuesPerPage: string[][]): ValueCount[] {
  const counts = new Map<string, number>()
  for (const values of valuesPerPage) {
    // 同じページに同じタグが重複して書かれていても 1 ページとして数えます
    for (const value of new Set(values)) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** ページをタイトルの順に並べます。同じタイトルならパスの順です。 */
function byTitle(pages: WikiPage[]): WikiPage[] {
  return [...pages].sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))
}

/**
 * タグごとのページ数を数えます。
 *
 * @param pages - 索引のページ
 * @returns タグとページ数（多い順、同数ならタグの文字列の順）
 */
export function countTags(pages: WikiPage[]): ValueCount[] {
  return countValues(pages.map((page) => page.tags))
}

/**
 * type ごとのページ数を数えます。type の無いページは数えません。
 *
 * @param pages - 索引のページ
 * @returns type とページ数（多い順、同数なら type の文字列の順）
 */
export function countTypes(pages: WikiPage[]): ValueCount[] {
  return countValues(pages.map((page) => (page.type ? [page.type] : [])))
}

/**
 * 指定したタグを持つページを返します。
 *
 * @param pages - 索引のページ
 * @param tag - タグ
 * @returns タグを持つページ（タイトルの順）
 */
export function pagesWithTag(pages: WikiPage[], tag: string): WikiPage[] {
  return byTitle(pages.filter((page) => page.tags.includes(tag)))
}

/**
 * 指定した type のページを返します。
 *
 * @param pages - 索引のページ
 * @param type - type の値
 * @returns type が一致するページ（タイトルの順）
 */
export function pagesWithType(pages: WikiPage[], type: string): WikiPage[] {
  return byTitle(pages.filter((page) => page.type === type))
}
