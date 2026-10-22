/**
 * Wiki 内のファイルパス（`/` 区切りの相対パス）を扱う小さな関数群です。
 */

/** パスからディレクトリ部分を返します。ルート直下のファイルでは空文字を返します。 */
export function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index >= 0 ? path.slice(0, index) : ''
}

/** パスからファイル名部分を返します。 */
export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** パスから拡張子 .md を取り除きます。 */
export function stripMarkdownExtension(path: string): string {
  return path.replace(/\.md$/i, '')
}

/** 2 つのパスを結合し、`.` と `..` を解決します。ルートより上へ出る場合は null を返します。 */
export function joinPath(base: string, relative: string): string | null {
  const segments = base ? base.split('/') : []
  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  return segments.join('/')
}
