import assert from 'node:assert/strict'
import test from 'node:test'

import { URGENT_WITHIN_DAYS, bucketOf, daysUntil, dueBadge, tokyoToday } from './quadrant.ts'
import type { QuadrantItemInput } from './quadrant.ts'

const TODAY = '2026-10-15'
const item = (over: Partial<QuadrantItemInput> = {}): QuadrantItemInput => ({
  is_important: true, due_date: null, status: 'todo', ...over,
})

test('tokyoToday: UTC 14:59 仍是东京当天，UTC 15:00 已是东京次日', () => {
  assert.equal(tokyoToday(new Date('2026-10-15T14:59:59Z')), '2026-10-15')
  assert.equal(tokyoToday(new Date('2026-10-15T15:00:00Z')), '2026-10-16')
})

test('daysUntil: 跨月、跨年、当天、负数', () => {
  assert.equal(daysUntil('2026-11-01', '2026-10-31'), 1)
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1)
  assert.equal(daysUntil('2026-10-15', '2026-10-15'), 0)
  assert.equal(daysUntil('2026-10-14', '2026-10-15'), -1)
})

test('bucketOf: 已完成优先于一切', () => {
  assert.equal(bucketOf(item({ status: 'done', is_important: null }), TODAY), 'done')
  assert.equal(bucketOf(item({ status: 'done', due_date: '2026-10-01' }), TODAY), 'done')
})

test('bucketOf: is_important 为空 → 待评估，哪怕已逾期', () => {
  assert.equal(bucketOf(item({ is_important: null, due_date: '2026-10-01' }), TODAY), 'unrated')
})

test('bucketOf: 迁移未跑时新列是 undefined → 待评估，不抛错', () => {
  assert.equal(bucketOf({ is_important: undefined, due_date: undefined, status: undefined }, TODAY), 'unrated')
})

test('bucketOf: 四个象限各一例', () => {
  assert.equal(bucketOf(item({ is_important: true, due_date: '2026-10-18' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ is_important: true, due_date: '2026-11-30' }), TODAY), 'q2')
  assert.equal(bucketOf(item({ is_important: false, due_date: '2026-10-18' }), TODAY), 'q3')
  assert.equal(bucketOf(item({ is_important: false, due_date: '2026-11-30' }), TODAY), 'q4')
})

test('bucketOf: 紧急边界 — 差 7 天算紧急，差 8 天不算', () => {
  assert.equal(URGENT_WITHIN_DAYS, 7)
  assert.equal(bucketOf(item({ due_date: '2026-10-22' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ due_date: '2026-10-23' }), TODAY), 'q2')
})

test('bucketOf: 当天到期、已逾期算紧急；没有截止日永远不紧急', () => {
  assert.equal(bucketOf(item({ due_date: TODAY }), TODAY), 'q1')
  assert.equal(bucketOf(item({ due_date: '2026-09-01' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ due_date: null }), TODAY), 'q2')
  assert.equal(bucketOf(item({ is_important: false, due_date: null }), TODAY), 'q4')
})

test('bucketOf: 进行中、卡住不影响象限', () => {
  assert.equal(bucketOf(item({ status: 'doing', due_date: '2026-10-16' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ status: 'blocked', due_date: null }), TODAY), 'q2')
})

test('dueBadge: spec 2.3 每一行', () => {
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-13' }), TODAY), { kind: 'overdue', days: 2, tone: 'danger' })
  assert.deepEqual(dueBadge(item({ due_date: TODAY }), TODAY), { kind: 'today', tone: 'warning' })
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-16' }), TODAY), { kind: 'soon', days: 1, date: '10-16', tone: 'warning' })
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-18' }), TODAY), { kind: 'soon', days: 3, date: '10-18', tone: 'warning' })
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-19' }), TODAY), { kind: 'date', date: '10-19', tone: 'muted' })
  assert.equal(dueBadge(item({ due_date: null }), TODAY), null)
  assert.equal(dueBadge(item({ due_date: '2026-10-01', status: 'done' }), TODAY), null)
})
