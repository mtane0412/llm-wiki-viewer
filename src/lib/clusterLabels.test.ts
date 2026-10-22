import { describe, expect, it } from 'vitest'
import { buildLabelMessages, LabelFormatError, parseLabelOutput, pickBasisComments } from './clusterLabels'
import type { OpinionClusterResult } from './opinionClusters'

/** 給食の意見 3 件のクラスタと、公園の意見 1 件のクラスタです（意見はクラスタの中心に近い順です）。 */
const result: OpinionClusterResult = {
  comments: [
    { id: 'c1', body: '給食を無償にしてほしい', x: 0, y: 0, cluster: 0 },
    { id: 'c2', body: '給食の量を増やしてほしい', x: 0, y: 0, cluster: 0 },
    { id: 'c3', body: '給食に地元の野菜を使ってほしい', x: 0, y: 0, cluster: 0 },
    { id: 'c4', body: '公園を増やしたい', x: 1, y: 1, cluster: 1 },
  ],
  clusters: [
    { id: 0, commentIds: ['c2', 'c1', 'c3'] },
    { id: 1, commentIds: ['c4'] },
  ],
}

describe('pickBasisComments', () => {
  it('クラスタの中心に近い順に、指定した件数までの意見を根拠として選ぶ', () => {
    expect(pickBasisComments(result, 0, 2)).toEqual([
      { id: 'c2', body: '給食の量を増やしてほしい' },
      { id: 'c1', body: '給食を無償にしてほしい' },
    ])
    expect(pickBasisComments(result, 1, 2)).toEqual([{ id: 'c4', body: '公園を増やしたい' }])
  })
})

describe('pickBasisComments の不整合', () => {
  it('クラスタが comments に無い意見を指している場合はエラーにする', () => {
    const broken = { ...result, clusters: [{ id: 0, commentIds: ['存在しない意見'] }] }
    expect(() => pickBasisComments(broken, 0, 2)).toThrow(/存在しない意見/)
  })
})

describe('buildLabelMessages', () => {
  it('根拠の意見を並べ、見出しと説明を JSON で出力するよう指示する', () => {
    const messages = buildLabelMessages(pickBasisComments(result, 0, 3))
    const prompt = messages.map((message) => message.content).join('\n')
    expect(prompt).toContain('給食を無償にしてほしい')
    expect(prompt).toContain('"label"')
    expect(prompt).toContain('"description"')
  })
})

describe('parseLabelOutput', () => {
  it('JSON の見出しと説明を取り出す', () => {
    expect(parseLabelOutput('{"label": "給食の負担", "description": "給食費の負担を減らしてほしいという意見です。"}')).toEqual({
      label: '給食の負担',
      description: '給食費の負担を減らしてほしいという意見です。',
    })
  })

  it('コードブロックや前後の文章に囲まれた JSON も読む', () => {
    const text = 'まとめました。\n```json\n{"label": "公園の整備", "description": "公園を増やしてほしい。"}\n```'
    expect(parseLabelOutput(text)).toEqual({ label: '公園の整備', description: '公園を増やしてほしい。' })
  })

  it('JSON の後ろに波かっこを含む文章や 2 つ目の JSON が続いても、最初の JSON を読む', () => {
    expect(parseLabelOutput('{"label": "給食の改善", "description": "給食の意見です。"}\n補足: {例}')).toEqual({ label: '給食の改善', description: '給食の意見です。' })
    expect(parseLabelOutput('{"label": "A", "description": "説明 {かっこ} 入り"} {"label": "B", "description": "C"}')).toEqual({ label: 'A', description: '説明 {かっこ} 入り' })
  })

  it('JSON が見つからない出力は、空のラベルにせずエラーにする', () => {
    expect(() => parseLabelOutput('給食についての意見です')).toThrow(LabelFormatError)
  })

  it('見出しか説明が無い、または空の出力はエラーにする', () => {
    expect(() => parseLabelOutput('{"label": "給食の負担"}')).toThrow(/description/)
    expect(() => parseLabelOutput('{"label": " ", "description": "説明"}')).toThrow(/label/)
  })
})
