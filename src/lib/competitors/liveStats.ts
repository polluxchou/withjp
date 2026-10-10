// src/lib/competitors/liveStats.ts
// 开播记录弹窗里的指标、日历、时段分布、点赞序列。纯函数、不读时钟（today 由调用方注入）。
// 轴统一 06:00 → 次日 02:00（一天里的第 360 → 1560 分钟），15 分钟一格，共 80 格。
import type { LiveSpan } from './liveSessions.ts'
import { addDaysYmd, minuteOfDayInZone, weekdayOfYmd, zonedYmd } from '../time/zonedTime.ts'

export const AXIS_START = 360
export const AXIS_END = 1560
export const BUCKET_MINUTES = 15
export const BUCKETS = (AXIS_END - AXIS_START) / BUCKET_MINUTES

/**
 * 带上「开播当地日期」与轴坐标的场次。
 * date 是开播当地日期；start 落在 [360, 1800)；end = start + 时长（分钟）。
 */
export interface LocatedSpan extends LiveSpan {
  date: string
  start: number
  end: number
}

/**
 * 给每场定位：日期、轴上的起止。
 * - date 取开播当地日期。跨午夜的场次归属开播那天，不因为下播跨到次日就拆成两天。
 * - 凌晨开播（早于 06:00）在轴上画到 24 点之后：+1440，让它接在前一晚的尾巴后面，
 *   而不是跑到轴最左边；归属日期仍是开播当地日期。
 * - end 用时长推出来，而不是直接取下播的当地分钟，所以跨午夜时 end 会超过 1440。
 */
export function locateSpans(spans: LiveSpan[], timeZone: string): LocatedSpan[] {
  const out: LocatedSpan[] = []
  for (const s of spans) {
    const date = zonedYmd(s.startedAt, timeZone)
    const minute = minuteOfDayInZone(s.startedAt, timeZone)
    if (date == null || minute == null) continue
    const start = minute < AXIS_START ? minute + 1440 : minute
    // 下播时刻解析不了（脏数据）时按零时长处理：NaN 一旦进了 end，直方图与日历会静默错位，比少算一段时长更难发现。
    const endMs = Date.parse(s.endedAt)
    const dur = Number.isNaN(endMs) ? 0 : Math.max(0, Math.round((endMs - Date.parse(s.startedAt)) / 60_000))
    out.push({ ...s, date, start, end: start + dur })
  }
  return out
}

/** 日期落在 [from, to] 闭区间内的场次。日期是 YYYY-MM-DD，直接按字符串比较即可。 */
export function inRange(located: LocatedSpan[], from: string, to: string): LocatedSpan[] {
  return located.filter((s) => s.date >= from && s.date <= to)
}

/**
 * 中位数：偶数个取偏小的那个。与 liveSlots 的中位数口径一致，
 * 这样弹窗里的「中位时长」和档期里的时刻取法不会互相打架。
 */
function lowerMedian(values: number[]): number | null {
  if (!values.length) return null
  const v = values.slice().sort((a, b) => a - b)
  return v[Math.floor((v.length - 1) / 2)]
}

/** 保留一位小数。每周场次数这种比值用它，免得界面上出现一长串小数。 */
function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/** [from, to] 闭区间内逐日列出 YYYY-MM-DD。 */
function daysBetweenInclusive(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) out.push(d)
  return out
}

export interface LiveWindowStats {
  /** 场次数 */
  sessions: number
  /** 有开播的天数（同一天多场只算一天） */
  liveDays: number
  /** 区间总天数（含首尾） */
  spanDays: number
  /** 平均时长（分钟）；无场次为 null */
  avgMinutes: number | null
  /** 中位时长（分钟）；无场次为 null */
  medianMinutes: number | null
  totalMinutes: number
  /** 区间内最长连续无场次天数 */
  longestGapDays: number
  /** 中位点赞；只算 likes 非 null 的场次 */
  medianLikes: number | null
  /** 周均场次，保留一位小数 */
  perWeek: number
}

/**
 * 区间内的汇总指标。
 * - spanDays 按整个区间算，不只算有场次的日子：周均场次要的是「每周播几场」，
 *   分母得是区间天数，否则只播过一两天的号会被算得很高。
 * - longestGapDays 是区间内最长连续无场次天数，用来看断播的最长一段。
 */
export function windowStats(located: LocatedSpan[], from: string, to: string): LiveWindowStats {
  const w = inRange(located, from, to)
  const days = daysBetweenInclusive(from, to)
  const live = new Set(w.map((s) => s.date))
  let run = 0
  let gap = 0
  for (const d of days) {
    if (live.has(d)) run = 0
    else {
      run += 1
      gap = Math.max(gap, run)
    }
  }
  const minutes = w.map((s) => s.end - s.start)
  const total = minutes.reduce((a, b) => a + b, 0)
  return {
    sessions: w.length,
    liveDays: live.size,
    spanDays: days.length,
    avgMinutes: w.length ? Math.round(total / w.length) : null,
    medianMinutes: lowerMedian(minutes),
    totalMinutes: total,
    longestGapDays: gap,
    medianLikes: lowerMedian(w.map((s) => s.likes).filter((l): l is number => l != null)),
    perWeek: days.length ? round1((w.length / days.length) * 7) : 0,
  }
}

export interface CalendarDay {
  date: string
  sessions: number
  minutes: number
  /** 0 = 没播；按当天总时长分档：<120 分钟=1，<180=2，<240=3，≥240=4 */
  level: 0 | 1 | 2 | 3 | 4
  /** date > today */
  future: boolean
  /** date >= rangeFrom，即落在当前统计区间里 */
  inRange: boolean
}

/** 按当天总时长分档。没场次一律 0，哪怕时长为 0 也算「播了」所以至少是 1。 */
function levelOf(minutes: number, sessions: number): CalendarDay['level'] {
  if (!sessions) return 0
  return minutes >= 240 ? 4 : minutes >= 180 ? 3 : minutes >= 120 ? 2 : 1
}

/**
 * 日历热力图：每列一周，周一到周日；最后一列是 today 所在那一周，共 weeks 列。
 * 周一为一周之首，这一条是口径约定，调用方不用再换算。
 */
export function calendarWeeks(
  located: LocatedSpan[],
  opts: { today: string; weeks: number; rangeFrom: string },
): CalendarDay[][] {
  const byDay = new Map<string, { n: number; m: number }>()
  for (const s of located) {
    const cur = byDay.get(s.date) ?? { n: 0, m: 0 }
    byDay.set(s.date, { n: cur.n + 1, m: cur.m + (s.end - s.start) })
  }
  // weekdayOfYmd 周日为 0，换算成「距离本周一的天数」：周一 0、…、周日 6。
  const monday = addDaysYmd(opts.today, -((weekdayOfYmd(opts.today) + 6) % 7))
  const first = addDaysYmd(monday, -7 * (opts.weeks - 1))
  const cols: CalendarDay[][] = []
  for (let w = 0; w < opts.weeks; w += 1) {
    const col: CalendarDay[] = []
    for (let d = 0; d < 7; d += 1) {
      const date = addDaysYmd(first, w * 7 + d)
      const rec = byDay.get(date)
      col.push({
        date,
        sessions: rec?.n ?? 0,
        minutes: rec?.m ?? 0,
        level: levelOf(rec?.m ?? 0, rec?.n ?? 0),
        future: date > opts.today,
        inRange: date >= opts.rangeFrom,
      })
    }
    cols.push(col)
  }
  return cols
}

/**
 * 时段覆盖直方图：每格是「这一刻在播的天数 / 有场次的天数」。
 * 用格子中点（+7 分钟）代表这 15 分钟的状态：只在格子开头几分钟开播又很快下播的一场，
 * 不该把整格点亮，取起点判断就会高估。同一天多场只算一次，份额因此不会超过 1。
 */
export function coverageHistogram(located: LocatedSpan[], from: string, to: string): { shares: number[]; liveDays: number } {
  const w = inRange(located, from, to)
  const liveDays = new Set(w.map((s) => s.date)).size
  const shares: number[] = []
  for (let i = 0; i < BUCKETS; i += 1) {
    const t = AXIS_START + i * BUCKET_MINUTES + 7
    const days = new Set(w.filter((s) => s.start <= t && t < s.end).map((s) => s.date))
    shares.push(liveDays ? days.size / liveDays : 0)
  }
  return { shares, liveDays }
}

export interface LikesBar {
  startedAt: string
  date: string
  likes: number
  /** 点赞最高的两场之一；并列时取先出现的那场 */
  top: boolean
}

/**
 * 点赞序列：按开播时间升序，跳过 likes 为 null 的场次（没有点赞数据，画成 0 会误导）。
 * top 标出点赞最高的两场，方便弹窗里把它们高亮。
 */
export function likesSeries(located: LocatedSpan[], from: string, to: string): { bars: LikesBar[]; median: number | null; max: number } {
  const w = inRange(located, from, to)
    .filter((s): s is LocatedSpan & { likes: number } => s.likes != null)
    // 用时间戳相减排序，而不是字符串比较：比较器必须对相等的值返回 0，否则排序结果不确定。
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  const topIdx = w
    .map((s, i) => ({ i, l: s.likes }))
    .sort((a, b) => b.l - a.l || a.i - b.i)
    .slice(0, 2)
    .map((x) => x.i)
  return {
    bars: w.map((s, i) => ({ startedAt: s.startedAt, date: s.date, likes: s.likes, top: topIdx.includes(i) })),
    median: lowerMedian(w.map((s) => s.likes)),
    max: w.reduce((m, s) => Math.max(m, s.likes), 0),
  }
}
