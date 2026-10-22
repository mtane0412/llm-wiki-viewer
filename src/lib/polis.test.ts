import { describe, expect, it } from 'vitest'
import { CsvFormatError } from './csv'
import { analyzeVotes, isVoteTable, parseVoteMatrix } from './polis'

/** 意見の id です。c1・c2 は「給食派」、c3・c4 は「公園派」が賛成し、c5 は全員が賛成する意見です。 */
const commentIds = ['c1', 'c2', 'c3', 'c4', 'c5']

/**
 * 明らかに 2 つのグループに分かれる投票の CSV の行です。
 * 給食派（p1〜p4）は c1・c2 に賛成して c3・c4 に反対し、公園派（p5〜p8）はその逆です。全員が c5 に賛成します。
 */
const twoGroupRows = [
  ['participant', 'c1', 'c2', 'c3', 'c4', 'c5'],
  ['p1', '1', '1', '-1', '-1', '1'],
  ['p2', '1', '1', '-1', '', '1'],
  ['p3', '1', '1', '-1', '-1', '1'],
  ['p4', '1', '0', '-1', '-1', '1'],
  ['p5', '-1', '-1', '1', '1', '1'],
  ['p6', '-1', '-1', '1', '1', '1'],
  ['p7', '', '-1', '1', '1', '1'],
  ['p8', '-1', '-1', '1', '1', '1'],
]

describe('parseVoteMatrix', () => {
  it('参加者 × 意見の賛否を読む（空は 0 として扱う）', () => {
    const matrix = parseVoteMatrix(
      [
        ['participant', 'c1', 'c2'],
        ['p1', '1', ''],
        ['p2', '-1', '0'],
      ],
      ['c1', 'c2'],
    )
    expect(matrix).toEqual({ participants: ['p1', 'p2'], commentIds: ['c1', 'c2'], votes: [[1, 0], [-1, 0]] })
  })

  it('Polis のエクスポートのメタデータ列（group-id・n-votes など）は意見として扱わない', () => {
    const matrix = parseVoteMatrix(
      [
        ['participant', 'xid', 'group-id', 'n-comments', 'n-votes', 'n-agree', 'n-disagree', 'c1'],
        ['p1', '', '0', '0', '1', '1', '0', '1'],
      ],
      ['c1'],
    )
    expect(matrix).toEqual({ participants: ['p1'], commentIds: ['c1'], votes: [[1]] })
  })

  it('意見 CSV に無い列名は、列を示してエラーにする', () => {
    const rows = [['participant', 'c1', '存在しない意見'], ['p1', '1', '1']]
    expect(() => parseVoteMatrix(rows, ['c1'])).toThrow(CsvFormatError)
    expect(() => parseVoteMatrix(rows, ['c1'])).toThrow(/3 列目.*存在しない意見/)
  })

  it('値が 1・-1・0・空以外のセルは、行と列を示してエラーにする', () => {
    const rows = [['participant', 'c1', 'c2'], ['p1', '1', '1'], ['p2', '1', '2']]
    expect(() => parseVoteMatrix(rows, ['c1', 'c2'])).toThrow(/3 行目.*3 列目.*c2/)
  })
})

describe('isVoteTable', () => {
  it('見出し行の 1 列目が participant の CSV を投票 CSV とみなす', () => {
    expect(isVoteTable([['participant', 'c1']])).toBe(true)
    expect(isVoteTable([['comment-id', 'comment-body']])).toBe(false)
  })
})

describe('analyzeVotes', () => {
  const matrix = parseVoteMatrix(twoGroupRows, commentIds)

  it('明らかに 2 つに分かれる投票では、参加者を 2 グループに分ける', () => {
    const result = analyzeVotes(matrix)
    expect(result.groups).toHaveLength(2)
    const members = result.groups.map((group) => [...group.participants].sort())
    expect(members).toContainEqual(['p1', 'p2', 'p3', 'p4'])
    expect(members).toContainEqual(['p5', 'p6', 'p7', 'p8'])
  })

  it('すべてのグループが賛成する意見を合意点として返す', () => {
    const result = analyzeVotes(matrix)
    expect(result.consensus.map((item) => item.commentId)).toEqual(['c5'])
  })

  it('グループごとに、そのグループで特に賛成・反対が多い意見を代表的な意見として返す', () => {
    const result = analyzeVotes(matrix)
    const schoolLunch = result.groups.find((group) => group.participants.includes('p1'))
    // 給食派は c1・c2 に特に賛成し、c3・c4 に特に反対しています
    const agreed = schoolLunch?.representative.filter((item) => item.direction === 'agree').map((item) => item.commentId)
    const disagreed = schoolLunch?.representative.filter((item) => item.direction === 'disagree').map((item) => item.commentId)
    expect(agreed?.sort()).toEqual(['c1', 'c2'])
    expect(disagreed?.sort()).toEqual(['c3', 'c4'])
  })

  it('参加者ごとに 2 次元の座標を返し、同じ入力からは同じ結果を返す', () => {
    const first = analyzeVotes(matrix)
    expect(first.points).toHaveLength(8)
    expect(analyzeVotes(matrix)).toEqual(first)
  })

  it('参加者が 2 人未満の場合はグループに分けられないことをエラーにする', () => {
    const single = parseVoteMatrix([['participant', 'c1'], ['p1', '1']], ['c1'])
    expect(() => analyzeVotes(single)).toThrow(/2 人以上/)
  })
})
