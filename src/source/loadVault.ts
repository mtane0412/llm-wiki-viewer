/**
 * WikiSource からファイルを読み込み、索引（WikiIndex）を作るモジュールです。
 *
 * 読み込み方針:
 * - wiki/ の Markdown は内容まで読み込みます。更新時刻とサイズでキャッシュし、再読み込みでは変更分だけを読みます
 * - raw/ は元資料が大量にあり得るため、パスだけを列挙し、Markdown の内容はページを開いたときに読みます
 * - wiki/ がある場合は wiki/ と raw/ だけをたどり、CLAUDE.md や tools/ などは対象外にします
 * - 変更の検知（hasChanges）は raw/ をたどらず、wiki/ 側だけを調べます。
 *   LLM の ingest では wiki/ が必ず更新されるため、そのときの再読み込みで raw/ の一覧も取り直されます
 */
import { buildWikiIndex, type WikiIndex } from '../lib/wikiIndex'
import type { SourceEntry, WikiSource } from './WikiSource'

/** 読み込み結果です。 */
export interface VaultSnapshot {
  index: WikiIndex
}

/** Wiki の読み込み器です。 */
export interface VaultLoader {
  /** ファイルを列挙し、変更された wiki/ の Markdown だけを読み直して索引を作ります。 */
  load(): Promise<VaultSnapshot>
  /** 前回の load 以降に wiki/ 側のファイルが追加・変更・削除されたかを調べます。 */
  hasChanges(): Promise<boolean>
}

/** 元資料のフォルダ名です。 */
const RAW_DIR = 'raw'

/** パスが raw/ の中にあるかを判定します。 */
function isRawPath(path: string): boolean {
  return path.startsWith(`${RAW_DIR}/`)
}

/** Markdown ファイルかを判定します。 */
function isMarkdown(path: string): boolean {
  return /\.md$/i.test(path)
}

/** ファイル一覧の状態を 1 つの文字列にまとめます。変更の有無の比較に使います。 */
function signatureOf(entries: SourceEntry[]): string {
  return entries
    .map((entry) => `${entry.path}\t${entry.lastModified}\t${entry.size}`)
    .sort()
    .join('\n')
}

/**
 * WikiSource の読み込み器を作ります。
 *
 * @param source - ファイルを読み込む手段
 * @returns 読み込み器
 */
export function createVaultLoader(source: WikiSource): VaultLoader {
  const cache = new Map<string, { version: string; content: string }>()
  let lastSignature: string | null = null
  let wikiRoot: string | null = null

  /** たどるフォルダを決めます。wiki/ がある場合は wiki/ と raw/ だけです。 */
  const includeDirFor = (root: string, includeRaw: boolean) => (dirPath: string) => {
    const top = dirPath.split('/')[0]
    if (top === RAW_DIR) return includeRaw
    return root === '' || top === root
  }

  return {
    async load() {
      const root = (await source.hasDirectory('wiki')) ? 'wiki' : ''
      const entries = await source.listFiles({
        includeDir: includeDirFor(root, true),
        withMetadata: (path) => !isRawPath(path),
      })

      const wikiMarkdown = entries.filter((entry) => isMarkdown(entry.path) && !isRawPath(entry.path))
      const markdownFiles = await Promise.all(
        wikiMarkdown.map(async (entry) => {
          const version = `${entry.lastModified}:${entry.size}`
          const cached = cache.get(entry.path)
          if (cached && cached.version === version) return { path: entry.path, content: cached.content }
          const content = await source.readText(entry.path)
          cache.set(entry.path, { version, content })
          return { path: entry.path, content }
        }),
      )
      // 削除されたファイルのキャッシュを捨てます
      const alive = new Set(wikiMarkdown.map((entry) => entry.path))
      for (const path of cache.keys()) if (!alive.has(path)) cache.delete(path)

      wikiRoot = root
      lastSignature = signatureOf(entries.filter((entry) => !isRawPath(entry.path)))
      return {
        index: buildWikiIndex({
          markdownFiles,
          unloadedMarkdownPaths: entries.filter((entry) => isMarkdown(entry.path) && isRawPath(entry.path)).map((entry) => entry.path),
          assetPaths: entries
            .filter((entry) => !isMarkdown(entry.path))
            .map((entry) => entry.path)
            .sort(),
        }),
      }
    },
    async hasChanges() {
      if (wikiRoot === null) return true
      const entries = await source.listFiles({ includeDir: includeDirFor(wikiRoot, false) })
      return signatureOf(entries.filter((entry) => !isRawPath(entry.path))) !== lastSignature
    },
  }
}
