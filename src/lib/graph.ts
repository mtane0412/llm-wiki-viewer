/**
 * Wiki の索引から、グラフ表示用のノードとリンクを作るモジュールです。
 *
 * 目次の index と記録の log は全ページにリンクするハブになり、図が読みにくくなるため除外します。
 * raw/ の元資料もノードに含めません。
 */
import { dirname, pageNameOf } from './path'
import type { WikiIndex } from './wikiIndex'

/** グラフのノードです。 */
export interface GraphNode {
  /** ページのパスです。 */
  id: string
  /** 表示名（ページのタイトル）です。 */
  label: string
  /** 色分けに使うグループ（type、無ければフォルダ名）です。 */
  group: string
  /** リンクの本数（出入りの合計）です。ノードの大きさに使います。 */
  degree: number
}

/** グラフのリンク（無向）です。 */
export interface GraphLink {
  source: string
  target: string
}

/** グラフ全体のデータです。 */
export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

/** グラフから除外するページ（index と log）かを判定します。 */
function isHubPage(path: string): boolean {
  const name = pageNameOf(path)
  return name === 'index' || name === 'log'
}

/**
 * 索引からグラフのデータを作ります。
 *
 * @param index - Wiki の索引
 * @returns ノードとリンク
 */
export function buildGraphData(index: WikiIndex): GraphData {
  const targets = index.pages.filter((page) => page.area === 'wiki' && !isHubPage(page.path))
  const included = new Set(targets.map((page) => page.path))

  const linkKeys = new Set<string>()
  const links: GraphLink[] = []
  for (const page of targets) {
    for (const link of index.outgoing.get(page.path) ?? []) {
      const to = link.resolvedPath
      if (!to || to === page.path || !included.has(to)) continue
      const [source, target] = [page.path, to].sort((a, b) => a.localeCompare(b))
      const key = `${source}\n${target}`
      if (linkKeys.has(key)) continue
      linkKeys.add(key)
      links.push({ source, target })
    }
  }

  const degrees = new Map<string, number>()
  for (const link of links) {
    degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1)
    degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1)
  }

  const nodes = targets.map((page) => {
    const relativeDir = dirname(index.wikiRoot ? page.path.slice(index.wikiRoot.length + 1) : page.path)
    return {
      id: page.path,
      label: page.title,
      group: page.type ?? (relativeDir.split('/')[0] || '(root)'),
      degree: degrees.get(page.path) ?? 0,
    }
  })
  return { nodes, links }
}
