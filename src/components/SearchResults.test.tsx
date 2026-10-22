import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SearchResults, type VaultSearchResult } from './SearchResults'

const results: VaultSearchResult[] = [
  { path: 'wiki/出汁.md', title: '出汁', snippet: '昆布と鰹節で取る出汁。', score: 1, vaultId: 'v1', vaultName: '料理の wiki' },
]

describe('SearchResults', () => {
  it('結果のリンクの名前は、本文の抜粋を含まないページのタイトルにする', () => {
    render(<SearchResults results={results} showVaultName={false} />)
    expect(screen.getByRole('link', { name: '出汁' })).toHaveAttribute('href', '#/v1/page/wiki/%E5%87%BA%E6%B1%81.md')
  })

  it('すべての Wiki を検索したときは、リンクの名前に Wiki の名前も含める', () => {
    render(<SearchResults results={results} showVaultName />)
    expect(screen.getByRole('link', { name: '出汁（料理の wiki）' })).toBeInTheDocument()
  })
})
