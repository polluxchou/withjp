import test from 'node:test'
import assert from 'node:assert/strict'

import {
  completionDeltaDays,
  fallbackStatus,
  normalizeDayStamp,
  resolveCompletion,
  tokyoDayStamp,
} from './completion.ts'

const NOW = new Date('2026-08-31T03:00:00.000Z') // 东京时间 8/31 12:00

function day(iso: string): string {
  return `${iso}T00:00:00.000Z`
}

const DATES = { start_date: day('2026-06-01'), target_date: day('2026-09-30') }

// ── tokyoDayStamp ─────────────────────────────────────────────

test('tokyoDayStamp 按东京业务日取整，不受 UTC 日界影响', () => {
  // UTC 还是 8/30，东京已经是 8/31 —— 早班点「已完成」不该盖上昨天的戳
  assert.equal(tokyoDayStamp(new Date('2026-08-30T23:30:00.000Z')), day('2026-08-31'))
  assert.equal(tokyoDayStamp(new Date('2026-08-31T03:00:00.000Z')), day('2026-08-31'))
  // 东京 8/31 23:59 → UTC 已是 9/1，仍应记 8/31
  assert.equal(tokyoDayStamp(new Date('2026-08-31T14:59:00.000Z')), day('2026-08-31'))
})

// ── normalizeDayStamp ─────────────────────────────────────────

test('normalizeDayStamp 接受纯日期与完整 ISO，空值归一为 null', () => {
  assert.equal(normalizeDayStamp('2026-08-31'), day('2026-08-31'))
  assert.equal(normalizeDayStamp('2026-08-31T00:00:00.000Z'), day('2026-08-31'))
  assert.equal(normalizeDayStamp('2026-08-31T15:20:00.000Z'), day('2026-08-31'))
  assert.equal(normalizeDayStamp(null), null)
  assert.equal(normalizeDayStamp(''), null)
  assert.equal(normalizeDayStamp('   '), null)
})

test('normalizeDayStamp 对非法输入返回 undefined，让调用方能报 400 而不是静默丢日期', () => {
  assert.equal(normalizeDayStamp('not-a-date'), undefined)
  assert.equal(normalizeDayStamp('2026-13-45'), undefined)
  assert.equal(normalizeDayStamp(42), undefined)
})

test('normalizeDayStamp 挡住会静默进位的越界日期', () => {
  // Date 对 13 月直接判非法，但 2/30、4/31 这类是「格式合法、日历不存在」，
  // 会被悄悄进位成 3/2、5/1 —— 回读一遍才拦得住
  assert.equal(normalizeDayStamp('2026-02-30'), undefined)
  assert.equal(normalizeDayStamp('2026-04-31'), undefined)
})

// ── fallbackStatus ────────────────────────────────────────────

test('fallbackStatus：目标日期已过 → missed', () => {
  assert.equal(
    fallbackStatus({ start_date: day('2026-06-01'), target_date: day('2026-08-30') }, NOW),
    'missed',
  )
})

test('fallbackStatus：目标日期在 7 天内 → at_risk', () => {
  assert.equal(
    fallbackStatus({ start_date: day('2026-06-01'), target_date: day('2026-09-03') }, NOW),
    'at_risk',
  )
})

test('fallbackStatus：已开始且目标日期尚远 → active', () => {
  assert.equal(fallbackStatus(DATES, NOW), 'active')
})

test('fallbackStatus：还没到开始日期 → planned', () => {
  assert.equal(
    fallbackStatus({ start_date: day('2026-10-01'), target_date: day('2026-12-01') }, NOW),
    'planned',
  )
})

test('fallbackStatus：恰好 7 天整后到期不算 at_risk，与 GET 的时间兜底取同一个开区间', () => {
  // NOW + 7d 这一刻本身落在窗口外（route.ts 用的是严格小于），差一秒才进窗口
  assert.equal(
    fallbackStatus({ start_date: day('2026-06-01'), target_date: '2026-09-07T03:00:00.000Z' }, NOW),
    'active',
  )
  assert.equal(
    fallbackStatus({ start_date: day('2026-06-01'), target_date: '2026-09-07T02:59:59.000Z' }, NOW),
    'at_risk',
  )
})

// ── resolveCompletion ─────────────────────────────────────────

const PREV_OPEN = { ...DATES, status: 'active' as const, completed_date: null }
const PREV_DONE = { ...DATES, status: 'completed' as const, completed_date: day('2026-08-20') }

test('填完成日期 → 状态自动置为 completed', () => {
  assert.deepEqual(
    resolveCompletion(PREV_OPEN, { completed_date: '2026-08-25' }, NOW),
    { status: 'completed', completed_date: day('2026-08-25') },
  )
})

test('同批既填日期又显式给了别的状态时，完成日期是权威', () => {
  assert.deepEqual(
    resolveCompletion(PREV_OPEN, { completed_date: '2026-08-25', status: 'active' }, NOW),
    { status: 'completed', completed_date: day('2026-08-25') },
  )
})

test('清空完成日期 → 状态按起止日期回退重算', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { completed_date: null }, NOW),
    { status: 'active', completed_date: null },
  )
})

test('清空完成日期时若显式给了非完成状态，采纳该状态', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { completed_date: null, status: 'planned' }, NOW),
    { status: 'planned', completed_date: null },
  )
})

test('清空完成日期却仍要求 completed —— 日期权威，回退重算而不是自相矛盾', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { completed_date: '', status: 'completed' }, NOW),
    { status: 'active', completed_date: null },
  )
})

test('手动点「已完成」且日期为空 → 补今天（东京业务日）', () => {
  assert.deepEqual(
    resolveCompletion(PREV_OPEN, { status: 'completed' }, NOW),
    { status: 'completed', completed_date: day('2026-08-31') },
  )
})

test('手动点「已完成」但日期已存在 → 不覆盖原有日期', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { status: 'completed' }, NOW),
    { status: 'completed', completed_date: day('2026-08-20') },
  )
})

test('从「已完成」点回其它状态 → 完成日期一并清空，否则会被再次拽回 completed', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { status: 'at_risk' }, NOW),
    { status: 'at_risk', completed_date: null },
  )
})

test('patch 里既没有状态也没有完成日期 → 原样返回，不动既有数据', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { title: 'x' } as Record<string, unknown>, NOW),
    { status: 'completed', completed_date: day('2026-08-20') },
  )
})

test('不变式：任何一条规则走完，completed 与完成日期非空互为充要条件', () => {
  const patches: Record<string, unknown>[] = [
    { completed_date: '2026-08-25' },
    { completed_date: null },
    { status: 'completed' },
    { status: 'planned' },
    { status: 'completed', completed_date: null },
    { status: 'missed', completed_date: '2026-08-25' },
    {},
  ]
  for (const prev of [PREV_OPEN, PREV_DONE]) {
    for (const patch of patches) {
      const out = resolveCompletion(prev, patch, NOW)
      assert.equal(
        out.status === 'completed',
        out.completed_date !== null,
        `不变式被打破：${JSON.stringify({ prev: prev.status, patch, out })}`,
      )
    }
  }
})

// ── completionDeltaDays ───────────────────────────────────────

test('completionDeltaDays：正数=延期，负数=提前，0=准点', () => {
  assert.equal(completionDeltaDays(day('2026-10-05'), day('2026-09-30')), 5)
  assert.equal(completionDeltaDays(day('2026-09-25'), day('2026-09-30')), -5)
  assert.equal(completionDeltaDays(day('2026-09-30'), day('2026-09-30')), 0)
})

test('completionDeltaDays：没有完成日期或日期非法时返回 null', () => {
  assert.equal(completionDeltaDays(null, day('2026-09-30')), null)
  assert.equal(completionDeltaDays(day('2026-09-30'), 'nope'), null)
})

test('completionDeltaDays 按日界取整，同一天的不同时刻不产生 ±1 天漂移', () => {
  assert.equal(completionDeltaDays('2026-09-30T23:00:00.000Z', '2026-09-30T01:00:00.000Z'), 0)
})
