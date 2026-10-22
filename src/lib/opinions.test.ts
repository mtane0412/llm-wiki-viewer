import { describe, expect, it } from 'vitest'
import { CsvFormatError } from './csv'
import { isCommentTable, parseCommentTable } from './opinions'

describe('parseCommentTable', () => {
  it('comment-id と comment-body の列から意見を読み、ほかの列は属性として保持する', () => {
    const rows = [
      ['comment-id', 'comment-body', '年代'],
      ['c1', '給食を無償にしてほしい', '30代'],
      ['c2', '公園を増やしたい', '40代'],
    ]
    expect(parseCommentTable(rows)).toEqual([
      { id: 'c1', body: '給食を無償にしてほしい', attributes: { 年代: '30代' } },
      { id: 'c2', body: '公園を増やしたい', attributes: { 年代: '40代' } },
    ])
  })

  it('列の順番が違っても読める', () => {
    expect(parseCommentTable([['comment-body', 'comment-id'], ['公園を増やしたい', 'c2']])).toEqual([{ id: 'c2', body: '公園を増やしたい', attributes: {} }])
  })

  it('comment-id または comment-body の列が無い場合はエラーにする', () => {
    expect(() => parseCommentTable([['id', 'comment-body'], ['1', '意見']])).toThrow(/comment-id/)
  })

  it('comment-id が重複する場合は、行を示してエラーにする', () => {
    const rows = [['comment-id', 'comment-body'], ['c1', '意見 A'], ['c1', '意見 B']]
    expect(() => parseCommentTable(rows)).toThrow(CsvFormatError)
    expect(() => parseCommentTable(rows)).toThrow(/3 行目/)
  })

  it('comment-id が空の行は、行を示してエラーにする', () => {
    expect(() => parseCommentTable([['comment-id', 'comment-body'], ['', '意見']])).toThrow(/2 行目/)
  })
})

describe('isCommentTable', () => {
  it('見出し行に comment-id と comment-body がある CSV を意見 CSV とみなす', () => {
    expect(isCommentTable([['comment-id', 'comment-body']])).toBe(true)
    expect(isCommentTable([['participant', 'c1', 'c2']])).toBe(false)
    expect(isCommentTable([])).toBe(false)
  })
})
