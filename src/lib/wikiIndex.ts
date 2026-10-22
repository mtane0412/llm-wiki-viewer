/**
 * 読み込んだ Markdown ファイル群から、閲覧に必要な索引を組み立てるモジュールです。
 *
 * 索引には、ページの一覧、リンクの解決結果、バックリンク、lint の指摘が含まれます。
 * 選択したフォルダに `wiki/` があればそこを Wiki ルートとし、`raw/` を元資料として扱います。
 * `wiki/` が無い場合は、選択したフォルダ全体（`raw/` を除く）を Wiki とみなします。
 */
import { parseFrontmatter } from './frontmatter'
import { basename, dirname, stripMarkdownExtension } from './path'
import { createResolver, type Resolver } from './resolver'
import { extractWikilinks, parseWikilink, type ExtractedWikilink } from './wikilink'

/** 読み込んだ Markdown ファイルです。 */
export interface MarkdownFile {
  /** 選択したフォルダからの相対パスです。 */
  path: string
  /** ファイルの内容です。 */
  content: string
}

/** 索引に載る 1 ページです。 */
export interface WikiPage {
  /** 選択したフォルダからの相対パスです。 */
  path: string
  /** wiki（LLM が書くページ）か raw（元資料）かの区別です。 */
  area: 'wiki' | 'raw'
  /** frontmatter の title、無ければファイル名です。 */
  title: string
  aliases: string[]
  tags: string[]
  /** frontmatter の type（concept / source など）です。 */
  type: string | undefined
  /** frontmatter の updated です。 */
  updated: string | undefined
  /** frontmatter の sources に書かれた wikilink のリンク先です。 */
  sources: string[]
  /** frontmatter 全体です。 */
  frontmatter: Record<string, unknown>
  /** frontmatter を除いた本文です。loaded が false の場合は空文字です。 */
  body: string
  /**
   * 内容を読み込んだかどうかです。raw/ の元資料は件数が多いため内容を読まずに索引へ載せ、
   * ページを開いたときに読み込みます。
   */
  loaded: boolean
}

/** ページから出ているリンクです。 */
export interface PageLink extends ExtractedWikilink {
  /** 本文中のリンクか、frontmatter の sources に書かれたリンクかの区別です。 */
  origin: 'body' | 'frontmatter'
  /** 解決したリンク先のパスです。解決できなければ null です。 */
  resolvedPath: string | null
}

/** lint の指摘です。 */
export type LintIssue =
  | { kind: 'broken-link'; page: string; target: string }
  | { kind: 'orphan'; page: string }
  | { kind: 'missing-sources'; page: string }
  | { kind: 'frontmatter-error'; page: string; message: string }

/** Wiki 全体の索引です。 */
export interface WikiIndex {
  /** Wiki ルートのフォルダです。wiki/ が無い場合は空文字です。 */
  wikiRoot: string
  /** パスの辞書順に並べたページの一覧です。 */
  pages: WikiPage[]
  pageByPath: Map<string, WikiPage>
  /** 画像など Markdown 以外のファイルのパスです。 */
  assetPaths: string[]
  /** ページごとの出ているリンクです。 */
  outgoing: Map<string, PageLink[]>
  /** ページごとの、そのページへリンクしているページのパス（辞書順・重複なし）です。 */
  backlinks: Map<string, string[]>
  /** lint の指摘です。 */
  issues: LintIssue[]
  /** 最初に表示するページ（index.md など）のパスです。 */
  homePath: string | null
  /** wikilink を解決する関数です。 */
  resolve: Resolver
}

/** 索引の入力です。 */
export interface WikiIndexInput {
  /** 内容を読み込んだ Markdown ファイルです。 */
  markdownFiles: MarkdownFile[]
  /** 内容を読み込んでいない Markdown ファイル（raw/ の元資料）のパスです。 */
  unloadedMarkdownPaths: string[]
  /** 画像など Markdown 以外のファイルのパスです。 */
  assetPaths: string[]
}

/** 目次や記録として特別扱いするページのファイル名（小文字・拡張子なし）です。 */
const SPECIAL_PAGE_NAMES = new Set(['index', 'log', 'overview'])

/** ページが index / log / overview のいずれかかを判定します。 */
export function isSpecialPage(path: string): boolean {
  return SPECIAL_PAGE_NAMES.has(stripMarkdownExtension(basename(path)).toLowerCase())
}

/** 値を文字列の配列として取り出します。単一の文字列は 1 要素の配列にします。 */
function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map(String)
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

/** 値が空でなければ文字列にします。YAML が日付として解釈した値も文字列にします。 */
function toOptionalString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (value === null || value === undefined || value === '') return undefined
  return String(value)
}

/** frontmatter の sources の各要素から wikilink のリンク先を取り出します。 */
function parseSourceTargets(sources: string[]): string[] {
  return sources
    .map((source) => {
      const match = /^\s*\[\[([^\]]+)\]\]\s*$/.exec(source)
      return parseWikilink(match ? match[1] : source).target
    })
    .filter(Boolean)
}

/** ファイルのパスから、そのファイルが属する領域を判定します。どちらにも属さなければ null です。 */
function areaOf(path: string, wikiRoot: string): WikiPage['area'] | null {
  if (path.startsWith('raw/')) return 'raw'
  if (!wikiRoot || path.startsWith(`${wikiRoot}/`)) return 'wiki'
  return null
}

/**
 * Markdown ファイルを解析してページにします。
 *
 * @param file - Markdown ファイル
 * @param area - ページの領域
 * @returns ページと、frontmatter の解析エラー
 */
export function toPage(file: MarkdownFile, area: WikiPage['area']): { page: WikiPage; frontmatterError: string | undefined } {
  const { data, body, error } = parseFrontmatter(file.content)
  const sourceList = toStringList(data.sources)
  return {
    page: {
      path: file.path,
      area,
      title: toOptionalString(data.title) ?? stripMarkdownExtension(basename(file.path)),
      aliases: toStringList(data.aliases),
      tags: toStringList(data.tags),
      type: toOptionalString(data.type),
      updated: toOptionalString(data.updated),
      sources: parseSourceTargets(sourceList),
      frontmatter: data,
      body,
      loaded: true,
    },
    frontmatterError: error,
  }
}

/** 内容を読み込んでいない Markdown ファイルを、ファイル名をタイトルとするページにします。 */
function toUnloadedPage(path: string, area: WikiPage['area']): WikiPage {
  const title = stripMarkdownExtension(basename(path))
  return { path, area, title, aliases: [], tags: [], type: undefined, updated: undefined, sources: [], frontmatter: {}, body: '', loaded: false }
}

/** ホームページを選びます。Wiki ルート直下の index → overview → 先頭のページの順です。 */
function pickHomePath(pages: WikiPage[], wikiRoot: string): string | null {
  const rootPages = pages.filter((page) => page.area === 'wiki' && dirname(page.path) === wikiRoot)
  for (const name of ['index', 'overview']) {
    const found = rootPages.find((page) => stripMarkdownExtension(basename(page.path)).toLowerCase() === name)
    if (found) return found.path
  }
  return pages.find((page) => page.area === 'wiki')?.path ?? null
}

/** sources が必要なページかを判定します。目次類とソース要約ページ自体は対象外です。 */
function requiresSources(page: WikiPage, wikiRoot: string): boolean {
  if (page.area !== 'wiki' || isSpecialPage(page.path)) return false
  const relative = wikiRoot ? page.path.slice(wikiRoot.length + 1) : page.path
  return page.type !== 'source' && !relative.startsWith('sources/')
}

/**
 * Markdown ファイル群から Wiki の索引を組み立てます。
 *
 * @param input - 読み込んだ Markdown ファイルと、Markdown 以外のファイルのパス
 * @returns ページ・リンク・バックリンク・lint の指摘をまとめた索引
 */
export function buildWikiIndex(input: WikiIndexInput): WikiIndex {
  const wikiRoot = [...input.markdownFiles.map((file) => file.path), ...input.unloadedMarkdownPaths].some((path) => path.startsWith('wiki/')) ? 'wiki' : ''
  const issues: LintIssue[] = []

  const pages: WikiPage[] = []
  for (const file of input.markdownFiles) {
    const area = areaOf(file.path, wikiRoot)
    if (!area) continue
    const { page, frontmatterError } = toPage(file, area)
    pages.push(page)
    if (frontmatterError && area === 'wiki') {
      issues.push({ kind: 'frontmatter-error', page: file.path, message: frontmatterError })
    }
  }
  for (const path of input.unloadedMarkdownPaths) {
    const area = areaOf(path, wikiRoot)
    if (area) pages.push(toUnloadedPage(path, area))
  }
  pages.sort((a, b) => a.path.localeCompare(b.path))
  const pageByPath = new Map(pages.map((page) => [page.path, page]))

  const assetEntries = input.assetPaths.map((path) => ({ path, area: 'raw' as const, title: basename(path), aliases: [] }))
  const resolve = createResolver([...pages, ...assetEntries], wikiRoot)

  const outgoing = new Map<string, PageLink[]>()
  const backlinkSets = new Map<string, Set<string>>()
  for (const page of pages) {
    const links: PageLink[] = [
      ...extractWikilinks(page.body).map((link) => ({ ...link, origin: 'body' as const })),
      ...page.sources.map((target) => ({ target, heading: undefined, alias: undefined, embed: false, origin: 'frontmatter' as const })),
    ].map((link) => ({ ...link, resolvedPath: resolve(link.target, page.path) }))
    outgoing.set(page.path, links)

    for (const link of links) {
      if (link.resolvedPath === null) {
        if (page.area === 'wiki') issues.push({ kind: 'broken-link', page: page.path, target: link.target })
      } else if (link.resolvedPath !== page.path) {
        const set = backlinkSets.get(link.resolvedPath) ?? new Set<string>()
        set.add(page.path)
        backlinkSets.set(link.resolvedPath, set)
      }
    }
  }
  const backlinks = new Map([...backlinkSets].map(([path, set]) => [path, [...set].sort((a, b) => a.localeCompare(b))]))

  for (const page of pages) {
    if (page.area !== 'wiki') continue
    if (!isSpecialPage(page.path)) {
      const hasWikiInbound = (backlinks.get(page.path) ?? []).some((from) => pageByPath.get(from)?.area === 'wiki')
      if (!hasWikiInbound) issues.push({ kind: 'orphan', page: page.path })
    }
    if (requiresSources(page, wikiRoot) && page.sources.length === 0) {
      issues.push({ kind: 'missing-sources', page: page.path })
    }
  }

  return {
    wikiRoot,
    pages,
    pageByPath,
    assetPaths: input.assetPaths,
    outgoing,
    backlinks,
    issues,
    homePath: pickHomePath(pages, wikiRoot),
    resolve,
  }
}
