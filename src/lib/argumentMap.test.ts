import { describe, expect, it } from 'vitest'
import { buildArgumentMap } from './argumentMap'
import { buildWikiIndex, type LintIssue } from './wikiIndex'

/** frontmatter つきの Markdown を組み立てるテスト用ヘルパーです。 */
function page(frontmatter: string, body = '本文'): string {
  return `---\n${frontmatter}\n---\n${body}`
}

/** 論点「給食の無償化」に、立場が 2 つ、論拠が 3 つある Wiki です。 */
const files = [
  { path: 'wiki/issues/給食の無償化.md', content: page('title: 給食を無償化すべきか\ntype: issue') },
  { path: 'wiki/positions/無償化に賛成.md', content: page('title: 無償化に賛成\ntype: position\nissue: "[[給食の無償化]]"') },
  { path: 'wiki/positions/所得制限を設ける.md', content: page('title: 所得制限を設ける\ntype: position\nissue: "[[給食の無償化]]"') },
  {
    path: 'wiki/arguments/子育て世帯の負担軽減.md',
    content: page('title: 子育て世帯の負担が減る\ntype: argument\nsupports: ["[[無償化に賛成]]"]\nsources: ["[[sources/市の調査]]"]'),
  },
  {
    path: 'wiki/arguments/財源の不足.md',
    content: page('title: 財源が足りない\ntype: argument\nopposes: ["[[無償化に賛成]]"]\nsupports: ["[[所得制限を設ける]]"]\nsources: ["[[sources/市の調査]]"]'),
  },
  { path: 'wiki/sources/市の調査.md', content: page('title: 市の調査\ntype: source') },
]

/** テスト用の Wiki の索引を作ります。 */
function indexOf(markdownFiles: { path: string; content: string }[]) {
  return buildWikiIndex({ markdownFiles, unloadedMarkdownPaths: [], assetPaths: [] })
}

/** 論点マップに関する Lint の指摘だけを取り出します。 */
function argumentIssues(issues: LintIssue[]): LintIssue[] {
  return issues.filter((issue) => ['invalid-relation', 'missing-relation', 'one-sided-position', 'unsourced-argument'].includes(issue.kind))
}

describe('buildArgumentMap', () => {
  it('論点ごとに、立場と賛成・反対の論拠の木を組み立てる', () => {
    const map = buildArgumentMap(indexOf(files))
    expect(map).toEqual([
      {
        path: 'wiki/issues/給食の無償化.md',
        positions: [
          { path: 'wiki/positions/所得制限を設ける.md', supports: ['wiki/arguments/財源の不足.md'], opposes: [] },
          { path: 'wiki/positions/無償化に賛成.md', supports: ['wiki/arguments/子育て世帯の負担軽減.md'], opposes: ['wiki/arguments/財源の不足.md'] },
        ],
      },
    ])
  })

  it('立場の無い論点も、空の木として一覧に載せる', () => {
    const map = buildArgumentMap(indexOf([{ path: 'wiki/まだ議論の無い論点.md', content: page('type: issue') }]))
    expect(map).toEqual([{ path: 'wiki/まだ議論の無い論点.md', positions: [] }])
  })

  it('type が合わないリンク先は木に含めない', () => {
    const map = buildArgumentMap(
      indexOf([
        { path: 'wiki/概念.md', content: page('type: concept') },
        { path: 'wiki/立場.md', content: page('type: position\nissue: "[[概念]]"') },
      ]),
    )
    expect(map).toEqual([])
  })

  it('type が position・argument でないページの issue・supports は関係として扱わない', () => {
    const map = buildArgumentMap(
      indexOf([
        { path: 'wiki/論点.md', content: page('type: issue') },
        { path: 'wiki/概念.md', content: page('type: concept\nissue: "[[論点]]"') },
      ]),
    )
    expect(map).toEqual([{ path: 'wiki/論点.md', positions: [] }])
  })
})

describe('論点マップの Lint', () => {
  it('スキーマに沿った Wiki では、偏りのある立場だけを指摘する', () => {
    // 前提: 「所得制限を設ける」は賛成の論拠しか無く、「無償化に賛成」は両方あります
    expect(argumentIssues(indexOf(files).issues)).toEqual([
      { kind: 'one-sided-position', page: 'wiki/positions/所得制限を設ける.md', missing: 'opposes' },
    ])
  })

  it('リンク先が無い issue・supports・opposes を指摘する', () => {
    const issues = argumentIssues(
      indexOf([
        { path: 'wiki/立場.md', content: page('type: position\nissue: "[[存在しない論点]]"') },
        { path: 'wiki/論拠.md', content: page('type: argument\nopposes: ["[[存在しない立場]]"]\nsources: ["[[資料]]"]') },
        { path: 'wiki/資料.md', content: page('type: source') },
      ]).issues,
    )
    expect(issues).toEqual([
      { kind: 'invalid-relation', page: 'wiki/立場.md', key: 'issue', target: '存在しない論点', actualType: null },
      { kind: 'invalid-relation', page: 'wiki/論拠.md', key: 'opposes', target: '存在しない立場', actualType: null },
    ])
  })

  it('リンク先が無い関係は、壊れたリンクとして二重に指摘しない', () => {
    const index = indexOf([{ path: 'wiki/立場.md', content: page('type: position\nissue: "[[存在しない論点]]"') }])
    expect(index.issues.filter((issue) => issue.kind === 'broken-link')).toEqual([])
  })

  it('リンク先の type が合わない関係を、実際の type とともに指摘する', () => {
    const issues = argumentIssues(
      indexOf([
        { path: 'wiki/概念.md', content: page('type: concept') },
        { path: 'wiki/型の無いページ.md', content: page('title: 型の無いページ') },
        { path: 'wiki/立場.md', content: page('type: position\nissue: "[[概念]]"') },
        { path: 'wiki/論拠.md', content: page('type: argument\nsupports: "[[型の無いページ]]"\nsources: ["[[概念]]"]') },
      ]).issues,
    )
    expect(issues).toEqual([
      { kind: 'invalid-relation', page: 'wiki/立場.md', key: 'issue', target: '概念', actualType: 'concept' },
      { kind: 'invalid-relation', page: 'wiki/論拠.md', key: 'supports', target: '型の無いページ', actualType: undefined },
    ])
  })

  it('issue の無い立場と、supports・opposes の無い論拠を指摘する', () => {
    const issues = argumentIssues(
      indexOf([
        { path: 'wiki/宙に浮いた立場.md', content: page('type: position') },
        { path: 'wiki/宙に浮いた論拠.md', content: page('type: argument\nsources: ["[[宙に浮いた立場]]"]') },
      ]).issues,
    )
    expect(issues).toEqual([
      { kind: 'missing-relation', page: 'wiki/宙に浮いた立場.md', key: 'issue' },
      { kind: 'missing-relation', page: 'wiki/宙に浮いた論拠.md', key: 'supports-or-opposes' },
    ])
  })

  it('反対の論拠しか無い立場を、賛成の論拠が無いと指摘する', () => {
    const issues = argumentIssues(
      indexOf([
        { path: 'wiki/論点.md', content: page('type: issue') },
        { path: 'wiki/立場.md', content: page('type: position\nissue: "[[論点]]"') },
        { path: 'wiki/論拠.md', content: page('type: argument\nopposes: "[[立場]]"\nsources: ["[[論点]]"]') },
      ]).issues,
    )
    expect(issues).toEqual([{ kind: 'one-sided-position', page: 'wiki/立場.md', missing: 'supports' }])
  })

  it('論拠がまだ 1 つも無い立場は、偏りとしては指摘しない', () => {
    const issues = argumentIssues(
      indexOf([
        { path: 'wiki/論点.md', content: page('type: issue') },
        { path: 'wiki/立場.md', content: page('type: position\nissue: "[[論点]]"') },
      ]).issues,
    )
    expect(issues).toEqual([])
  })

  it('sources の無い論拠を、sources 未記載ではなく論拠の指摘として扱う', () => {
    const index = indexOf([
      { path: 'wiki/論点.md', content: page('type: issue') },
      { path: 'wiki/立場.md', content: page('type: position\nissue: "[[論点]]"') },
      { path: 'wiki/賛成.md', content: page('type: argument\nsupports: "[[立場]]"') },
      { path: 'wiki/反対.md', content: page('type: argument\nopposes: "[[立場]]"\nsources: ["[[論点]]"]') },
    ])
    expect(argumentIssues(index.issues)).toEqual([{ kind: 'unsourced-argument', page: 'wiki/賛成.md' }])
    expect(index.issues).not.toContainEqual({ kind: 'missing-sources', page: 'wiki/賛成.md' })
  })

  it('立場や論拠の frontmatter から参照されている論点・立場は、孤立ページとみなさない', () => {
    const index = indexOf(files)
    expect(index.issues).not.toContainEqual({ kind: 'orphan', page: 'wiki/issues/給食の無償化.md' })
    expect(index.issues).not.toContainEqual({ kind: 'orphan', page: 'wiki/positions/無償化に賛成.md' })
  })
})
