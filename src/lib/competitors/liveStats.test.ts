import assert from 'node:assert/strict'
import test from 'node:test'
import type { LiveSpan } from './liveSessions.ts'
import { calendarWeeks, coverageHistogram, inRange, likesSeries, locateSpans, windowStats } from './liveStats.ts'

const TZ = 'Asia/Tokyo'
/** JST 墙上时间 → UTC ISO */
const j = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`).toISOString()
const span = (ymd: string, from: string, to: string, likes: number | null = 100, endYmd = ymd): LiveSpan => ({
  startedAt: j(ymd, from), endedAt: j(endYmd, to), approxEnd: false, likes, title: '', source: 'history',
})

test('locateSpans: 日期按开播当地日期，跨午夜的下播画到 24 点之后', () => {
  const [s] = locateSpans([span('2026-09-29', '19:19', '00:24', 1, '2026-09-30')], TZ)
  assert.equal(s.date, '2026-09-29')
  assert.equal(s.start, 19 * 60 + 19)
  assert.equal(s.end, 24 * 60 + 24)
})

test('locateSpans: 凌晨开播画在轴底部（+1440），日期仍是开播当地日期', () => {
  const [s] = locateSpans([span('2026-08-24', '00:34', '01:11')], TZ)
  assert.equal(s.date, '2026-08-24')
  assert.equal(s.start, 24 * 60 + 34)
  assert.equal(s.end, 25 * 60 + 11)
})

test('locateSpans: 同一时刻在不同时区落在不同日期', () => {
  const [s] = locateSpans([span('2026-08-24', '08:30', '10:00')], 'America/Los_Angeles')
  assert.equal(s.date, '2026-08-23')
  assert.equal(s.start, 16 * 60 + 30)
})

test('windowStats: 场次、开播天数、平均与中位时长、最长断播、点赞中位数', () => {
  const located = locateSpans([
    span('2026-09-01', '12:00', '14:00', 100),
    span('2026-09-01', '19:00', '22:00', 300),
    span('2026-09-02', '12:00', '13:00', null),
    span('2026-09-06', '12:00', '16:00', 200),
  ], TZ)
  const s = windowStats(located, '2026-09-01', '2026-09-07')
  assert.equal(s.sessions, 4)
  assert.equal(s.liveDays, 3)
  assert.equal(s.spanDays, 7)
  assert.equal(s.totalMinutes, 600)
  assert.equal(s.avgMinutes, 150)
  assert.equal(s.medianMinutes, 120)
  assert.equal(s.longestGapDays, 3) // 09-03..09-05
  assert.equal(s.medianLikes, 200)  // [100,200,300] 中位
  assert.equal(s.perWeek, 4)
})

test('windowStats: 区间内没有场次', () => {
  const s = windowStats([], '2026-09-01', '2026-09-30')
  assert.equal(s.sessions, 0)
  assert.equal(s.avgMinutes, null)
  assert.equal(s.medianLikes, null)
  assert.equal(s.longestGapDays, 30)
})

test('calendarWeeks: 最后一列是今天所在周，按当天总时长分档，未来日与范围外标记', () => {
  const located = locateSpans([
    span('2026-10-05', '12:00', '13:00'),  // 60 → 1
    span('2026-10-06', '12:00', '15:00'),  // 180 → 3
    span('2026-10-07', '19:00', '23:30'),  // 270 → 4
  ], TZ)
  const weeks = calendarWeeks(located, { today: '2026-10-08', weeks: 2, rangeFrom: '2026-10-01' })
  assert.equal(weeks.length, 2)
  assert.equal(weeks[1][0].date, '2026-10-05') // 周一
  assert.deepEqual(weeks[1].slice(0, 3).map((d) => d.level), [1, 3, 4])
  assert.equal(weeks[1][3].future, false)       // 10-08 是今天
  assert.equal(weeks[1][4].future, true)
  assert.equal(weeks[0][0].date, '2026-09-28')
  assert.equal(weeks[0][0].inRange, false)
  assert.equal(weeks[0][3].inRange, true)       // 10-01
})

test('coverageHistogram: 份额 = 该刻在播的天数 / 开播天数', () => {
  const located = locateSpans([
    span('2026-09-01', '12:00', '14:00'),
    span('2026-09-02', '12:00', '13:00'),
  ], TZ)
  const { shares, liveDays } = coverageHistogram(located, '2026-09-01', '2026-09-30')
  assert.equal(shares.length, 80)
  assert.equal(liveDays, 2)
  const idx = (h: number, m: number) => (h * 60 + m - 360) / 15
  assert.equal(shares[idx(12, 0)], 1)
  assert.equal(shares[idx(13, 15)], 0.5)
  assert.equal(shares[idx(14, 0)], 0)
})

test('likesSeries: 升序、跳过无点赞、标出最高两场与中位数', () => {
  const located = locateSpans([
    span('2026-09-03', '12:00', '13:00', 50),
    span('2026-09-01', '12:00', '13:00', 900),
    span('2026-09-02', '12:00', '13:00', null),
    span('2026-09-04', '12:00', '13:00', 400),
  ], TZ)
  const r = likesSeries(located, '2026-09-01', '2026-09-30')
  assert.deepEqual(r.bars.map((b) => b.likes), [900, 50, 400])
  assert.deepEqual(r.bars.map((b) => b.top), [true, false, true])
  assert.equal(r.median, 400)
  assert.equal(r.max, 900)
})

test('inRange: 闭区间按日期字符串比较', () => {
  const located = locateSpans([span('2026-09-01', '12:00', '13:00'), span('2026-09-10', '12:00', '13:00')], TZ)
  assert.equal(inRange(located, '2026-09-01', '2026-09-09').length, 1)
})
