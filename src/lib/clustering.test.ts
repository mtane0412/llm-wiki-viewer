import { describe, expect, it } from 'vitest'
import { chooseClusters, createRandom, kMeans, projectToPlane } from './clustering'

/** 原点の近くと (10, 10) の近くに 3 点ずつ集まった、明らかに 2 つの塊に分かれる点です。 */
const twoBlobs = [
  [0, 0],
  [0.5, 0.2],
  [0.1, 0.6],
  [10, 10],
  [10.4, 9.8],
  [9.7, 10.3],
]

describe('createRandom', () => {
  it('同じ種からは同じ乱数の列を返し、値は 0 以上 1 未満である', () => {
    const first = createRandom(42)
    const second = createRandom(42)
    const values = Array.from({ length: 5 }, () => first())
    expect(Array.from({ length: 5 }, () => second())).toEqual(values)
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })
})

describe('projectToPlane', () => {
  it('ばらつきの最も大きい方向を 1 つ目の軸にして、2 次元に射影する', () => {
    // 前提: 点は x 軸方向にだけ大きくばらつき、y・z はほとんど変わりません
    const points = projectToPlane([
      [-2, 0, 0.1],
      [0, 0.1, 0],
      [2, 0, -0.1],
    ])
    expect(points).toHaveLength(3)
    expect(Math.abs(points[0][0] - points[2][0])).toBeCloseTo(4, 1)
    expect(Math.abs(points[0][1] - points[2][1])).toBeLessThan(0.5)
  })

  it('同じ入力からは同じ座標を返す', () => {
    expect(projectToPlane(twoBlobs)).toEqual(projectToPlane(twoBlobs))
  })
})

describe('kMeans', () => {
  it('塊ごとに同じクラスタの番号を付ける', () => {
    const labels = kMeans(twoBlobs, 2, 1)
    expect(new Set(labels.slice(0, 3)).size).toBe(1)
    expect(new Set(labels.slice(3)).size).toBe(1)
    expect(labels[0]).not.toBe(labels[3])
  })
})

describe('chooseClusters', () => {
  it('シルエット係数の最も高いクラスタ数を選ぶ', () => {
    const labels = chooseClusters(twoBlobs, { maxClusters: 4, seed: 1 })
    expect(new Set(labels).size).toBe(2)
  })
})
