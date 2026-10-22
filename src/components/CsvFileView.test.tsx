import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { CsvFileView } from './CsvFileView'

/** 意見 CSV です。c1・c2 は給食、c3・c4 は公園の意見で、c5 は全員が賛成する意見です。 */
const commentsCsv = [
  'comment-id,comment-body',
  'c1,給食を無償にしてほしい',
  'c2,給食の量を増やしてほしい',
  'c3,公園を増やしたい',
  'c4,遊具を新しくしてほしい',
  'c5,通学路を安全にしてほしい',
].join('\n')

/** 給食派（p1〜p4）と公園派（p5〜p8）に分かれ、全員が c5 に賛成する投票 CSV です。 */
const votesCsv = [
  'participant,c1,c2,c3,c4,c5',
  'p1,1,1,-1,-1,1',
  'p2,1,1,-1,-1,1',
  'p3,1,1,-1,-1,1',
  'p4,1,1,-1,-1,1',
  'p5,-1,-1,1,1,1',
  'p6,-1,-1,1,1,1',
  'p7,-1,-1,1,1,1',
  'p8,-1,-1,1,1,1',
].join('\n')

/** votesCsv と同じ投票で、参加者に名前を付けた投票 CSV です。給食係の保護者が給食派、公園愛好会の会員が公園派です。 */
const namedVotesCsv = [
  'participant,c1,c2,c3,c4,c5',
  '給食係の保護者1,1,1,-1,-1,1',
  '給食係の保護者2,1,1,-1,-1,1',
  '給食係の保護者3,1,1,-1,-1,1',
  '給食係の保護者4,1,1,-1,-1,1',
  '公園愛好会の会員1,-1,-1,1,1,1',
  '公園愛好会の会員2,-1,-1,1,1,1',
  '公園愛好会の会員3,-1,-1,1,1,1',
  '公園愛好会の会員4,-1,-1,1,1,1',
].join('\n')

/** パスごとの CSV の内容を返す readText のテスト用の実装を作ります。 */
function fakeReadText(files: Record<string, string>) {
  return vi.fn(async (path: string) => {
    const content = files[path]
    if (content === undefined) throw new Error(`ファイルがありません: ${path}`)
    return content
  })
}

/** 指定した CSV を raw/ に持つ Wiki の索引を作ります。 */
function indexWith(paths: string[]) {
  return buildWikiIndex({ markdownFiles: [], unloadedMarkdownPaths: [], assetPaths: paths })
}

describe('CsvFileView', () => {
  it('投票 CSV では、同じフォルダの意見 CSV の本文とともに、意見グループと合意点を表示する', async () => {
    const readText = fakeReadText({ 'raw/survey/votes.csv': votesCsv, 'raw/survey/comments.csv': commentsCsv })
    render(<CsvFileView path="raw/survey/votes.csv" index={indexWith(['raw/survey/votes.csv', 'raw/survey/comments.csv'])} readText={readText} />)

    const consensus = await screen.findByRole('region', { name: /合意点/ })
    expect(within(consensus).getByText('通学路を安全にしてほしい')).toBeInTheDocument()
    expect(within(consensus).queryByText('給食を無償にしてほしい')).toBeNull()
    // 2 つのグループが、それぞれ 4 人の区画として表示されます
    expect(screen.getAllByRole('region', { name: /グループ .（4 人）/ })).toHaveLength(2)
    expect(screen.getByRole('img', { name: /8 人の参加者/ })).toBeInTheDocument()
  })

  it('投票 CSV では、意見グループの区画に、そのグループに入った参加者の名前を並べる', async () => {
    const readText = fakeReadText({ 'raw/survey/votes.csv': namedVotesCsv, 'raw/survey/comments.csv': commentsCsv })
    render(<CsvFileView path="raw/survey/votes.csv" index={indexWith(['raw/survey/votes.csv', 'raw/survey/comments.csv'])} readText={readText} />)

    const groups = await screen.findAllByRole('region', { name: /グループ .（4 人）/ })
    const lunchGroup = groups.find((group) => within(group).queryByText(/給食係の保護者1/))
    // 前提: 給食派の 4 人は同じグループに入ります
    expect(lunchGroup).toBeDefined()
    expect(lunchGroup).toHaveTextContent('参加者: 給食係の保護者1、給食係の保護者2、給食係の保護者3、給食係の保護者4')
    expect(lunchGroup).not.toHaveTextContent('公園愛好会の会員1')
  })

  it('参加者が少ない投票 CSV では、散布図の点の横に参加者の名前を書く', async () => {
    const readText = fakeReadText({ 'raw/survey/votes.csv': namedVotesCsv, 'raw/survey/comments.csv': commentsCsv })
    render(<CsvFileView path="raw/survey/votes.csv" index={indexWith(['raw/survey/votes.csv', 'raw/survey/comments.csv'])} readText={readText} />)

    const plot = await screen.findByRole('img', { name: /8 人の参加者/ })
    // 投票がまったく同じ参加者は同じ位置に重なるため、名前を重ねて書かず、1 か所にまとめて書きます
    expect(within(plot).getByText('給食係の保護者1、給食係の保護者2、給食係の保護者3、給食係の保護者4', { selector: 'text' })).toBeInTheDocument()
    expect(within(plot).getByText('公園愛好会の会員1、公園愛好会の会員2、公園愛好会の会員3、公園愛好会の会員4', { selector: 'text' })).toBeInTheDocument()
    expect(plot.querySelectorAll('text')).toHaveLength(2)
  })

  it('参加者が多い投票 CSV では、名前が重なって読めなくなるため、散布図に名前を書かない', async () => {
    // 31 人の参加者が、給食派と公園派に分かれて投票します
    const manyVotesCsv = [
      'participant,c1,c2,c3,c4,c5',
      ...Array.from({ length: 31 }, (_, index) => (index % 2 === 0 ? `住民${index + 1},1,1,-1,-1,1` : `住民${index + 1},-1,-1,1,1,1`)),
    ].join('\n')
    const readText = fakeReadText({ 'raw/survey/votes.csv': manyVotesCsv, 'raw/survey/comments.csv': commentsCsv })
    render(<CsvFileView path="raw/survey/votes.csv" index={indexWith(['raw/survey/votes.csv', 'raw/survey/comments.csv'])} readText={readText} />)

    const plot = await screen.findByRole('img', { name: /31 人の参加者/ })
    expect(plot.querySelectorAll('text')).toHaveLength(0)
  })

  it('投票 CSV の列名が意見 CSV に無い場合は、列を示してエラーを表示する', async () => {
    const readText = fakeReadText({ 'raw/votes.csv': 'participant,c1,c9\np1,1,1\np2,-1,1', 'raw/comments.csv': 'comment-id,comment-body\nc1,給食を無償にしてほしい' })
    render(<CsvFileView path="raw/votes.csv" index={indexWith(['raw/votes.csv', 'raw/comments.csv'])} readText={readText} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/3 列目.*c9/)
  })

  it('同じフォルダに意見 CSV が無い場合は、その旨を表示する', async () => {
    const readText = fakeReadText({ 'raw/votes.csv': votesCsv })
    render(<CsvFileView path="raw/votes.csv" index={indexWith(['raw/votes.csv'])} readText={readText} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('同じフォルダに意見 CSV')
  })

  it('同じフォルダに意見 CSV が複数ある場合は、どれを使うか選べる', async () => {
    const otherComments = commentsCsv.replace('通学路を安全にしてほしい', '図書館を広くしてほしい')
    const readText = fakeReadText({ 'raw/votes.csv': votesCsv, 'raw/a-comments.csv': commentsCsv, 'raw/b-comments.csv': otherComments })
    render(<CsvFileView path="raw/votes.csv" index={indexWith(['raw/votes.csv', 'raw/a-comments.csv', 'raw/b-comments.csv'])} readText={readText} />)

    // 前提: 既定ではパスの順で先の意見 CSV を使います
    expect(await screen.findByText('通学路を安全にしてほしい')).toBeInTheDocument()
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: '意見 CSV' }), 'raw/b-comments.csv')
    expect(await screen.findByText('図書館を広くしてほしい')).toBeInTheDocument()
  })

  it('同じフォルダに読めない CSV があっても、意見 CSV で集計し、読めなかった CSV を示す', async () => {
    const readText = fakeReadText({ 'raw/votes.csv': votesCsv, 'raw/comments.csv': commentsCsv, 'raw/broken.csv': 'id,body\n1,"閉じ忘れ' })
    render(<CsvFileView path="raw/votes.csv" index={indexWith(['raw/votes.csv', 'raw/comments.csv', 'raw/broken.csv'])} readText={readText} />)
    expect(await screen.findByRole('region', { name: /合意点/ })).toBeInTheDocument()
    expect(screen.getByText(/raw\/broken\.csv/)).toHaveTextContent('2 行目')
  })

  it('意見 CSV では、意見の一覧を表示する', async () => {
    const readText = fakeReadText({ 'raw/comments.csv': commentsCsv })
    render(<CsvFileView path="raw/comments.csv" index={indexWith(['raw/comments.csv'])} readText={readText} />)
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('cell', { name: '公園を増やしたい' })).toBeInTheDocument()
  })

  it('形式の分からない CSV は、表として表示する', async () => {
    const readText = fakeReadText({ 'raw/budget.csv': '年度,予算\n2025,100' })
    render(<CsvFileView path="raw/budget.csv" index={indexWith(['raw/budget.csv'])} readText={readText} />)
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('columnheader', { name: '年度' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: '100' })).toBeInTheDocument()
  })
})
