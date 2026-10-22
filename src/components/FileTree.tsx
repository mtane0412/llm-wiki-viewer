/**
 * Wiki のページをフォルダ構造で一覧表示するコンポーネントです。
 *
 * LLM が書く wiki 領域と、元資料の raw 領域を分けて表示します。
 */
import { useMemo } from 'react'
import { formatRoute } from '../lib/route'
import type { WikiIndex, WikiPage } from '../lib/wikiIndex'

/** フォルダの木構造です。 */
interface TreeFolder {
  name: string
  /** 選択したフォルダからのパスです。 */
  path: string
  folders: Map<string, TreeFolder>
  pages: WikiPage[]
}

/** ページの一覧から木構造を作ります。prefix はパスの先頭から取り除く部分です。 */
function buildTree(pages: WikiPage[], prefix: string): TreeFolder {
  const root: TreeFolder = { name: '', path: prefix, folders: new Map(), pages: [] }
  for (const page of pages) {
    const relative = prefix && page.path.startsWith(`${prefix}/`) ? page.path.slice(prefix.length + 1) : page.path
    const segments = relative.split('/').slice(0, -1)
    let folder = root
    for (const segment of segments) {
      let child = folder.folders.get(segment)
      if (!child) {
        child = { name: segment, path: folder.path ? `${folder.path}/${segment}` : segment, folders: new Map(), pages: [] }
        folder.folders.set(segment, child)
      }
      folder = child
    }
    folder.pages.push(page)
  }
  return root
}

/** フォルダ内のページ数（サブフォルダを含む）を数えます。 */
function countPages(folder: TreeFolder): number {
  let count = folder.pages.length
  for (const child of folder.folders.values()) count += countPages(child)
  return count
}

/** FileTree の引数です。 */
export interface FileTreeProps {
  index: WikiIndex
  vaultId: string
  /** 表示中のページのパスです。 */
  currentPath: string | null
}

/** フォルダとその中のページを描画します。 */
function FolderNode({ folder, vaultId, currentPath, defaultOpen }: { folder: TreeFolder; vaultId: string; currentPath: string | null; defaultOpen: boolean }) {
  const folders = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <ul className="tree">
      {folders.map((child) => {
        const containsCurrent = currentPath?.startsWith(`${child.path}/`) ?? false
        return (
          <li key={child.name}>
            <details open={defaultOpen || containsCurrent}>
              <summary>
                <span className="tree-folder">{child.name}</span>
                <span className="tree-count">{countPages(child)}</span>
              </summary>
              <FolderNode folder={child} vaultId={vaultId} currentPath={currentPath} defaultOpen={false} />
            </details>
          </li>
        )
      })}
      {folder.pages.map((page) => (
        <li key={page.path}>
          <a
            href={formatRoute({ view: 'page', vaultId, path: page.path, heading: undefined })}
            className="tree-page"
            aria-current={page.path === currentPath ? 'page' : undefined}
            title={page.path}
          >
            {page.title}
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Wiki のページの一覧です。 */
export function FileTree({ index, vaultId, currentPath }: FileTreeProps) {
  const wikiTree = useMemo(() => buildTree(index.pages.filter((page) => page.area === 'wiki'), index.wikiRoot), [index])
  const rawTree = useMemo(() => buildTree(index.pages.filter((page) => page.area === 'raw'), 'raw'), [index])
  const rawCount = countPages(rawTree)

  return (
    <nav className="file-tree" aria-label="ページ一覧">
      <FolderNode folder={wikiTree} vaultId={vaultId} currentPath={currentPath} defaultOpen={false} />
      {rawCount > 0 && (
        <details className="tree-raw">
          <summary>
            <span className="tree-folder">raw（元資料）</span>
            <span className="tree-count">{rawCount}</span>
          </summary>
          <FolderNode folder={rawTree} vaultId={vaultId} currentPath={currentPath} defaultOpen={false} />
        </details>
      )}
    </nav>
  )
}
