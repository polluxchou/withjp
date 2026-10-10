import assert from 'node:assert/strict'
import test from 'node:test'
import { liveSpansOf, liveStartsOf, regionTimeZone } from './liveSessions.ts'

const hist = (start: string, end: string, likes: number | null = 1000) =>
  ({ started_at: start, ended_at: end, likes, title: 'Sample LIVE' })
const shot = (start: string | null, cap: string | null) => ({ stream_started_at: start, captured_at: cap })

test('regionTimeZone: 已知地区给 IANA 时区，未填或未知回落', () => {
  assert.equal(regionTimeZone('JP', 'Asia/Shanghai'), 'Asia/Tokyo')
  assert.equal(regionTimeZone(' kr ', 'Asia/Shanghai'), 'Asia/Seoul')
  assert.equal(regionTimeZone('MY', 'Asia/Shanghai'), 'Asia/Kuala_Lumpur')
  assert.equal(regionTimeZone(null, 'Asia/Shanghai'), 'Asia/Shanghai')
  assert.equal(regionTimeZone('ZZ', 'America/Los_Angeles'), 'America/Los_Angeles')
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

test('导入与截图是同一场（±10 分钟内）只算一场，保留导入那条', () => {
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

test('相差超过 10 分钟的截图场次不被吞掉', () => {
  const spans = liveSpansOf({
    live_sessions: [hist('2026-08-22T03:00:00Z', '2026-08-22T05:00:00Z')],
    shots: [shot('2026-08-22T03:11:00Z', '2026-08-22T03:40:00Z')],
  })
  assert.equal(spans.length, 2)
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
