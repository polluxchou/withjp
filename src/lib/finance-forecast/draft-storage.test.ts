import assert from 'node:assert/strict'
import test from 'node:test'

import { buildStorageKey, hasForecastInputs, readDraft, serializeDraft, writeDraft } from './draft-storage.ts'
import type { ForecastAccountInput, ForecastMonthInput } from '@/lib/finance-forecast/calculations'

const ROW: ForecastAccountInput = { id: 'r1', account_name: 'A', account_type: 'key', live_days: 20, avg_daily_hours: 4, revenue_per_minute_usd: 1, share_ratio_pct: 50 }

function m(key: string, patch: Partial<ForecastMonthInput> = {}): ForecastMonthInput {
  return { month: key, rows: [], actual_revenue_usd: 0, budget_cost_usd: 0, ...patch }
}

function withWindow(store: Map<string, string>, fn: () => void, { failGet = false } = {}) {
  const g = globalThis as { window?: unknown }
  g.window = {
    localStorage: {
      getItem: (k: string) => { if (failGet) throw new Error('blocked'); return store.get(k) ?? null },
      setItem: (k: string, v: string) => { store.set(k, v) },
    },
  }
  try { fn() } finally { delete g.window }
}

test('buildStorageKey: 前缀 + 视角 + 年份', () => {
  assert.equal(buildStorageKey('view-1', 2026), 'finance-forecast:draft:view-1:2026')
  assert.equal(buildStorageKey('v', '2027'), 'finance-forecast:draft:v:2027')
})

test('serializeDraft: 只存可编辑字段,不带预算', () => {
  const draft = serializeDraft([m('2026-01', { rows: [ROW], actual_revenue_usd: 5, budget_cost_usd: 999, note: 'n' })])
  assert.deepEqual(draft, { version: 1, months: [{ month: '2026-01', rows: [ROW], actual_revenue_usd: 5, note: 'n' }] })
})

test('writeDraft → readDraft 往返', () => {
  const store = new Map<string, string>()
  withWindow(store, () => {
    writeDraft('k', [m('2026-01', { rows: [ROW] })])
    assert.deepEqual(readDraft('k'), { version: 1, months: [{ month: '2026-01', rows: [ROW], actual_revenue_usd: 0 }] })
  })
})

test('readDraft: 没有/空串/坏 JSON/读不了 → null;没有 window → null', () => {
  const store = new Map([['bad', '{oops'], ['empty', '']])
  withWindow(store, () => {
    assert.equal(readDraft('missing'), null)
    assert.equal(readDraft('empty'), null)
    assert.equal(readDraft('bad'), null)
  })
  withWindow(new Map([['k', '{}']]), () => assert.equal(readDraft('k'), null), { failGet: true })
  assert.equal(readDraft('k'), null)
  assert.doesNotThrow(() => writeDraft('k', []))
})

test('hasForecastInputs: 账号行/实际收入/非空备注任一即算', () => {
  assert.equal(hasForecastInputs([m('2026-01'), m('2026-02')]), false)
  assert.equal(hasForecastInputs([m('2026-01', { note: '   ' })]), false)
  assert.equal(hasForecastInputs([m('2026-01', { budget_cost_usd: 100 })]), false)
  assert.equal(hasForecastInputs([m('2026-01'), m('2026-02', { rows: [ROW] })]), true)
  assert.equal(hasForecastInputs([m('2026-01', { actual_revenue_usd: 1 })]), true)
  assert.equal(hasForecastInputs([m('2026-01', { note: ' x ' })]), true)
})
