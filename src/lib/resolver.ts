/**
 * wikilink のリンク先をファイルパスへ解決するモジュールです。
 *
 * Obsidian と同様に、次の順で探します。大文字と小文字は区別しません。
 * 1. Wiki ルート（通常は wiki/）からの相対パス
 * 2. 選択したフォルダ全体からのパス（`raw/...` など）
 * 3. リンク元ページのフォルダからの相対パス
 * 4. ファイル名（重複時はリンク元と同じフォルダ → wiki 領域 → 短いパス → 辞書順で優先）
 * 5. frontmatter の aliases と title
 */
import { basename, dirname, joinPath, stripMarkdownExtension } from './path'

/** 解決の候補になるファイルの情報です。 */
export interface ResolvableEntry {
  /** 選択したフォルダからの相対パスです。 */
  path: string
  /** wiki（LLM が書くページ）か raw（元資料）かの区別です。 */
  area: 'wiki' | 'raw'
  /** ページのタイトルです。 */
  title: string
  /** ページの別名です。 */
  aliases: string[]
}

/** リンク先とリンク元のパスを受け取り、解決したパスか null を返す関数です。 */
export type Resolver = (target: string, fromPath: string) => string | null

/**
 * 照合用にキーを正規化します（前後の空白の除去・拡張子 .md の除去・小文字化）。
 *
 * リンク先の表記ゆれを同じものとして扱う規則です。解決できないリンク先の集計にも使います。
 */
export function normalizeKey(value: string): string {
  return stripMarkdownExtension(value.trim()).toLowerCase()
}

/** Map の配列値に要素を追加します。 */
function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * ファイルの一覧からリンク解決関数を作ります。
 *
 * @param entries - 解決の候補となるページと添付ファイル
 * @param wikiRoot - Wiki ルートのフォルダ（wiki/ が無い場合は空文字）
 * @returns リンク解決関数
 */
export function createResolver(entries: ResolvableEntry[], wikiRoot: string): Resolver {
  const byPath = new Map<string, ResolvableEntry>()
  const byBasename = new Map<string, ResolvableEntry[]>()
  const byName = new Map<string, ResolvableEntry[]>()

  for (const entry of entries) {
    byPath.set(normalizeKey(entry.path), entry)
    pushTo(byBasename, normalizeKey(basename(entry.path)), entry)
    for (const name of [entry.title, ...entry.aliases]) {
      if (name) pushTo(byName, normalizeKey(name), entry)
    }
  }

  /** 候補が複数ある場合に優先順位を付けて 1 件を選びます。 */
  const pickBest = (candidates: ResolvableEntry[], fromDir: string): ResolvableEntry => {
    const rank = (entry: ResolvableEntry) => [dirname(entry.path) === fromDir ? 0 : 1, entry.area === 'wiki' ? 0 : 1, entry.path.length] as const
    return [...candidates].sort((left, right) => {
      const [a, b] = [rank(left), rank(right)]
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i]
      }
      return left.path.localeCompare(right.path)
    })[0]
  }

  return (target, fromPath) => {
    const key = normalizeKey(target)
    if (!key) return null
    const fromDir = dirname(fromPath)

    const pathCandidates = [wikiRoot ? `${wikiRoot}/${key}` : key, key, joinPath(fromDir.toLowerCase(), key)]
    for (const candidate of pathCandidates) {
      const entry = candidate === null ? undefined : byPath.get(candidate)
      if (entry) return entry.path
    }

    // パスつきのリンク（`concepts/x`）は、末尾がそのパスに一致するファイルだけを候補にします
    const sameName = (byBasename.get(basename(key)) ?? []).filter(
      (entry) => !key.includes('/') || normalizeKey(entry.path).endsWith(`/${key}`),
    )
    if (sameName.length > 0) return pickBest(sameName, fromDir).path

    const named = byName.get(key)
    if (named) return pickBest(named, fromDir).path

    return null
  }
}
