import assert from 'node:assert/strict'
import test from 'node:test'
import { liveSpansOf, liveStartsOf, regionTimeZone, REGION_TIME_ZONE } from './liveSessions.ts'
import { REGION_CODES } from './regions.ts'

const hist = (start: string, end: string, likes: number | null = 1000) =>
  ({ started_at: start, ended_at: end, likes, title: 'Sample LIVE' })
const shot = (start: string | null, cap: string | null) => ({ stream_started_at: start, captured_at: cap })

const H_START = '2026-08-20T00:04:00Z'
const H_END = '2026-08-20T02:44:00Z'
const TEN_MIN = 10 * 60_000
/** 在一个 ISO 时刻上加减毫秒，返回 toISOString 写法，便于写边界用例。 */
const at = (iso: string, deltaMs: number) => new Date(Date.parse(iso) + deltaMs).toISOString()

test('regionTimeZone: 已知地区给 IANA 时区，未填或未知回落', () => {
  assert.equal(regionTimeZone('JP', 'Asia/Shanghai'), 'Asia/Tokyo')
  assert.equal(regionTimeZone(' kr ', 'Asia/Shanghai'), 'Asia/Seoul')
  assert.equal(regionTimeZone('MY', 'Asia/Shanghai'), 'Asia/Kuala_Lumpur')
  assert.equal(regionTimeZone(null, 'Asia/Shanghai'), 'Asia/Shanghai')
  assert.equal(regionTimeZone('ZZ', 'America/Los_Angeles'), 'America/Los_Angeles')
})

test('每个地区的时区都能被 Intl 识别（前端格式化时不会抛 RangeError）', () => {
  for (const code of REGION_CODES) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: REGION_TIME_ZONE[code] }), code)
  }
})

test('只有截图：按开播时刻去重，下播取最后一张截图，标记为估计', () => {
  const spans = liveSpansOf({
    shots: [
      shot('2026-08-20T03:10:00+00:00', '2026-08-20T03:30:00+00:00'),
      shot('2026-08-20T03:10:00+00:00', '2026-08-20T04:45:00+00:00'),
      shot(null, '2026-08-20T05:00:00+00:00'),
      shot('not-a-date', '2026-08-20T05:00:00+00:00'),
    ],
  })
  assert.equal(spans.length, 1)
  assert.deepEqual(spans[0], {
    startedAt: '2026-08-20T03:10:00.000Z', endedAt: '2026-08-20T04:45:00.000Z',
    approxEnd: true, likes: null, title: '', source: 'shot',
  })
})

test('截图时刻早于开播（脏数据）时，下播取开播时刻，不出现负时长', () => {
  const [s] = liveSpansOf({ shots: [shot('2026-08-20T03:10:00Z', '2026-08-20T03:00:00Z')] })
  assert.equal(s.endedAt, s.startedAt)
})

test('导入与截图是同一场（截图开播落在导入区间内）只算一场，保留导入那条', () => {
  const spans = liveSpansOf({
    live_sessions: [hist('2026-08-22T03:17:00+00:00', '2026-08-22T05:33:00+00:00', 131800)],
    shots: [
      shot('2026-08-22T03:17:20+00:00', '2026-08-22T04:38:01+00:00'),
      shot('2026-08-23T10:15:20+00:00', '2026-08-23T12:23:10+00:00'),
    ],
  })
  assert.equal(spans.length, 2)
  assert.deepEqual(spans.map((s) => s.source), ['shot', 'history'])
  assert.equal(spans[1].likes, 131800)
  assert.equal(spans[1].approxEnd, false)
})

test('截图开播落在导入场次中途（直播断线重连）：即使晚于导入开播 10 分钟以上，也算同一场', () => {
  const spans = liveSpansOf({
    live_sessions: [hist('2026-08-22T03:00:00Z', '2026-08-22T05:00:00Z')],
    shots: [shot('2026-08-22T03:11:00Z', '2026-08-22T03:40:00Z')],
  })
  assert.equal(spans.length, 1)
  assert.equal(spans[0].source, 'history')
})

test('同一场：截图开播落在导入场次中间（中途重连）合并为 1 场', () => {
  const spans = liveSpansOf({
    live_sessions: [hist(H_START, H_END)],
    shots: [shot('2026-08-20T01:11:31Z', '2026-08-20T02:00:00Z')],
  })
  assert.equal(spans.length, 1)
  assert.equal(spans[0].source, 'history')
})

test('同一场下沿边界：截图开播恰为导入开播前 10 分钟仍合并，再早 1 毫秒就分开', () => {
  const merged = liveSpansOf({
    live_sessions: [hist(H_START, H_END)],
    shots: [shot(at(H_START, -TEN_MIN), at(H_START, 30 * 60_000))],
  })
  assert.equal(merged.length, 1)
  const kept = liveSpansOf({
    live_sessions: [hist(H_START, H_END)],
    shots: [shot(at(H_START, -TEN_MIN - 1), at(H_START, 30 * 60_000))],
  })
  assert.equal(kept.length, 2)
})

test('同一场上沿边界：截图开播恰为导入下播时刻仍合并，晚 1 毫秒就分开', () => {
  const merged = liveSpansOf({
    live_sessions: [hist(H_START, H_END)],
    shots: [shot(H_END, at(H_END, 30 * 60_000))],
  })
  assert.equal(merged.length, 1)
  const kept = liveSpansOf({
    live_sessions: [hist(H_START, H_END)],
    shots: [shot(at(H_END, 1), at(H_END, 30 * 60_000))],
  })
  assert.equal(kept.length, 2)
})

test('输出按开播时刻降序，写法统一成 toISOString；liveStartsOf 与之一致', () => {
  const input = {
    live_sessions: [hist('2026-07-13T00:06:00+00:00', '2026-07-13T02:42:00+00:00'), hist('2026-10-09T03:04:00+00:00', '2026-10-09T05:09:00+00:00')],
  }
  assert.deepEqual(liveStartsOf(input), ['2026-10-09T03:04:00.000Z', '2026-07-13T00:06:00.000Z'])
})

test('空输入 / null 字段不崩', () => {
  assert.deepEqual(liveSpansOf({}), [])
  assert.deepEqual(liveSpansOf({ live_sessions: null, shots: null }), [])
})
