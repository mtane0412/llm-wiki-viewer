/**
 * File System Access API のディレクトリハンドルから Wiki を読み込む実装です。
 *
 * ハンドルは IndexedDB に保存できるため、次回の起動時に同じフォルダを開き直せます。
 * 読み取りの許可はハンドルの利用前に別途確認する必要があります（vaultRegistry.ts を参照）。
 *
 * raw/ に複製したリポジトリは数万ファイルになることがあるため、`.git` を持つフォルダはたどりません。
 */
import { isIgnoredName, type ListOptions, type SourceEntry, type WikiSource } from './WikiSource'

/** フォルダを再帰的にたどり、ファイルのハンドルをパスとともに返します。 */
async function* walk(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  includeDir: (dirPath: string) => boolean,
): AsyncGenerator<[string, FileSystemFileHandle]> {
  const files: [string, FileSystemFileHandle][] = []
  const directories: [string, FileSystemDirectoryHandle][] = []
  for await (const handle of directory.values()) {
    // ルート以外で .git を持つフォルダは複製したリポジトリなので、フォルダごと除外します
    if (prefix && handle.name === '.git') return
    if (isIgnoredName(handle.name)) continue
    const path = prefix ? `${prefix}/${handle.name}` : handle.name
    if (handle.kind === 'directory') directories.push([path, handle as FileSystemDirectoryHandle])
    else files.push([path, handle as FileSystemFileHandle])
  }
  yield* files
  for (const [path, child] of directories) {
    if (includeDir(path)) yield* walk(child, path, includeDir)
  }
}

/** パスからフォルダのハンドルを取得します。存在しない場合は NotFoundError を投げます。 */
async function getDirectory(root: FileSystemDirectoryHandle, segments: string[]): Promise<FileSystemDirectoryHandle> {
  let directory = root
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment)
  return directory
}

/** パスからファイルのハンドルを取得します。存在しない場合は NotFoundError を投げます。 */
async function getFileHandle(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const segments = path.split('/')
  const fileName = segments.pop()
  if (!fileName) throw new Error(`ファイルのパスが空です: "${path}"`)
  return (await getDirectory(root, segments)).getFileHandle(fileName)
}

/**
 * ディレクトリハンドルから WikiSource を作ります。
 *
 * @param root - ユーザーが選択したフォルダのハンドル
 * @returns WikiSource
 */
export function createFsAccessSource(root: FileSystemDirectoryHandle): WikiSource {
  return {
    name: root.name,
    watchable: true,
    async listFiles(options: ListOptions = {}) {
      const { includeDir = () => true, withMetadata = () => true } = options
      const entries: SourceEntry[] = []
      for await (const [path, handle] of walk(root, '', includeDir)) {
        if (withMetadata(path)) {
          const file = await handle.getFile()
          entries.push({ path, lastModified: file.lastModified, size: file.size })
        } else {
          entries.push({ path, lastModified: null, size: null })
        }
      }
      return entries
    },
    async hasDirectory(path) {
      try {
        await getDirectory(root, path.split('/'))
        return true
      } catch (cause) {
        // 「存在しない」と「フォルダではない」だけを false とし、それ以外のエラーは呼び出し元へ伝えます
        if (cause instanceof DOMException && (cause.name === 'NotFoundError' || cause.name === 'TypeMismatchError')) return false
        throw cause
      }
    },
    async readText(path) {
      return (await (await getFileHandle(root, path)).getFile()).text()
    },
    async readBlob(path) {
      return (await getFileHandle(root, path)).getFile()
    },
  }
}
