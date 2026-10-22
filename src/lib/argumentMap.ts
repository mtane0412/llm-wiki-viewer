/**
 * 熟議の構造化の手法 IBIS（論点 → 立場 → 賛否の論拠）で書かれたページから、論点マップと Lint の指摘を作るモジュールです。
 *
 * スキーマ:
 * - `type: issue` 論点（問い）
 * - `type: position` と `issue: "[[論点]]"` 論点に対する立場
 * - `type: argument` と `supports: ["[[立場]]"]` または `opposes: ["[[立場]]"]`、`sources` 立場を支える・崩す論拠
 *
 * `issue` / `supports` / `opposes` は、ほかのスキーマで別の意味に使われることがあるため、
 * type が position（issue）・argument（supports・opposes）のページに書かれたものだけを関係として扱います。
 */
import { parseLinkTargets } from './frontmatterValues'
import type { Resolver } from './resolver'
import type { LintIssue, WikiPage } from './wikiIndex'

/** IBIS の関係を書く frontmatter の項目です。 */
export type RelationKey = 'issue' | 'supports' | 'opposes'

/** ページの type ごとの、関係を書く項目と、そのリンク先に期待する type です。 */
const RELATION_RULES: Partial<Record<string, { key: RelationKey; targetType: string }[]>> = {
  position: [{ key: 'issue', targetType: 'issue' }],
  argument: [
    { key: 'supports', targetType: 'position' },
    { key: 'opposes', targetType: 'position' },
  ],
}

/** ページの frontmatter に書かれた IBIS の関係 1 つと、そのリンク先の解決結果です。 */
export interface ResolvedRelation {
  key: RelationKey
  /** frontmatter に書かれたリンク先の文字列です。 */
  target: string
  /** 解決したリンク先のパスです。解決できなければ null です。 */
  resolvedPath: string | null
  /** リンク先が期待する type のページかどうかです。 */
  valid: boolean
  /** リンク先の type です。リンク先が無ければ null、type が無ければ undefined です。 */
  actualType: string | null | undefined
}

/**
 * ページの frontmatter から IBIS の関係を取り出し、リンク先を解決します。
 *
 * @param page - wiki のページ
 * @param resolve - wikilink のリゾルバ
 * @param pageByPath - パスからページを引く表（リンク先の type の確認に使います）
 * @returns 関係の一覧。type が position・argument でないページでは空です
 */
export function resolveRelations(page: WikiPage, resolve: Resolver, pageByPath: Map<string, WikiPage>): ResolvedRelation[] {
  if (page.area !== 'wiki') return []
  const rules = RELATION_RULES[page.type ?? ''] ?? []
  return rules.flatMap(({ key, targetType }) =>
    parseLinkTargets(page.frontmatter[key]).map((target) => {
      const resolvedPath = resolve(target, page.path)
      const actualType = resolvedPath === null ? null : pageByPath.get(resolvedPath)?.type
      return { key, target, resolvedPath, valid: actualType === targetType, actualType }
    }),
  )
}

/** 論点マップの立場 1 つと、それを支える・崩す論拠です。 */
export interface PositionNode {
  path: string
  /** 立場を支える論拠のパスです。 */
  supports: string[]
  /** 立場を崩す論拠のパスです。 */
  opposes: string[]
}

/** 論点マップの論点 1 つと、それに対する立場です。 */
export interface IssueNode {
  path: string
  positions: PositionNode[]
}

/** 論点マップを作るために必要な索引の情報です。 */
export interface ArgumentMapSource {
  /** パスの順に並べたページです。 */
  pages: WikiPage[]
  pageByPath: Map<string, WikiPage>
  resolve: Resolver
}

/** 配列の値に要素を追加します（同じ要素は重ねて追加しません）。 */
function pushUnique(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key) ?? []
  if (!list.includes(value)) list.push(value)
  map.set(key, list)
}

/**
 * 論点ごとに、立場と賛成・反対の論拠の木を組み立てます。
 *
 * リンク先が無い関係と、リンク先の type が合わない関係は木に含めません（Lint で指摘します）。
 *
 * @param index - Wiki の索引
 * @returns パスの順に並べた論点。立場・論拠もパスの順です
 */
export function buildArgumentMap(index: ArgumentMapSource): IssueNode[] {
  const positionsByIssue = new Map<string, string[]>()
  const supportsByPosition = new Map<string, string[]>()
  const opposesByPosition = new Map<string, string[]>()
  for (const page of index.pages) {
    for (const relation of resolveRelations(page, index.resolve, index.pageByPath)) {
      if (!relation.valid || relation.resolvedPath === null) continue
      const map = relation.key === 'issue' ? positionsByIssue : relation.key === 'supports' ? supportsByPosition : opposesByPosition
      pushUnique(map, relation.resolvedPath, page.path)
    }
  }
  return index.pages
    .filter((page) => page.area === 'wiki' && page.type === 'issue')
    .map((issue) => ({
      path: issue.path,
      positions: (positionsByIssue.get(issue.path) ?? []).map((path) => ({
        path,
        supports: supportsByPosition.get(path) ?? [],
        opposes: opposesByPosition.get(path) ?? [],
      })),
    }))
}

/**
 * 論点マップに関する Lint の指摘を返します。
 *
 * - リンク先が無い、または type が合わない issue・supports・opposes
 * - issue の無い立場、supports・opposes のどちらも無い論拠
 * - 賛成と反対の論拠の片方にしか論拠が無い立場（議論の偏り。論拠がまだ 1 つも無い立場は除きます）
 * - sources の無い論拠
 *
 * @param index - Wiki の索引
 * @returns ページのパスの順に並べた指摘
 */
export function argumentLintIssues(index: ArgumentMapSource): LintIssue[] {
  const issues: LintIssue[] = []
  for (const page of index.pages) {
    if (page.area !== 'wiki') continue
    const relations = resolveRelations(page, index.resolve, index.pageByPath)
    if (page.type === 'position' && !relations.some((relation) => relation.key === 'issue')) {
      issues.push({ kind: 'missing-relation', page: page.path, key: 'issue' })
    }
    if (page.type === 'argument' && relations.length === 0) {
      issues.push({ kind: 'missing-relation', page: page.path, key: 'supports-or-opposes' })
    }
    for (const relation of relations) {
      if (!relation.valid) issues.push({ kind: 'invalid-relation', page: page.path, key: relation.key, target: relation.target, actualType: relation.actualType })
    }
    if (page.type === 'argument' && page.sources.length === 0) issues.push({ kind: 'unsourced-argument', page: page.path })
  }

  for (const issue of buildArgumentMap(index)) {
    for (const position of issue.positions) {
      const hasSupports = position.supports.length > 0
      const hasOpposes = position.opposes.length > 0
      if (hasSupports !== hasOpposes) issues.push({ kind: 'one-sided-position', page: position.path, missing: hasSupports ? 'opposes' : 'supports' })
    }
  }
  return issues.sort((a, b) => a.page.localeCompare(b.page))
}

/** ページが論拠（type: argument）かを判定します。論拠の sources の欠けは「sources 未記載」ではなく論点マップの指摘として扱います。 */
export function isArgumentPage(page: WikiPage): boolean {
  return page.area === 'wiki' && page.type === 'argument'
}
