/**
 * `<input type="file" webkitdirectory>` で選んだファイル一覧から Wiki を読み込む実装です。
 *
 * File System Access API が無いブラウザ（Safari・Firefox）向けのフォールバックです。
 * 選択した時点のスナップショットなので、ファイルの変更は検知できません。
 */
import { isIgnoredName, type ListOptions, type SourceEntry, type WikiSource } from './WikiSource'

/** パスの祖先フォルダのパスを、浅い順に返します（`a/b/c.md` → `a`, `a/b`）。 */
function ancestorsOf(path: string): string[] {
  const segments = path.split('/').slice(0, -1)
  return segments.map((_, position) => segments.slice(0, position + 1).join('/'))
}

/**
 * ファイル一覧から WikiSource を作ります。
 *
 * @param files - webkitRelativePath を持つファイルの一覧
 * @returns WikiSource
 * @throws ファイルが 1 つも無い場合
 */
export function createFileListSource(files: File[]): WikiSource {
  if (files.length === 0) throw new Error('フォルダにファイルが 1 つもありません')

  const rootName = (files[0].webkitRelativePath || files[0].name).split('/')[0]
  // webkitRelativePath は「選択したフォルダ名/…」の形なので、先頭のフォルダ名を除きます
  const relativeFiles = files.map((file) => [(file.webkitRelativePath || file.name).split('/').slice(1).join('/'), file] as const)

  // .git を持つフォルダ（raw/ に複製したリポジトリ）を集めます
  const nestedRepositories = new Set<string>()
  for (const [path] of relativeFiles) {
    const segments = path.split('/')
    const gitIndex = segments.indexOf('.git')
    if (gitIndex > 0) nestedRepositories.add(segments.slice(0, gitIndex).join('/'))
  }

  const fileByPath = new Map<string, File>()
  for (const [path, file] of relativeFiles) {
    if (!path || path.split('/').some(isIgnoredName)) continue
    if (ancestorsOf(path).some((ancestor) => nestedRepositories.has(ancestor))) continue
    fileByPath.set(path, file)
  }

  const getFile = (path: string): File => {
    const file = fileByPath.get(path)
    if (!file) throw new Error(`ファイルが見つかりません: ${path}`)
    return file
  }

  return {
    name: rootName,
    watchable: false,
    async listFiles(options: ListOptions = {}) {
      const { includeDir = () => true } = options
      return [...fileByPath]
        .filter(([path]) => ancestorsOf(path).every(includeDir))
        .map(([path, file]): SourceEntry => ({ path, lastModified: file.lastModified, size: file.size }))
    },
    async hasDirectory(path) {
      return [...fileByPath.keys()].some((filePath) => filePath.startsWith(`${path}/`))
    },
    async readText(path) {
      return getFile(path).text()
    },
    async readBlob(path) {
      return getFile(path)
    },
  }
}
