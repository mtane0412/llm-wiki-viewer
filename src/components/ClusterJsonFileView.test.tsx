import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { clusterOpinions, serializeClusterJson } from '../lib/opinionClusters'
import { ClusterJsonFileView } from './ClusterJsonFileView'

/** 給食の意見 2 件と公園の意見 1 件を 2 つのクラスタに分けた結果の JSON です。 */
const json = serializeClusterJson(
  clusterOpinions(
    [
      { id: 'c1', body: '給食を無償にしてほしい', attributes: {} },
      { id: 'c2', body: '給食の量を増やしてほしい', attributes: {} },
      { id: 'c3', body: '公園を増やしたい', attributes: {} },
    ],
    [
      [1, 0],
      [0.9, 0.1],
      [0, 1],
    ],
    2,
  ),
  { modelId: 'テスト用の埋め込みモデル', source: 'raw/comments.csv' },
)

describe('ClusterJsonFileView', () => {
  it('書き出した意見クラスタの JSON を、モデル無しで表示する', async () => {
    const user = userEvent.setup()
    render(<ClusterJsonFileView path="raw/clusters.json" readText={vi.fn(async () => json)} />)
    await user.click(await screen.findByRole('button', { name: /クラスタ 1（2 件）/ }))
    expect(within(screen.getByRole('list', { name: 'クラスタ 1 の意見' })).getByText('給食の量を増やしてほしい')).toBeInTheDocument()
    expect(screen.getByText(/テスト用の埋め込みモデル/)).toBeInTheDocument()
  })

  it('意見クラスタの JSON でない場合は、理由を表示する', async () => {
    render(<ClusterJsonFileView path="raw/other.json" readText={vi.fn(async () => '{"hello": 1}')} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('意見クラスタの JSON の形式ではありません')
  })
})
