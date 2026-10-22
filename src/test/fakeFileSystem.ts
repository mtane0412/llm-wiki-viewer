/**
 * File System Access API のディレクトリハンドルを模したテスト用の実装です。
 *
 * ブラウザ（jsdom）には showDirectoryPicker が無いため、テストではこの偽物を使います。
 * ファイルの内容と更新時刻を後から書き換えられるので、変更検知のテストにも使えます。
 */

/** 偽のファイルシステムの木構造です。文字列はファイルの内容、オブジェクトはフォルダを表します。 */
export interface FakeTree {
  [name: string]: string | FakeTree
}

/** 偽のファイルシステムの設定です。 */
export interface FakeFileSystemOptions {
  /** 読み取り許可の初期状態です。既定は granted です。 */
  permission?: PermissionState
  /** requestPermission で許可を求められたときの応答です。既定は granted です。 */
  permissionResponse?: PermissionState
}

/** 偽のファイルシステムです。 */
export interface FakeFileSystem {
  /** ルートのディレクトリハンドルです。 */
  root: FileSystemDirectoryHandle
  /** ファイルを書き換え、更新時刻を進めます。 */
  writeFile(path: string, content: string): void
}

/**
 * 木構造から偽のファイルシステムを作ります。
 *
 * @param name - ルートフォルダの名前
 * @param tree - ファイルとフォルダの木構造
 * @param options - 読み取り許可の設定
 * @returns 偽のファイルシステム
 */
export function createFakeFileSystem(name: string, tree: FakeTree, options: FakeFileSystemOptions = {}): FakeFileSystem {
  let permission: PermissionState = options.permission ?? 'granted'
  const files = new Map<string, { content: string; lastModified: number }>()
  let clock = 1000

  const register = (prefix: string, node: FakeTree) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}/${key}` : key
      if (typeof value === 'string') files.set(path, { content: value, lastModified: clock })
      else register(path, value)
    }
  }
  register('', tree)

  const makeFileHandle = (path: string): FileSystemFileHandle =>
    ({
      kind: 'file',
      name: path.split('/').pop(),
      async getFile() {
        const file = files.get(path)
        if (!file) throw new DOMException(`${path} が見つかりません`, 'NotFoundError')
        return new File([file.content], path.split('/').pop() ?? path, { lastModified: file.lastModified })
      },
    }) as unknown as FileSystemFileHandle

  const makeDirectoryHandle = (dirPath: string, dirName: string): FileSystemDirectoryHandle => {
    const children = () => {
      const result = new Map<string, FileSystemHandle>()
      const prefix = dirPath ? `${dirPath}/` : ''
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue
        const [head, ...rest] = path.slice(prefix.length).split('/')
        const childPath = `${prefix}${head}`
        if (!result.has(head)) result.set(head, rest.length === 0 ? makeFileHandle(childPath) : makeDirectoryHandle(childPath, head))
      }
      return result
    }
    return {
      kind: 'directory',
      name: dirName,
      async *values() {
        yield* children().values()
      },
      async getDirectoryHandle(child: string) {
        const handle = children().get(child)
        if (!handle || handle.kind !== 'directory') throw new DOMException(`${child} が見つかりません`, 'NotFoundError')
        return handle
      },
      async getFileHandle(child: string) {
        const handle = children().get(child)
        if (!handle || handle.kind !== 'file') throw new DOMException(`${child} が見つかりません`, 'NotFoundError')
        return handle
      },
    } as unknown as FileSystemDirectoryHandle
  }

  const root = Object.assign(makeDirectoryHandle('', name), {
    async queryPermission() {
      return permission
    },
    async requestPermission() {
      permission = options.permissionResponse ?? 'granted'
      return permission
    },
    async isSameEntry(other: FileSystemHandle) {
      return other === root
    },
  })

  return {
    root,
    writeFile(path, content) {
      clock += 1000
      files.set(path, { content, lastModified: clock })
    },
  }
}
