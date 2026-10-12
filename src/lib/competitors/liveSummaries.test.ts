// src/lib/competitors/liveSummaries.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SUMMARY_BODY_MAX_CHARS,
  SUMMARY_LINE_MAX_CHARS,
  normalizeSummaryBody,
  normalizeSummarySubtitle,
  normalizeSummaryTitle,
  pickSummary,
  sortSummaries,
  type LiveSummary,
} from './liveSummaries.ts'

function summary(
  id: string,
  generated_on: string,
  created_at: string,
  source: LiveSummary['source'] = 'auto',
): LiveSummary {
  return { id, generated_on, title: id, subtitle: '', body: `## ${id}`, source, created_at, updated_at: created_at }
}

test('sortSummaries: 按生成日期倒序，最新一份在最前', () => {
  const rows = [
    summary('old', '2026-09-01', '2026-09-01T00:00:00Z'),
    summary('new', '2026-10-11', '2026-10-11T00:00:00Z'),
    summary('mid', '2026-09-20', '2026-09-20T00:00:00Z'),
  ]
  assert.deepEqual(sortSummaries(rows).map((s) => s.id), ['new', 'mid', 'old'])
})

test('sortSummaries: 同一天按入库时间倒序兜底（手写那份不受每日唯一约束）', () => {
  const rows = [
    summary('first', '2026-10-11', '2026-10-11T01:00:00Z', 'manual'),
    summary('third', '2026-10-11', '2026-10-11T09:00:00Z', 'manual'),
    summary('second', '2026-10-11', '2026-10-11T05:00:00Z'),
  ]
  assert.deepEqual(sortSummaries(rows).map((s) => s.id), ['third', 'second', 'first'])
})

test('sortSummaries: 日期按字典序比，跨年不翻车', () => {
  const rows = [
    summary('dec', '2025-12-31', '2025-12-31T00:00:00Z'),
    summary('jan', '2026-01-02', '2026-01-02T00:00:00Z'),
  ]
  assert.deepEqual(sortSummaries(rows).map((s) => s.id), ['jan', 'dec'])
})

test('sortSummaries: 不改动入参数组', () => {
  const rows = [
    summary('old', '2026-09-01', '2026-09-01T00:00:00Z'),
    summary('new', '2026-10-11', '2026-10-11T00:00:00Z'),
  ]
  sortSummaries(rows)
  assert.deepEqual(rows.map((s) => s.id), ['old', 'new'])
})

test('pickSummary: 没有 day 时取最新一份（入参乱序也一样）', () => {
  const rows = [
    summary('old', '2026-09-01', '2026-09-01T00:00:00Z'),
    summary('new', '2026-10-11', '2026-10-11T00:00:00Z'),
  ]
  assert.equal(pickSummary(rows, null)?.id, 'new')
})

test('pickSummary: URL 上的 day 命中就取那一天', () => {
  const rows = [
    summary('old', '2026-09-01', '2026-09-01T00:00:00Z'),
    summary('new', '2026-10-11', '2026-10-11T00:00:00Z'),
  ]
  assert.equal(pickSummary(rows, '2026-09-01')?.id, 'old')
})

test('pickSummary: day 没有对应的总结（或写坏了）就回落到最新一份', () => {
  const rows = [
    summary('old', '2026-09-01', '2026-09-01T00:00:00Z'),
    summary('new', '2026-10-11', '2026-10-11T00:00:00Z'),
  ]
  assert.equal(pickSummary(rows, '2026-09-02')?.id, 'new')
  assert.equal(pickSummary(rows, 'garbage')?.id, 'new')
  assert.equal(pickSummary(rows, '')?.id, 'new')
})

test('pickSummary: 同一天多份时，只给 day 取那天最新的一份；再给 id 精确取', () => {
  const rows = [
    summary('auto', '2026-10-11', '2026-10-11T01:00:00Z'),
    summary('manual', '2026-10-11', '2026-10-11T08:00:00Z', 'manual'),
    summary('older', '2026-10-01', '2026-10-01T00:00:00Z'),
  ]
  assert.equal(pickSummary(rows, '2026-10-11')?.id, 'manual')
  assert.equal(pickSummary(rows, '2026-10-11', 'auto')?.id, 'auto')
})

test('pickSummary: id 与 day 对不上时以 day 为准，不跳到别的日子', () => {
  // 链接里 day 是人能读懂的那一半；id 只在同一天有多份时用来区分。
  const rows = [
    summary('a', '2026-10-11', '2026-10-11T01:00:00Z'),
    summary('b', '2026-10-01', '2026-10-01T00:00:00Z'),
  ]
  assert.equal(pickSummary(rows, '2026-10-11', 'b')?.id, 'a')
  assert.equal(pickSummary(rows, null, 'b')?.id, 'b')
  assert.equal(pickSummary(rows, null, 'missing')?.id, 'a')
})

test('pickSummary: 空列表返回 null', () => {
  assert.equal(pickSummary([], null), null)
  assert.equal(pickSummary([], '2026-10-11'), null)
})

test('normalizeSummaryBody: 去掉首尾空白，保留内部换行（markdown 靠它分块）', () => {
  assert.equal(normalizeSummaryBody('\n\n## 标题\n\n- 一\n- 二\n  \n'), '## 标题\n\n- 一\n- 二')
})

test('normalizeSummaryBody: 空、纯空白、非字符串一律 null', () => {
  assert.equal(normalizeSummaryBody(''), null)
  assert.equal(normalizeSummaryBody('  \n\t '), null)
  assert.equal(normalizeSummaryBody(undefined), null)
  assert.equal(normalizeSummaryBody(42), null)
})

test('normalizeSummaryBody: 恰好到上限可写，超一个字符就拒（不截断）', () => {
  const max = 'x'.repeat(SUMMARY_BODY_MAX_CHARS)
  assert.equal(normalizeSummaryBody(max), max)
  assert.equal(normalizeSummaryBody(`${max}y`), null)
})

test('normalizeSummaryBody: 按码点计长，emoji 不占两格', () => {
  const emoji = '📈'.repeat(SUMMARY_BODY_MAX_CHARS)
  assert.equal(normalizeSummaryBody(emoji), emoji)
})

test('normalizeSummarySubtitle: 单行——空白折成一个空格、去首尾', () => {
  assert.equal(normalizeSummarySubtitle('  3 个号 ·\n 9/1–9/30 \t· 120 场  '), '3 个号 · 9/1–9/30 · 120 场')
})

test('normalizeSummarySubtitle: 没给或纯空白是合法的空串（界面不显示那一行）', () => {
  assert.equal(normalizeSummarySubtitle(undefined), '')
  assert.equal(normalizeSummarySubtitle(null), '')
  assert.equal(normalizeSummarySubtitle('   '), '')
})

test('normalizeSummarySubtitle: 非字符串、超长返回 null（不截断）', () => {
  assert.equal(normalizeSummarySubtitle(12), null)
  assert.equal(normalizeSummarySubtitle('字'.repeat(SUMMARY_LINE_MAX_CHARS)), '字'.repeat(SUMMARY_LINE_MAX_CHARS))
  assert.equal(normalizeSummarySubtitle('字'.repeat(SUMMARY_LINE_MAX_CHARS + 1)), null)
})

test('normalizeSummaryTitle: 与副标题同一套单行规则', () => {
  assert.equal(normalizeSummaryTitle(' 开播时段\n趋势总结 '), '开播时段 趋势总结')
  assert.equal(normalizeSummaryTitle(''), '')
  assert.equal(normalizeSummaryTitle('x'.repeat(SUMMARY_LINE_MAX_CHARS + 1)), null)
})
