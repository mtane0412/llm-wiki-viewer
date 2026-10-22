/**
 * Wiki のページをフォルダ構造で一覧表示するコンポーネントです。
 *
 * LLM が書く wiki 領域と、元資料の raw 領域を分けて表示します。
 * raw/ には数千件の元資料があり得るため、閉じているフォルダの中身は描画しません。
 * raw/ と wiki/ の CSV・JSON ファイルは、開いたときに表・投票の集計・意見クラスタとして表示できるため、Markdown のページと並べて載せます。
 * wiki/ には、LLM が証言などから推定して作った投票 CSV を置くことがあります。
 */
import { useMemo, useState, type ReactNode } from 'react'
import { basename, isCsvPath, isJsonPath } from '../lib/path'
import { formatRoute } from '../lib/route'
import type { WikiIndex, WikiPage } from '../lib/wikiIndex'

/** 一覧に載せる項目（ページ、または CSV・JSON ファイル）です。 */
type TreeEntry = Pick<WikiPage, 'path' | 'title'>

/** フォルダの木構造です。 */
interface TreeFolder {
  name: string
  /** 選択したフォルダからのパスです。 */
  path: string
  folders: Map<string, TreeFolder>
  pages: TreeEntry[]
}

/** ページの一覧から木構造を作ります。prefix はパスの先頭から取り除く部分です。 */
function buildTree(pages: TreeEntry[], prefix: string): TreeFolder {
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

/** 開く画面のある CSV・JSON ファイルを、一覧に載せる項目にします。 */
function dataFileEntries(index: WikiIndex, area: WikiPage['area']): TreeEntry[] {
  const inArea = (path: string) => (area === 'raw' ? path.startsWith('raw/') : !path.startsWith('raw/') && (!index.wikiRoot || path.startsWith(`${index.wikiRoot}/`)))
  return index.assetPaths.filter((path) => inArea(path) && (isCsvPath(path) || isJsonPath(path))).map((path) => ({ path, title: basename(path) }))
}

/** FileTree の引数です。 */
export interface FileTreeProps {
  index: WikiIndex
  vaultId: string
  /** 表示中のページのパスです。 */
  currentPath: string | null
}

/**
 * 開閉できるフォルダです。開いている間だけ中身を描画します。
 * 表示中のページを含む場合は、最初から開き、別のページへ移動して含むようになったときも開きます。
 */
function Collapsible({ label, count, initiallyOpen, className, children }: { label: string; count: number; initiallyOpen: boolean; className?: string; children: () => ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen)
  // 表示中のページがこのフォルダに入ったときに開きます（effect ではなく描画中に前回の値と比べます）
  const [previousInitiallyOpen, setPreviousInitiallyOpen] = useState(initiallyOpen)
  if (initiallyOpen !== previousInitiallyOpen) {
    setPreviousInitiallyOpen(initiallyOpen)
    if (initiallyOpen) setOpen(true)
  }
  return (
    <div className={className}>
      {/*
        details/summary はブラウザ操作エージェントからボタンとして見えないため、aria-expanded つきのボタンにします。
        エージェントの一部は入れ子の要素の文字を名前に使わないため、名前は aria-label で明示します
      */}
      <button type="button" className="tree-toggle" aria-expanded={open} aria-label={`${label}（${count} ページ）`} onClick={() => setOpen(!open)}>
        <span className="tree-folder">{label}</span>
        <span className="tree-count">{count}</span>
      </button>
      {open && children()}
    </div>
  )
}

/** フォルダとその中のページを描画します。 */
function FolderNode({ folder, vaultId, currentPath }: { folder: TreeFolder; vaultId: string; currentPath: string | null }) {
  const folders = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <ul className="tree">
      {folders.map((child) => (
        <li key={child.name}>
          <Collapsible label={child.name} count={countPages(child)} initiallyOpen={currentPath?.startsWith(`${child.path}/`) ?? false}>
            {() => <FolderNode folder={child} vaultId={vaultId} currentPath={currentPath} />}
          </Collapsible>
        </li>
      ))}
      {folder.pages.map((page) => (
        <li key={page.path}>
          <a
            href={formatRoute({ view: 'page', vaultId, path: page.path, heading: undefined })}
            className="tree-page"
            aria-current={page.path === currentPath ? 'page' : undefined}
            // ブラウザ操作エージェントの一部は title 属性を本文より優先して名前にするため、ページのタイトルを明示します
            aria-label={page.title}
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
  const wikiTree = useMemo(() => buildTree([...index.pages.filter((page) => page.area === 'wiki'), ...dataFileEntries(index, 'wiki')], index.wikiRoot), [index])
  const rawTree = useMemo(() => buildTree([...index.pages.filter((page) => page.area === 'raw'), ...dataFileEntries(index, 'raw')], 'raw'), [index])
  const rawCount = countPages(rawTree)

  return (
    <nav className="file-tree" aria-label="ページ一覧">
      <FolderNode folder={wikiTree} vaultId={vaultId} currentPath={currentPath} />
      {rawCount > 0 && (
        <Collapsible className="tree-raw" label="raw（元資料）" count={rawCount} initiallyOpen={currentPath?.startsWith('raw/') ?? false}>
          {() => <FolderNode folder={rawTree} vaultId={vaultId} currentPath={currentPath} />}
        </Collapsible>
      )}
    </nav>
  )
}
