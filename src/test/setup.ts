/**
 * Vitest の共通セットアップです。
 * jest-dom のマッチャー（toBeInTheDocument など）を有効にし、各テスト後に DOM を片付けます。
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom には ResizeObserver が無いため、グラフ画面のテスト用に何もしない実装を置きます
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
