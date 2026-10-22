import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { LintView } from './LintView'

/** 未作成のページ「RAG」へ 2 ページから、「ベクトル DB」へ 1 ページからリンクしている Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/index.md', content: '- [[concepts/agent]]\n- [[RAG]]' },
    { path: 'wiki/concepts/agent.md', content: '---\ntitle: エージェント\n---\n[[RAG]] と [[ベクトル DB]] を使う。' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

describe('LintView の未作成ページ（赤リンク）', () => {
  it('未作成のリンク先を参照数の多い順に、参照数とともに表示する', () => {
    render(<LintView index={index} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /未作成ページ/ })
    expect(within(section).getAllByRole('code').map((target) => target.textContent)).toEqual(['RAG', 'ベクトル DB'])
    // 参照数は、リンク先の文字列と同じ項目の中に表示します
    expect(within(section).getAllByRole('code')[0].closest('li')).toHaveTextContent('2 ページ')
    expect(within(section).getAllByRole('code')[1].closest('li')).toHaveTextContent('1 ページ')
  })

  it('各リンク先から参照元のページへ移動できる', () => {
    render(<LintView index={index} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /未作成ページ/ })
    expect(within(section).getAllByRole('link', { name: 'エージェント' })[0]).toHaveAttribute('href', '#/v1/page/wiki/concepts/agent.md')
    expect(within(section).getByRole('link', { name: 'index' })).toHaveAttribute('href', '#/v1/page/wiki/index.md')
  })
})

describe('LintView の index.md 未掲載', () => {
  it('index.md からリンクされていないページを表示する', () => {
    render(<LintView index={index} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /index\.md 未掲載/ })
    // 前提: index.md は agent にリンクしているため、未掲載のページはありません
    expect(within(section).getByText('指摘はありません。')).toBeInTheDocument()
  })

  it('index.md が無い Wiki では、判定できないことを明示する', () => {
    const noIndex = buildWikiIndex({
      markdownFiles: [{ path: 'wiki/concepts/agent.md', content: '---\ntitle: エージェント\n---\n本文' }],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    render(<LintView index={noIndex} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /index\.md 未掲載/ })
    expect(within(section).getByText(/index\.md が見つからないため、判定していません/)).toBeInTheDocument()
    expect(within(section).queryByText('指摘はありません。')).toBeNull()
    // 判定していない区画では、件数を 0 と表示しません
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('index.md 未掲載 —')
  })

  it('未掲載のページへ移動できる', () => {
    const partial = buildWikiIndex({
      markdownFiles: [
        { path: 'wiki/index.md', content: '[[concepts/agent]]' },
        { path: 'wiki/concepts/agent.md', content: '[[concepts/memory]]' },
        { path: 'wiki/overview.md', content: '[[concepts/memory]]' },
        { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\n---\n本文' },
      ],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    render(<LintView index={partial} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /index\.md 未掲載/ })
    expect(within(section).getByRole('link', { name: '記憶' })).toHaveAttribute('href', '#/v1/page/wiki/concepts/memory.md')
  })
})

describe('LintView の frontmatter の必須項目と type', () => {
  /** スキーマの frontmatter の例に title・type・updated があり、type の選択肢が concept・source の Wiki です。 */
  const checked = buildWikiIndex({
    markdownFiles: [
      { path: 'CLAUDE.md', content: '```yaml\n---\ntitle: 例\ntype: concept | source\nupdated: YYYY-MM-DD\n---\n```' },
      { path: 'wiki/index.md', content: '[[concepts/no-updated]] [[concepts/typo]]' },
      { path: 'wiki/concepts/no-updated.md', content: '---\ntitle: 更新日なし\ntype: concept\n---\n本文' },
      { path: 'wiki/concepts/typo.md', content: '---\ntitle: 誤記\ntype: concpet\nupdated: 2026-10-20\n---\n本文' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: [],
  })

  it('必須項目が欠けたページを、欠けた項目とともに表示する', () => {
    render(<LintView index={checked} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /必須項目の欠け/ })
    expect(within(section).getByRole('link', { name: '更新日なし' })).toBeInTheDocument()
    expect(within(section).getByText('updated')).toBeInTheDocument()
  })

  it('type の値が選択肢に無いページを、その値とともに表示し、選択肢も示す', () => {
    render(<LintView index={checked} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /type の値の誤り/ })
    expect(within(section).getByRole('link', { name: '誤記' })).toBeInTheDocument()
    expect(within(section).getByText('concpet')).toBeInTheDocument()
    expect(section).toHaveTextContent('concept・source')
  })

  it('スキーマが無い Wiki では、判定していないことと理由を表示する', () => {
    const withoutSchema = buildWikiIndex({ markdownFiles: [{ path: 'wiki/a.md', content: '本文' }], unloadedMarkdownPaths: [], assetPaths: [] })
    render(<LintView index={withoutSchema} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /必須項目の欠け/ })
    expect(within(section).getByText(/CLAUDE.md）を読み込んでいないため、判定していません/)).toBeInTheDocument()
  })
})

describe('LintView の取り込まれていない元資料', () => {
  // 前提: raw/ の元資料のうち、パブコメ要約.md だけが wiki ページの sources から参照されています
  const withRaw = buildWikiIndex({
    markdownFiles: [
      { path: 'wiki/index.md', content: '---\ntitle: 目次\nsources: ["[[raw/パブコメ要約]]"]\n---\n本文' },
      { path: 'raw/パブコメ要約.md', content: '要約' },
      { path: 'raw/未読の意見書.md', content: '意見' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: ['raw/アンケート.csv'],
  })

  it('wiki ページから参照されていない元資料を表示し、Markdown の元資料へは移動できる', () => {
    render(<LintView index={withRaw} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /取り込まれていない元資料/ })
    expect(within(section).getByRole('link', { name: '未読の意見書' })).toHaveAttribute('href', `#/v1/page/${encodeURI('raw/未読の意見書.md')}`)
    expect(within(section).queryByText('raw/パブコメ要約.md')).not.toBeInTheDocument()
  })

  it('Markdown 以外の元資料は、開く画面が無いためリンクにせずパスだけを表示する', () => {
    render(<LintView index={withRaw} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /取り込まれていない元資料/ })
    const csvItem = within(section).getByText('raw/アンケート.csv').closest('li')
    if (!csvItem) throw new Error('アンケート.csv の項目が見つかりません')
    expect(within(csvItem).queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('LintView の論点マップの指摘', () => {
  /** 関係のリンク先の誤り・欠け、偏りのある立場、sources の無い論拠を 1 つずつ含む Wiki です。 */
  const argumentIndex = buildWikiIndex({
    markdownFiles: [
      { path: 'wiki/論点.md', content: '---\ntitle: 給食を無償化すべきか\ntype: issue\n---\n本文' },
      { path: 'wiki/概念.md', content: '---\ntitle: 学校給食\ntype: concept\nsources: ["[[論点]]"]\n---\n本文' },
      { path: 'wiki/賛成.md', content: '---\ntitle: 無償化に賛成\ntype: position\nissue: "[[論点]]"\n---\n本文' },
      { path: 'wiki/誤った立場.md', content: '---\ntitle: 誤った立場\ntype: position\nissue: "[[概念]]"\n---\n本文' },
      { path: 'wiki/宙に浮いた論拠.md', content: '---\ntitle: 宙に浮いた論拠\ntype: argument\nsources: ["[[論点]]"]\n---\n本文' },
      { path: 'wiki/負担軽減.md', content: '---\ntitle: 負担が減る\ntype: argument\nsupports: "[[賛成]]"\n---\n本文' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: [],
  })

  it('リンク先の type が合わない関係を、項目・リンク先・実際の type とともに表示する', () => {
    render(<LintView index={argumentIndex} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /論点マップの関係の誤り/ })
    const item = within(section).getByRole('link', { name: '誤った立場' }).closest('li')
    expect(item).toHaveTextContent('issue')
    expect(item).toHaveTextContent('概念')
    expect(item).toHaveTextContent('concept')
  })

  it('関係の無い論拠を、欠けた項目とともに表示する', () => {
    render(<LintView index={argumentIndex} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /論点マップの関係の欠け/ })
    expect(within(section).getByRole('link', { name: '宙に浮いた論拠' }).closest('li')).toHaveTextContent('supports・opposes')
  })

  it('片方の論拠しか無い立場を、欠けている側とともに表示する', () => {
    render(<LintView index={argumentIndex} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /議論の偏り/ })
    expect(within(section).getByRole('link', { name: '無償化に賛成' }).closest('li')).toHaveTextContent('反対の論拠が無い')
  })

  it('sources の無い論拠を表示する', () => {
    render(<LintView index={argumentIndex} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /sources の無い論拠/ })
    expect(within(section).getByRole('link', { name: '負担が減る' })).toHaveAttribute('href', `#/v1/page/wiki/${encodeURIComponent('負担軽減')}.md`)
  })
})
