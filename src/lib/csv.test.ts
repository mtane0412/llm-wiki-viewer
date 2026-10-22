import { describe, expect, it } from 'vitest'
import { CsvFormatError, parseCsv } from './csv'

describe('parseCsv', () => {
  it('カンマ区切りの行を、セルの配列の配列にする', () => {
    expect(parseCsv('comment-id,comment-body\n1,給食を無償にしてほしい\n')).toEqual([
      ['comment-id', 'comment-body'],
      ['1', '給食を無償にしてほしい'],
    ])
  })

  it('ダブルクォートで囲んだセルの中のカンマ・改行・二重のダブルクォートを扱う', () => {
    expect(parseCsv('id,body\r\n1,"財源は、どうする?\n""増税""は反対"\r\n')).toEqual([
      ['id', 'body'],
      ['1', '財源は、どうする?\n"増税"は反対'],
    ])
  })

  it('先頭の BOM を除き、末尾に改行が無くても最後の行を読む', () => {
    expect(parseCsv('﻿id,body\n1,公園を増やしたい')).toEqual([
      ['id', 'body'],
      ['1', '公園を増やしたい'],
    ])
  })

  it('空のセルと空行を扱う（空行は読み飛ばす）', () => {
    expect(parseCsv('a,b,c\n1,,3\n\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
  })

  it('閉じられていないダブルクォートは、始まった行を示してエラーにする', () => {
    expect(() => parseCsv('id,body\n1,"閉じ忘れ\n2,次の行')).toThrow(CsvFormatError)
    expect(() => parseCsv('id,body\n1,"閉じ忘れ\n2,次の行')).toThrow(/2 行目/)
  })
})
