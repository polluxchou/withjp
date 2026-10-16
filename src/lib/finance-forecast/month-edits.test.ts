import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendBlankRow,
  applyMonthForward,
  clearMonthAt,
  copyPreviousMonthInto,
  deleteRowAt,
  mergeLifecycleRows,
  patchMonth,
  patchRow,
} from './month-edits.ts'
import type { ForecastAccountInput, ForecastMonthInput } from '@/lib/finance-forecast/calculations'
import type { LifecycleApplyTargetRow } from '@/lib/finance-forecast/lifecycle-apply'

function row(id: string, patch: Partial<ForecastAccountInput> = {}): ForecastAccountInput {
  return { id, account_name: id, account_type: 'key', live_days: 20, avg_daily_hours: 4, revenue_per_minute_usd: 1, share_ratio_pct: 50, ...patch }
}

function m(key: string, rows: ForecastAccountInput[] = [], patch: Partial<ForecastMonthInput> = {}): ForecastMonthInput {
  return { month: key, rows, actual_revenue_usd: 0, budget_cost_usd: 0, ...patch }
}

const year = () => [m('2026-01', [row('a')]), m('2026-02', [row('b'), row('c')]), m('2026-03'), m('2026-04', [row('z')])]

test('patchMonth: 只改指定月份,其余原样(同一引用)', () => {
  const months = year()
  const next = patchMonth(months, 1, { note: '备注', actual_revenue_usd: 9 })
  assert.equal(next[1].note, '备注')
  assert.equal(next[1].actual_revenue_usd, 9)
  assert.equal(next[0], months[0])
  assert.equal(next[2], months[2])
  assert.equal(months[1].note, undefined)
})

test('patchRow: 只改指定月份的指定行', () => {
  const months = year()
  const next = patchRow(months, 1, 1, { live_days: 3 })
  assert.deepEqual(next[1].rows.map((r) => r.live_days), [20, 3])
  assert.equal(next[1].rows[0], months[1].rows[0])
  assert.equal(next[0], months[0])
})

test('appendBlankRow: 末尾追加空白「新号」行,id 只为目标月生成', () => {
  const calls: string[] = []
  const next = appendBlankRow(year(), 2, '新账号', (key) => { calls.push(key); return `${key}-id` })
  assert.deepEqual(calls, ['2026-03'])
  assert.deepEqual(next[2].rows, [{
    id: '2026-03-id', account_name: '新账号', account_type: 'newbie',
    live_days: 0, avg_daily_hours: 0, revenue_per_minute_usd: 0, share_ratio_pct: 0,
  }])
  assert.equal(next[1].rows.length, 2)
})

test('deleteRowAt: 删掉指定月份的第 n 行', () => {
  const next = deleteRowAt(year(), 1, 0)
  assert.deepEqual(next[1].rows.map((r) => r.id), ['c'])
  assert.deepEqual(next[0].rows.map((r) => r.id), ['a'])
})

test('clearMonthAt: 清掉账号行与备注,保留实际收入', () => {
  const months = [m('2026-01', [row('a')], { note: 'x', actual_revenue_usd: 50, budget_cost_usd: 7 }), m('2026-02', [row('b')])]
  const next = clearMonthAt(months, 0)
  assert.deepEqual(next[0], { month: '2026-01', rows: [], note: '', actual_revenue_usd: 50, budget_cost_usd: 7 })
  assert.equal(next[1], months[1])
})

test('copyPreviousMonthInto: 用上月的行覆盖本月,id 加本月前缀', () => {
  const next = copyPreviousMonthInto(year(), 2)
  assert.deepEqual(next[2].rows.map((r) => r.id), ['2026-03-b', '2026-03-c'])
  assert.equal(next[2].rows[0].account_name, 'b')
  // 覆盖而不是追加
  const over = copyPreviousMonthInto(year(), 3)
  assert.deepEqual(over[3].rows.map((r) => r.id), [])
})

test('applyMonthForward: 本月的行覆盖之后每个月,之前的月份不动', () => {
  const months = year()
  const next = applyMonthForward(months, 1)
  assert.equal(next[0], months[0])
  assert.equal(next[1], months[1])
  assert.deepEqual(next[2].rows.map((r) => r.id), ['2026-03-b', '2026-03-c'])
  assert.deepEqual(next[3].rows.map((r) => r.id), ['2026-04-b', '2026-04-c'])
})

function planned(year: number, monthKey: string, rowId: string): LifecycleApplyTargetRow {
  return { year, monthIndex: Number(monthKey.slice(5)) - 1, monthKey, rowId, account_type: 'newbie', live_days: 10, avg_daily_hours: 2, revenue_per_minute_usd: 0.5, share_ratio_pct: 40 }
}

test('mergeLifecycleRows: 跨年追加到对应月份,账号名去空白', () => {
  const byYear = {
    2026: [m('2026-11'), m('2026-12', [row('old')])],
    2027: [m('2027-01'), m('2027-02')],
  }
  const next = mergeLifecycleRows(byYear, [planned(2026, '2026-12', 'p1'), planned(2027, '2027-01', 'p2')], '  新人A  ', '新账号')
  assert.equal(next[2026][0], byYear[2026][0])
  assert.deepEqual(next[2026][1].rows.map((r) => [r.id, r.account_name]), [['old', 'old'], ['p1', '新人A']])
  assert.deepEqual(next[2027][0].rows, [{
    id: 'p2', account_name: '新人A', account_type: 'newbie',
    live_days: 10, avg_daily_hours: 2, revenue_per_minute_usd: 0.5, share_ratio_pct: 40,
  }])
  assert.equal(next[2027][1], byYear[2027][1])
  // 原对象不被改动
  assert.equal(byYear[2026][1].rows.length, 1)
})

test('mergeLifecycleRows: 空名用默认名;计划里没有的年份原样保留', () => {
  const byYear = { 2026: [m('2026-05')], 2028: [m('2028-01')] }
  const next = mergeLifecycleRows(byYear, [planned(2026, '2026-05', 'p')], '   ', '新账号')
  assert.equal(next[2026][0].rows[0].account_name, '新账号')
  assert.equal(next[2028], byYear[2028])
})

test('mergeLifecycleRows: 计划落在没有数据的年份时,该年记为空数组', () => {
  const next = mergeLifecycleRows({}, [planned(2029, '2029-01', 'p')], 'A', '新账号')
  assert.deepEqual(next[2029], [])
})
