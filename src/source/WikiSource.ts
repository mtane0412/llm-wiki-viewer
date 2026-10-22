/**
 * Wiki のファイルを読み込む手段を抽象化したインターフェースです。
 *
 * 現在は次の 2 つの実装があります。
 * - File System Access API（Chromium 系ブラウザ。変更の監視と再接続ができる）
 * - `<input webkitdirectory>` で選んだファイル一覧（全ブラウザ。読み込んだ時点のスナップショット）
 * 将来、ローカルサーバー経由の実装を追加する場合も、このインターフェースを実装します。
 */

/** ファイル一覧の 1 件です。 */
export interface SourceEntry {
  /** 選択したフォルダからの相対パス（`/` 区切り）です。 */
  path: string
  /** 最終更新時刻（ミリ秒）です。withMetadata で取得しなかった場合は null です。 */
  lastModified: number | null
  /** ファイルサイズ（バイト）です。withMetadata で取得しなかった場合は null です。 */
  size: number | null
}

/** ファイルの列挙の設定です。 */
export interface ListOptions {
  /** たどるフォルダを選びます（引数はフォルダのパス）。既定ではすべてたどります。 */
  includeDir?: (dirPath: string) => boolean
  /**
   * 更新時刻とサイズを取得するファイルを選びます（引数はファイルのパス）。既定ではすべて取得します。
   * File System Access API では取得のたびにファイルを開くため、大量の元資料では取得を省きます。
   */
  withMetadata?: (filePath: string) => boolean
}

/** Wiki のファイルを読み込む手段です。 */
export interface WikiSource {
  /** Wiki の名前（選択したフォルダ名）です。 */
  readonly name: string
  /** listFiles を繰り返し呼んで、ファイルの変更を検知できるかどうかです。 */
  readonly watchable: boolean
  /** ファイルを列挙します。隠しフォルダ・node_modules・.git を持つ複製リポジトリは除きます。 */
  listFiles(options?: ListOptions): Promise<SourceEntry[]>
  /** フォルダが存在するかを調べます。 */
  hasDirectory(path: string): Promise<boolean>
  /** ファイルをテキストとして読みます。 */
  readText(path: string): Promise<string>
  /** ファイルをバイナリとして読みます。 */
  readBlob(path: string): Promise<Blob>
}

/**
 * 列挙から除外するフォルダ・ファイル名かを判定します（`.git`・`.obsidian` などの隠しフォルダと node_modules）。
 * なお、`.git` を持つフォルダ（raw/ に複製したリポジトリ）は、各実装でフォルダごと除外します。
 */
export function isIgnoredName(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules'
}
