import { describe, expect, it } from 'vitest'
import type { Comment } from './opinions'
import { analysisCacheKey, clusterOpinions, parseClusterJson, serializeClusterJson } from './opinionClusters'

/** 給食の意見 3 件と公園の意見 3 件です。 */
const comments: Comment[] = [
  { id: 'c1', body: '給食を無償にしてほしい', attributes: {} },
  { id: 'c2', body: '給食の量を増やしてほしい', attributes: {} },
  { id: 'c3', body: '給食に地元の野菜を使ってほしい', attributes: {} },
  { id: 'c4', body: '公園を増やしたい', attributes: {} },
  { id: 'c5', body: '遊具を新しくしてほしい', attributes: {} },
  { id: 'c6', body: '公園にトイレがほしい', attributes: {} },
]

/**
 * 埋め込みモデルの代わりの、意味の近い意見ほど近いベクトルです。
 * 給食の意見は 1 つ目の軸、公園の意見は 2 つ目の軸の向きに集まります。c1 と c4 がそれぞれの塊の中心に最も近い意見です。
 */
const embeddings = [
  [1, 0, 0],
  [0.9, 0.2, 0.1],
  [0.9, -0.1, 0.2],
  [0, 1, 0],
  [0.2, 0.9, 0.1],
  [-0.1, 0.9, 0.2],
]

describe('clusterOpinions', () => {
  it('意味の近い意見を同じクラスタに分け、各意見に 2 次元の座標を付ける', () => {
    const result = clusterOpinions(comments, embeddings, 2)
    expect(result.clusters.map((cluster) => [...cluster.commentIds].sort())).toEqual(expect.arrayContaining([['c1', 'c2', 'c3'], ['c4', 'c5', 'c6']]))
    expect(result.comments).toHaveLength(6)
    expect(result.comments[0]).toMatchObject({ id: 'c1', body: '給食を無償にしてほしい' })
    expect(typeof result.comments[0].x).toBe('number')
  })

  it('クラスタの意見を、クラスタの中心に近い順に並べる', () => {
    const result = clusterOpinions(comments, embeddings, 2)
    expect(result.clusters.map((cluster) => cluster.commentIds[0]).sort()).toEqual(['c1', 'c4'])
  })

  it('同じ入力からは同じ結果を返す', () => {
    expect(clusterOpinions(comments, embeddings, 2)).toEqual(clusterOpinions(comments, embeddings, 2))
  })

  it('意見と埋め込みの件数が合わない場合はエラーにする', () => {
    expect(() => clusterOpinions(comments, embeddings.slice(1), 2)).toThrow(/件数/)
  })

  it('クラスタ数が 1 未満、または意見の件数を超える場合はエラーにする', () => {
    expect(() => clusterOpinions(comments, embeddings, 7)).toThrow(/クラスタ数/)
    expect(() => clusterOpinions(comments, embeddings, 0)).toThrow(/クラスタ数/)
  })
})

describe('analysisCacheKey', () => {
  it('同じ入力とモデルからは同じキーを、内容かモデルが違えば別のキーを返す', async () => {
    const key = await analysisCacheKey('comment-id,comment-body\nc1,給食', 'モデル A')
    expect(await analysisCacheKey('comment-id,comment-body\nc1,給食', 'モデル A')).toBe(key)
    expect(await analysisCacheKey('comment-id,comment-body\nc1,公園', 'モデル A')).not.toBe(key)
    expect(await analysisCacheKey('comment-id,comment-body\nc1,給食', 'モデル B')).not.toBe(key)
  })
})

describe('serializeClusterJson と parseClusterJson', () => {
  it('書き出した JSON を読み込むと、同じ結果とモデルの情報に戻る', () => {
    const result = clusterOpinions(comments, embeddings, 2)
    const json = serializeClusterJson(result, { modelId: 'モデル A', source: 'raw/survey/comments.csv' })
    expect(parseClusterJson(json)).toEqual({ result, modelId: 'モデル A', source: 'raw/survey/comments.csv', labelModelId: null, labels: [] })
  })

  it('LLM が生成したラベルと、その根拠にした意見の id も書き出して読み込める', () => {
    const result = clusterOpinions(comments, embeddings, 2)
    const labels = [{ clusterId: 0, label: '給食の改善', description: '給食の費用と内容の改善を求める意見です。', basisCommentIds: ['c1', 'c2'] }]
    const json = serializeClusterJson(result, { modelId: 'モデル A', source: 'raw/comments.csv', labelModelId: 'LLM B', labels })
    expect(parseClusterJson(json)).toMatchObject({ labelModelId: 'LLM B', labels })
  })

  it('存在しないクラスタや意見を指すラベルの JSON はエラーにする', () => {
    const result = clusterOpinions(comments, embeddings, 2)
    const labels = [{ clusterId: 5, label: '給食の改善', description: '説明', basisCommentIds: ['c1'] }]
    expect(() => parseClusterJson(serializeClusterJson(result, { modelId: 'モデル A', source: 'raw/comments.csv', labelModelId: 'LLM B', labels }))).toThrow(/labels\[0\]/)
  })

  it('形式の違う JSON はエラーにする', () => {
    expect(() => parseClusterJson('{"hello": 1}')).toThrow(/意見クラスタの JSON/)
    expect(() => parseClusterJson('壊れた JSON')).toThrow(/JSON/)
  })

  it('クラスタが存在しない意見の id を指す JSON はエラーにする', () => {
    const result = clusterOpinions(comments, embeddings, 2)
    const broken = JSON.parse(serializeClusterJson(result, { modelId: 'モデル A', source: 'raw/comments.csv' }))
    broken.clusters[0].commentIds.push('存在しない意見')
    expect(() => parseClusterJson(JSON.stringify(broken))).toThrow(/存在しない意見/)
  })
})
