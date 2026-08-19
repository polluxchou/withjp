import assert from 'node:assert/strict'
import test from 'node:test'

import { SLOT_MIN_SESSIONS, minutesToLabel, recentSessionStarts, summarizeLiveHabit } from './liveSlots.ts'

const JST = 'Asia/Tokyo'
const PT = 'America/Los_Angeles'

/** JST 的某天某时刻 → UTC ISO（JST = UTC+9，无夏令时）。 */
function jst(day: number, hh: number, mm: number): string {
  const utcHour = hh - 9
  const d = new Date(Date.UTC(2026, 7, day, 0, mm))
  d.setUTCHours(d.getUTCHours() + utcHour)
  return d.toISOString()
}

test('空输入 / 全 null 归零', () => {
  assert.deepEqual(summarizeLiveHabit([], JST), { slots: [], sessions: 0, latestStartedAt: null })
  assert.deepEqual(summarizeLiveHabit([null, undefined, ''], JST), { slots: [], sessions: 0, latestStartedAt: null })
})

test('同一场的多张截图只算一场（按 stream_started_at 去重）', () => {
  const one = jst(19, 13, 32)
  const h = summarizeLiveHabit([one, one, one], JST)
  assert.equal(h.sessions, 1)
  assert.equal(h.slots.length, 0, `1 场不到 ${SLOT_MIN_SESSIONS} 场门槛，不成档`)
  assert.equal(h.latestStartedAt, one)
})

test('未达门槛只给 latestStartedAt，不给档', () => {
  const h = summarizeLiveHabit([jst(17, 13, 30), jst(18, 13, 33)], JST)
  assert.equal(h.sessions, 2)
  assert.deepEqual(h.slots, [])
  assert.equal(h.latestStartedAt, jst(18, 13, 33))
})

test('同一档 5 场：取档内中位数', () => {
  const h = summarizeLiveHabit(
    [jst(15, 13, 45), jst(16, 13, 29), jst(17, 13, 32), jst(18, 13, 33), jst(19, 13, 31)],
    JST,
  )
  assert.equal(h.sessions, 5)
  assert.equal(h.slots.length, 1)
  assert.equal(h.slots[0].label, '13:32')
  assert.equal(h.slots[0].count, 5)
})

test('一天两档不被平均成中间那个假数', () => {
  const h = summarizeLiveHabit(
    [
      jst(17, 14, 30), jst(18, 14, 32), jst(19, 14, 28),
      jst(17, 18, 30), jst(18, 18, 33), jst(19, 18, 31),
    ],
    JST,
  )
  assert.equal(h.slots.length, 2, '相隔 4h 必须是两档')
  assert.deepEqual(h.slots.map((s) => s.label), ['14:30', '18:31'])
  assert.deepEqual(h.slots.map((s) => s.count), [3, 3])
  // 若被平均成一档，中位数会落在 16:30 前后 —— 那是它们不开播的时刻
  assert.ok(!h.slots.some((s) => s.label.startsWith('16:')))
})

test('只返回达标的档，未达标的档不显示但仍计入 sessions', () => {
  const h = summarizeLiveHabit(
    [
      jst(17, 13, 30), jst(18, 13, 32), jst(19, 13, 31),
      jst(18, 22, 5), jst(19, 22, 10),
    ],
    JST,
  )
  assert.equal(h.sessions, 5)
  assert.equal(h.slots.length, 1)
  assert.equal(h.slots[0].label, '13:31')
})

test('跨午夜的深夜档算同一档，不被 24 点切成两半', () => {
  const h = summarizeLiveHabit(
    [jst(17, 23, 50), jst(18, 23, 55), jst(19, 0, 10)],
    JST,
  )
  assert.equal(h.slots.length, 1, '23:50 与 00:10 只差 20 分钟')
  assert.equal(h.slots[0].count, 3)
  assert.equal(h.slots[0].label, '23:55')
})

test('时区参数决定聚类与标签：同一批时刻在 JST 与加州给出不同档', () => {
  const instants = [jst(17, 13, 30), jst(18, 13, 32), jst(19, 13, 31)]
  // 三场 13:30 / 13:32 / 13:31 的中位数是 13:31
  assert.equal(summarizeLiveHabit(instants, JST).slots[0].label, '13:31')
  // 同一批时刻在加州是前一天 21:31（PDT = UTC-7）
  assert.equal(summarizeLiveHabit(instants, PT).slots[0].label, '21:31')
})

test('非法时刻被丢掉，不污染场次数', () => {
  const h = summarizeLiveHabit(['not-a-date', jst(17, 13, 30), jst(18, 13, 31), jst(19, 13, 32)], JST)
  assert.equal(h.sessions, 3)
  assert.equal(h.slots[0].count, 3)
})

test('minutesToLabel: 越界分钟数归一（跨午夜合并会算出负数）', () => {
  assert.equal(minutesToLabel(0), '00:00')
  assert.equal(minutesToLabel(1439), '23:59')
  assert.equal(minutesToLabel(-25), '23:35')
  assert.equal(minutesToLabel(1445), '00:05')
})

test('recentSessionStarts: 去重 + 按时刻降序 + 截断', () => {
  const a = jst(17, 13, 30)
  const b = jst(18, 13, 32)
  const c = jst(19, 13, 31)
  assert.deepEqual(recentSessionStarts([a, b, b, c], 8), [c, b, a], '最近的在前,同一场只算一次')
  assert.deepEqual(recentSessionStarts([a, b, c], 2), [c, b], '按 limit 截断')
  assert.deepEqual(recentSessionStarts([null, undefined, '', 'not-a-date'], 8), [])
})
