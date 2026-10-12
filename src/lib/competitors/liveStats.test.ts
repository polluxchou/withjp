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

test('calendarWeeks: 分档阈值 119/120/179/239/240 分钟，差一分钟就换档', () => {
  const located = locateSpans([
    span('2026-10-01', '06:00', '07:59'), // 119 → 1
    span('2026-10-02', '06:00', '08:00'), // 120 → 2
    span('2026-10-03', '06:00', '08:59'), // 179 → 2
    span('2026-10-04', '06:00', '09:59'), // 239 → 3
    span('2026-10-05', '06:00', '10:00'), // 240 → 4
  ], TZ)
  // today 是周一 10-05，weeks 取 2 才能把 10-01 那一周也带上
  const days = calendarWeeks(located, { today: '2026-10-05', weeks: 2, rangeFrom: '2026-09-01' }).flat()
  const level = (d: string) => days.find((x) => x.date === d)?.level
  assert.deepEqual(
    ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map(level),
    [1, 2, 2, 3, 4],
  )
})

test('calendarWeeks: 今天是周日时，最后一列仍是周一起的那一周，今天不算未来', () => {
  const wk = calendarWeeks([], { today: '2026-10-11', weeks: 2, rangeFrom: '2026-10-01' })
  assert.equal(wk[1][0].date, '2026-10-05') // 周一
  assert.equal(wk[1][6].date, '2026-10-11') // 周日即今天
  assert.equal(wk[1][6].future, false)
})

test('coverageHistogram: 按格中点判断在播，只开播几分钟不点亮整格', () => {
  const shares = (a: string, b: string) =>
    coverageHistogram(locateSpans([span('2026-09-01', a, b)], TZ), '2026-09-01', '2026-09-30').shares
  const bucketOf = (h: number, m: number) => (h * 60 + m - 360) / 15
  // 12:10–12:20 跨在 12:00 与 12:15 两格之间，但两格的中点 12:07、12:22 都不在它里面
  assert.equal(shares('12:10', '12:20').every((s) => s === 0), true)
  // 12:07–12:37：12:00 格中点 12:07 与 12:15 格中点 12:22 在播；12:30 格中点 12:37 正是下播时刻，半开区间不算
  const s = shares('12:07', '12:37')
  const lit = s.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)
  assert.deepEqual(lit, [bucketOf(12, 0), bucketOf(12, 15)])
  assert.deepEqual(lit.map((i) => s[i]), [1, 1])
})

test('coverageHistogram: 同一天多场只算一天，份额不超过 1', () => {
  const located = locateSpans([
    span('2026-09-01', '12:00', '13:00'),
    span('2026-09-01', '12:30', '14:00'), // 同一天第二场，与第一场重叠
    span('2026-09-02', '19:00', '20:00'),
  ], TZ)
  const { shares, liveDays } = coverageHistogram(located, '2026-09-01', '2026-09-30')
  assert.equal(liveDays, 2)
  assert.ok(shares.every((s) => s <= 1))
  // 12:30 格（中点 12:37）两场都在播，但只有 09-01 一天在播：1/2
  assert.equal(shares[(12 * 60 + 30 - 360) / 15], 0.5)
  // 19:00 格只有 09-02 一天在播：同样是 1/2
  assert.equal(shares[(19 * 60 - 360) / 15], 0.5)
})

test('likesSeries: 三场并列最高时，标出最早的两场', () => {
  const located = locateSpans([
    span('2026-09-03', '12:00', '13:00', 5),
    span('2026-09-01', '12:00', '13:00', 5),
    span('2026-09-02', '12:00', '13:00', 5),
  ], TZ)
  const r = likesSeries(located, '2026-09-01', '2026-09-30')
  assert.deepEqual(r.bars.map((b) => b.date), ['2026-09-01', '2026-09-02', '2026-09-03'])
  assert.deepEqual(r.bars.map((b) => b.top), [true, true, false])
})

test('inRange: 区间右端闭合，to 当天的场次要算进去', () => {
  const located = locateSpans([span('2026-09-09', '12:00', '13:00')], TZ)
  assert.equal(inRange(located, '2026-09-01', '2026-09-09').length, 1)
  assert.equal(inRange(located, '2026-09-10', '2026-09-30').length, 0)
})

test('locateSpans: 06:00 整点开播 start 为 360，不加 1440', () => {
  const [s] = locateSpans([span('2026-09-01', '06:00', '07:00')], TZ)
  assert.equal(s.start, 360)
})

test('locateSpans: 下播早于开播时 end 等于 start，时长不为负', () => {
  const [s] = locateSpans([{ ...span('2026-09-01', '12:00', '13:00'), endedAt: j('2026-09-01', '11:00') }], TZ)
  assert.equal(s.end, s.start)
})

test('locateSpans: 下播时刻无法解析时按零时长处理，end 等于 start 而不是 NaN', () => {
  const [s] = locateSpans([{ ...span('2026-09-01', '12:00', '13:00'), endedAt: 'not-a-date' }], TZ)
  assert.equal(s.end, s.start)
  assert.equal(Number.isNaN(s.end), false)
})

test('windowStats: 周均场次保留一位小数（1 场 / 3 天 → 2.3）', () => {
  const s = windowStats(locateSpans([span('2026-09-01', '12:00', '13:00')], TZ), '2026-09-01', '2026-09-03')
  assert.equal(s.perWeek, 2.3)
})

test('windowStats: 平均时长四舍五入（150 与 151 分钟的均值 150.5 → 151），中位数取偏小', () => {
  const s = windowStats(locateSpans([
    span('2026-09-01', '12:00', '14:30'), // 150
    span('2026-09-02', '12:00', '14:31'), // 151
  ], TZ), '2026-09-01', '2026-09-02')
  assert.equal(s.avgMinutes, 151)
  assert.equal(s.medianMinutes, 150)
})

// ---- 「无数据」≠「没播」：hasData 判定哪些日子我们知道播没播 ----

const daysOf = (...ds: string[]) => {
  const set = new Set(ds)
  return (d: string) => set.has(d)
}

test('windowStats: 不传 hasData 时每天都算有数据，dataDays = spanDays（原有口径不变）', () => {
  const located = locateSpans([span('2026-09-02', '12:00', '13:00')], TZ)
  const s = windowStats(located, '2026-09-01', '2026-09-07')
  assert.equal(s.dataDays, 7)
  assert.equal(s.longestGapDays, 5)
})

test('windowStats: dataDays 只数有数据的日子；有场次的日子哪怕不在 hasData 里也算有数据', () => {
  const located = locateSpans([span('2026-09-03', '12:00', '13:00')], TZ)
  const s = windowStats(located, '2026-09-01', '2026-09-07', daysOf('2026-09-01', '2026-09-02'))
  assert.equal(s.spanDays, 7)
  assert.equal(s.dataDays, 3) // 09-01、09-02 巡检过 + 09-03 有场次
  assert.equal(s.liveDays, 1)
})

test('windowStats: 最长断播只连有数据却没播的日子，无数据的日子把连续段截断', () => {
  // 09-01..09-03 有数据没播（3 天）· 09-04 无数据 · 09-05..09-06 有数据没播（2 天）· 09-07 无数据
  const s = windowStats([], '2026-09-01', '2026-09-07', daysOf('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05', '2026-09-06'))
  assert.equal(s.longestGapDays, 3)
  assert.equal(s.dataDays, 5)
})

test('windowStats: 整段都无数据时断播为 0、dataDays 为 0，周均不除以零', () => {
  const s = windowStats([], '2026-09-01', '2026-09-30', () => false)
  assert.equal(s.dataDays, 0)
  assert.equal(s.longestGapDays, 0)
  assert.equal(s.perWeek, 0)
})

test('windowStats: 周均按有数据的天数算，无数据的日子不摊薄', () => {
  // 30 天里只有 7 天有数据，其中 2 天各播 1 场 → 周均 2 场，而不是 2 / 30 × 7 ≈ 0.5
  const located = locateSpans([span('2026-09-10', '12:00', '13:00'), span('2026-09-12', '12:00', '13:00')], TZ)
  const data = daysOf('2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14')
  const s = windowStats(located, '2026-09-01', '2026-09-30', data)
  assert.equal(s.dataDays, 7)
  assert.equal(s.perWeek, 2)
})

test('calendarWeeks: 不传 hasData 时没有任何一天是无数据', () => {
  const weeks = calendarWeeks([], { today: '2026-10-08', weeks: 1, rangeFrom: '2026-10-01' })
  assert.equal(weeks[0].some((d) => d.noData), false)
})

test('calendarWeeks: 没场次且不在 hasData 里 = 无数据；有场次的日子永远有数据', () => {
  const located = locateSpans([span('2026-10-07', '12:00', '13:00')], TZ)
  // 周一 10-05 起：只有 10-06 巡检过；10-07 有场次但不在 hasData 里
  const [week] = calendarWeeks(located, { today: '2026-10-11', weeks: 1, rangeFrom: '2026-10-01' }, daysOf('2026-10-06'))
  assert.equal(week[0].noData, true)  // 10-05
  assert.equal(week[1].noData, false) // 10-06 巡检过、没播
  assert.equal(week[1].level, 0)
  assert.equal(week[2].noData, false) // 10-07 有场次
  assert.equal(week[2].level, 1)
})
