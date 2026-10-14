// src/lib/competitors/descriptions.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BODY_MAX_CHARS,
  normalizeDescriptionBody,
  sortDescriptions,
} from './descriptions.ts'
import type { CompetitorDescription } from './types.ts'

function desc(
  id: string,
  generated_on: string,
  created_at: string,
  source: CompetitorDescription['source'] = 'auto',
): CompetitorDescription {
  return { id, competitor_id: 'c1', body: id, generated_on, source, created_at }
}

test('sortDescriptions: 按生成日期倒序，最新一条在最前', () => {
  const rows = [
    desc('old', '2026-07-30', '2026-07-30T00:00:00Z'),
    desc('new', '2026-09-07', '2026-09-07T00:00:00Z'),
    desc('mid', '2026-08-24', '2026-08-24T00:00:00Z'),
  ]
  assert.deepEqual(sortDescriptions(rows).map((d) => d.id), ['new', 'mid', 'old'])
})

test('sortDescriptions: 同一天按入库时间倒序兜底', () => {
  // 手写那条不受自动路径的每日唯一约束，所以同一天出现多条是正常状态。
  const rows = [
    desc('first', '2026-09-07', '2026-09-07T01:00:00Z'),
    desc('third', '2026-09-07', '2026-09-07T09:00:00Z'),
    desc('second', '2026-09-07', '2026-09-07T05:00:00Z'),
  ]
  assert.deepEqual(sortDescriptions(rows).map((d) => d.id), ['third', 'second', 'first'])
})

test('sortDescriptions: 日期按字典序比而不是 Date 解析,跨年跨月不翻车', () => {
  const rows = [
    desc('jan', '2026-01-09', '2026-01-09T00:00:00Z'),
    desc('dec', '2025-12-31', '2025-12-31T00:00:00Z'),
    desc('oct', '2025-10-01', '2025-10-01T00:00:00Z'),
  ]
  assert.deepEqual(sortDescriptions(rows).map((d) => d.id), ['jan', 'dec', 'oct'])
})

test('sortDescriptions: 不改动入参数组', () => {
  const rows = [
    desc('old', '2026-07-30', '2026-07-30T00:00:00Z'),
    desc('new', '2026-09-07', '2026-09-07T00:00:00Z'),
  ]
  sortDescriptions(rows)
  assert.deepEqual(rows.map((d) => d.id), ['old', 'new'])
})

test('normalizeDescriptionBody: 去掉首尾空白', () => {
  assert.equal(normalizeDescriptionBody('  暖色调影棚灯  \n'), '暖色调影棚灯')
})

test('normalizeDescriptionBody: 空白串与非字符串一律判空', () => {
  assert.equal(normalizeDescriptionBody('   \n\t '), null)
  assert.equal(normalizeDescriptionBody(''), null)
  assert.equal(normalizeDescriptionBody(undefined), null)
  assert.equal(normalizeDescriptionBody(null), null)
  assert.equal(normalizeDescriptionBody(42), null)
})

test('normalizeDescriptionBody: 超长正文判空而不是截断', () => {
  // 截断会把一段总结拦腰砍掉、还看不出被砍过；宁可写入失败让调用方重试。
  assert.equal(normalizeDescriptionBody('字'.repeat(BODY_MAX_CHARS)), '字'.repeat(BODY_MAX_CHARS))
  assert.equal(normalizeDescriptionBody('字'.repeat(BODY_MAX_CHARS + 1)), null)
})

test('normalizeDescriptionBody: 长度按去空白后的正文算', () => {
  const body = '字'.repeat(BODY_MAX_CHARS)
  assert.equal(normalizeDescriptionBody(`  ${body}  `), body)
})
