/**
 * URL のハッシュを画面の状態（Route）として扱う React フックです。
 */
import { useCallback, useEffect, useState } from 'react'
import { parseRoute, type Route } from '../lib/route'

/** 画面を移動する関数です。replace が true なら履歴を積まずに置き換えます。 */
export type Navigate = (hash: string, options?: { replace?: boolean }) => void

/**
 * 現在の画面の状態と、画面を移動する関数を返します。
 *
 * @returns 現在の画面の状態と移動関数
 */
export function useHashRoute(): [Route, Navigate] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback<Navigate>((hash, options) => {
    if (options?.replace) {
      // replaceState では hashchange が発生しないため、状態を直接更新します
      window.history.replaceState(null, '', hash)
    } else {
      window.location.hash = hash
    }
    setRoute(parseRoute(hash))
  }, [])

  return [route, navigate]
}
