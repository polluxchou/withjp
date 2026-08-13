import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCount, formatCount } from './metrics.ts'

test('parseCount: 缩写后缀 K/M/B', () => {
  assert.equal(parseCount('1.2M'), 1_200_000)
  assert.equal(parseCount('34M'), 34_000_000)
  assert.equal(parseCount('34K'), 34_000)
  assert.equal(parseCount('1.2B'), 1_200_000_000)
  assert.equal(parseCount('812'), 812)
})

test('parseCount: 千分位逗号与空白', () => {
  assert.equal(parseCount('1,234'), 1234)
  assert.equal(parseCount('  56 '), 56)
})

test('parseCount: 已是数字直接返回', () => {
  assert.equal(parseCount(1200000), 1_200_000)
})

test('parseCount: 空/非法返回 null', () => {
  assert.equal(parseCount(''), null)
  assert.equal(parseCount(null), null)
  assert.equal(parseCount(undefined), null)
  assert.equal(parseCount('abc'), null)
})

test('formatCount: 数字转紧凑显示', () => {
  assert.equal(formatCount(1_200_000), '1.2M')
  assert.equal(formatCount(34_000), '34K')
  assert.equal(formatCount(1_200_000_000), '1.2B')
  assert.equal(formatCount(812), '812')
  assert.equal(formatCount(null), '—')
})
