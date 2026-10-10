// src/lib/competitors/liveBoard.ts
// 「开播时段」一级页面（国家月历 / 单个直播间 / 时段对比番组表）用到的数据整形与计算，全是纯函数、不读时钟。
// 组件里只调这里的函数，不自己算（仓库没有 DOM 测试环境，算法只有放在 lib 里才测得到真行为）。
//
// 三件事先交代清楚：
//
// 1. 时间轴统一 06:00 → 次日 02:00：一天里的第 360 → 1560 分钟，15 分钟一格共 80 格（常量与定位见 liveStats.ts）。
//    凌晨开播（早于 06:00）在轴上 +1440，接在前一晚的尾巴后面；跨午夜的场次 end 会超过 1440。
//    这里所有「分钟」都是轴上分钟，不是 0–1439 的一天内分钟。
//
// 2. 「无数据」≠「没播」：月历里每个格子有三种状态——有场次（live）、有数据但没场次（idle，确实没播）、
//    我们根本不知道它播没播（nodata）。判据在 liveCoverage.ts 的 coverageOf，这里不重复定义：
//    有导入记录的号看首末场之间，其余号只看巡检跑过的日子。把 nodata 当成没播，只有截图的号会被算成「几乎不播」。
//
// 3. 我方排期常量 OUR_SCHEDULE_JST：来历是 liveSlots.ts 头注释里写的「我们自己的排期就是 14:30–17:30 / 18:30–21:30」，
//    日区团播普遍一天两档，番组表上画成参考线，方便对照竞品的档期。排期是日本时间的钟点，与账号地区无关。
import { clusterMinutes, SLOT_MIN_SESSIONS, SLOT_MIN_SHARE } from './liveSlots.ts'
import { coverageOf } from './liveCoverage.ts'
import { liveSpansOf, type LiveSpan } from './liveSessions.ts'
import { AXIS_END, AXIS_START, coverageHistogram, inRange, locateSpans, type LocatedSpan } from './liveStats.ts'
import type { CompetitorWithHistory } from './types.ts'

/** 我方排期（日本时间，轴上分钟）：14:30–17:30、18:30–21:30。 */
export const OUR_SCHEDULE_JST: readonly (readonly [number, number])[] = [
  [14 * 60 + 30, 17 * 60 + 30],
  [18 * 60 + 30, 21 * 60 + 30],
]

export interface LiveAccount {
  id: string
  handle: string
  name: string
  region: string | null
  /** 所属公会（公司）名；没登记为 null。 */
  company: string | null
  spans: LiveSpan[]
}

/**
 * 把看板的竞品树摊平成账号列表：先父后子、深度优先，递归展开 related。
 * - 没有任何场次的号也保留：这里只管摊平，月历里「只列有场次的号」由视图自己过滤。
 * - 子账号很少单独登记公司，查不到时沿用父账号的（逐层继承）；自己登记了就用自己的。
 * - 显示名取最新快照里的 display_name，其次档案里的，都没有才用 handle。
 */
export function flattenAccounts(
  competitors: CompetitorWithHistory[],
  companyOf: Record<string, string>,
): LiveAccount[] {
  const out: LiveAccount[] = []
  const walk = (list: CompetitorWithHistory[], inherited: string | null) => {
    for (const c of list) {
      const company = companyOf[c.id] ?? inherited
      out.push({
        id: c.id,
        handle: c.handle,
        name: c.latest?.display_name ?? c.display_name ?? c.handle,
        region: c.region,
        company,
        spans: liveSpansOf(c),
      })
      walk(c.related, company)
    }
  }
  walk(competitors, null)
  return out
}

/** YYYY-MM → 该月每一天的 YYYY-MM-DD。格式不对返回空数组，不抛。 */
export function monthDays(month: string): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return []
  const year = Number(m[1])
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) return []
  // Date.UTC(year, mon, 0) 是「下个月的第 0 天」= 本月最后一天，天数由日历决定，闰年自动对。
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const out: string[] = []
  for (let d = 1; d <= count; d += 1) out.push(`${m[1]}-${m[2]}-${String(d).padStart(2, '0')}`)
  return out
}

export interface MonthBar {
  start: number
  end: number
  approx: boolean
}

export interface MonthCell {
  date: string
  status: 'live' | 'idle' | 'nodata'
  /**
   * 画竖条用：轴上分钟，已按开播升序，并夹在 [AXIS_START, AXIS_END] 内——
   * 一场 23:30 播到次日 03:30 的直播，画出来只到轴尾 02:00，不会冲出格子。
   * approx = 下播只是截图推断的下限。
   */
  bars: MonthBar[]
  /** 当天第一场的开播分钟（轴上分钟，未夹）；没场次为 null。 */
  firstStart: number | null
  /** 提示框用：同一批场次的真实起止，不夹轴（越过轴尾的下播照实写）。 */
  tip: MonthBar[]
}

export interface MonthRowResult {
  cells: MonthCell[]
  /** 本月有开播的天数（同一天多场只算一天）。 */
  liveDays: number
  /** 本月各天第一场开播分钟里最早 / 最晚的；整月没开播为 null。 */
  earliest: number | null
  latest: number | null
}

/**
 * 一个号一个月的格子矩阵。场次按账号时区落到开播当地日期（跨午夜的场次归开播那天）。
 * 本月之外的场次不进格子、不计入汇总，但导入场次仍会撑出「首末场之间都有数据」的区间（coverageOf 看全部场次）。
 */
export function monthRow(
  account: LiveAccount,
  month: string,
  timeZone: string,
  patrolDays: ReadonlySet<string>,
): MonthRowResult {
  const located = locateSpans(account.spans, timeZone)
  const hasData = coverageOf(located, patrolDays)
  const byDate = new Map<string, LocatedSpan[]>()
  for (const s of located) {
    const list = byDate.get(s.date)
    if (list) list.push(s)
    else byDate.set(s.date, [s])
  }

  let liveDays = 0
  let earliest: number | null = null
  let latest: number | null = null
  const cells = monthDays(month).map((date): MonthCell => {
    const day = (byDate.get(date) ?? []).slice().sort((a, b) => a.start - b.start || a.end - b.end)
    if (day.length === 0) {
      return { date, status: hasData(date) ? 'idle' : 'nodata', bars: [], firstStart: null, tip: [] }
    }
    const firstStart = day[0].start
    liveDays += 1
    earliest = earliest == null ? firstStart : Math.min(earliest, firstStart)
    latest = latest == null ? firstStart : Math.max(latest, firstStart)
    return {
      date,
      status: 'live',
      bars: day.map((s) => ({ start: Math.min(s.start, AXIS_END), end: Math.min(s.end, AXIS_END), approx: s.approxEnd })),
      firstStart,
      tip: day.map((s) => ({ start: s.start, end: s.end, approx: s.approxEnd })),
    }
  })
  return { cells, liveDays, earliest, latest }
}

/**
 * 逐日汇总一批号：当天开播的号数 / 当天有数据的号数（有场次或 idle 都算有数据，nodata 不算）。
 * 长度取各行里最长的一行；没有行返回空数组。
 */
export function monthTotals(rows: MonthCell[][]): { live: number; withData: number }[] {
  const days = rows.reduce((n, r) => Math.max(n, r.length), 0)
  const out: { live: number; withData: number }[] = []
  for (let i = 0; i < days; i += 1) {
    let live = 0
    let withData = 0
    for (const r of rows) {
      const status = r[i]?.status
      if (status === 'live') live += 1
      if (status === 'live' || status === 'idle') withData += 1
    }
    out.push({ live, withData })
  }
  return out
}

export interface DensitySlot {
  /** 该档开播的下中位（轴上分钟）。 */
  start: number
  /** 下播的下中位；只在该档全是导入场次时给——截图推断的下播只是下限，取中位会把档期说短。 */
  end: number | null
  count: number
}

export interface DensityColumn {
  /** BUCKETS 格，每格是「这一刻在播的天数 / 有开播的天数」。 */
  shares: number[]
  slots: DensitySlot[]
  /** 区间内的场次数。 */
  sessions: number
  source: 'history' | 'shot' | 'mixed' | 'none'
}

/** 偶数个取偏小的那个，与 liveSlots 的档内中位数同口径。入参须非空。 */
function lowerMedian(values: number[]): number {
  const v = values.slice().sort((a, b) => a - b)
  return v[Math.floor((v.length - 1) / 2)]
}

/**
 * 番组表里一个号一列的数据。区间内（账号当地日期，两端都含）的场次：
 * - shares 直接用 coverageHistogram：格子中点探测、同一天多场只算一次、分母是有开播的天数——
 *   与弹窗里的时段分布同一份口径，同一个号在两处不会给出两个样子。
 * - slots：对开播分钟聚类（clusterMinutes），按 max(SLOT_MIN_SESSIONS, ceil(n × SLOT_MIN_SHARE)) 过滤零散小档。
 *   场次不足 SLOT_MIN_SESSIONS 时门槛降到 2：截图号本来就只有寥寥几场，门槛不降就一档也标不出。
 *   start 取档内开播的下中位；end 只在该档全是导入场次时取下播的下中位。
 */
export function densityColumn(
  spans: LiveSpan[],
  opts: { from: string; to: string; timeZone: string },
): DensityColumn {
  const located = locateSpans(spans, opts.timeZone)
  const w = inRange(located, opts.from, opts.to)
  const { shares } = coverageHistogram(located, opts.from, opts.to)

  const hasHistory = w.some((s) => s.source === 'history')
  const hasShot = w.some((s) => s.source === 'shot')
  const source: DensityColumn['source'] = hasHistory && hasShot ? 'mixed' : hasHistory ? 'history' : hasShot ? 'shot' : 'none'

  // 同一开播分钟可能有多场（不同日子），按开播分钟索引，聚类后才能回头找到每档里的场次。
  const byStart = new Map<number, LocatedSpan[]>()
  for (const s of w) {
    const list = byStart.get(s.start)
    if (list) list.push(s)
    else byStart.set(s.start, [s])
  }
  const floor = w.length < SLOT_MIN_SESSIONS ? 2 : Math.max(SLOT_MIN_SESSIONS, Math.ceil(w.length * SLOT_MIN_SHARE))
  const groups = clusterMinutes(w.map((s) => s.start).sort((a, b) => a - b))

  const slots: DensitySlot[] = []
  for (const g of groups) {
    if (g.length < floor) continue
    // clusterMinutes 绕过 24 点合并时，末组会减一天（出现 < AXIS_START 的值）；
    // 它们对应轴上 +1440 的原始值。这里记下每个值相对原始值的平移，下播也按同一个平移换到本档的坐标系里。
    const members: LocatedSpan[] = []
    const ends: number[] = []
    for (const v of Array.from(new Set(g))) {
      const axisValue = v < AXIS_START ? v + 1440 : v
      for (const s of byStart.get(axisValue) ?? []) {
        members.push(s)
        ends.push(s.end + (v - axisValue))
      }
    }
    let start = lowerMedian(g)
    let end: number | null = members.every((s) => s.source === 'history') ? lowerMedian(ends) : null
    // 绕缝合并后中位数可能落到 06:00 之前，拉回轴内（[AXIS_START, AXIS_START + 1440)），下播同步平移。
    if (start < AXIS_START) {
      start += 1440
      if (end != null) end += 1440
    }
    slots.push({ start, end, count: g.length })
  }
  slots.sort((a, b) => a.start - b.start)

  return { shares, slots, sessions: w.length, source }
}

/**
 * 同时在播最多的那一格：每格统计 share ≥ threshold 的列数，取最多的；并列取最早；全无返回 null。
 * 门槛含等号（恰好 0.3 算「常在播」）；份额是 n/d 算出来的，与字面量 0.3 同为最近的 double，不会漏掉。
 */
export function peakBucket(columns: number[][], threshold = 0.3): { index: number; count: number } | null {
  const n = columns.reduce((m, c) => Math.max(m, c.length), 0)
  let best: { index: number; count: number } | null = null
  for (let i = 0; i < n; i += 1) {
    let count = 0
    for (const c of columns) if (c[i] >= threshold) count += 1
    // 严格大于：并列时保留先出现的（最早的）那一格
    if (count > (best?.count ?? 0)) best = { index: i, count }
  }
  return best
}
