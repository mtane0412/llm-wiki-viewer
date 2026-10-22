/**
 * 検索結果の一覧を表示するコンポーネントです。
 *
 * すべての Wiki を横断して検索した場合は、結果ごとに Wiki の名前を表示します。
 */
import { formatRoute } from '../lib/route'
import type { SearchResult } from '../lib/search'

/** Wiki の名前つきの検索結果です。 */
export interface VaultSearchResult extends SearchResult {
  vaultId: string
  vaultName: string
}

/** SearchResults の引数です。 */
export interface SearchResultsProps {
  results: VaultSearchResult[]
  /** Wiki の名前を表示するかどうか（横断検索のとき true）です。 */
  showVaultName: boolean
}

/** 検索結果の一覧です。 */
export function SearchResults({ results, showVaultName }: SearchResultsProps) {
  return (
    <section className="search-results" aria-label="検索結果">
      <p className="muted search-count">{`${results.length} 件（raw/ の元資料はファイル名だけが検索対象です）`}</p>
      <ul>
        {results.map((result) => (
          <li key={`${result.vaultId}:${result.path}`}>
            {/* 抜粋を含めない名前を明示し、ブラウザ操作エージェントや読み上げでリンク先を判別しやすくします */}
            <a
              href={formatRoute({ view: 'page', vaultId: result.vaultId, path: result.path, heading: undefined })}
              aria-label={showVaultName ? `${result.title}（${result.vaultName}）` : result.title}
            >
              <span className="search-title">{result.title}</span>
              {showVaultName && <span className="search-vault">{result.vaultName}</span>}
              {result.snippet && <span className="search-snippet">{result.snippet}</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
