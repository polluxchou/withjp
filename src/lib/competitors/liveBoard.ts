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
import { clusterMinutes, minutesToLabel, SLOT_MIN_SESSIONS, SLOT_MIN_SHARE, type LiveSlot } from './liveSlots.ts'
import { coverageOf } from './liveCoverage.ts'
import { liveSpansOf, regionTimeZone, type LiveSpan } from './liveSessions.ts'
import {
  AXIS_END,
  AXIS_START,
  BUCKET_MINUTES,
  coverageHistogram,
  inRange,
  locateSpans,
  windowStats,
  type LocatedSpan,
} from './liveStats.ts'
import { normalizeRegion, REGION_CODES, type RegionCode } from './regions.ts'
import type { CompetitorWithHistory } from './types.ts'
import { addDaysYmd, zonedYmd, zoneOffsetMinutes } from '../time/zonedTime.ts'

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
 * 一个号在开播时段页上的全部场次（导入的 LIVE History + 截图推断，合并去重，降序）。
 * 开播场次喂哪批截图只在这里定：现在读 c.shots（看板上该号的全部截图）。
 * 相册改成窗口加载（c.shots 只剩近 10 个截图日左右）后，这里改成 shots: c.sessionShots——
 * 它是每场一条（开播时刻 + 最后一张截图时刻）的全量，不随相册窗口缩水；开播时段页的场次都经过这里，页面代码别再直接拿 c.shots 算场次。
 * 配对的另一处是 liveCoverage.patrolDaysOfBoard（巡检日的来源）。
 */
export function accountSpans(c: CompetitorWithHistory): LiveSpan[] {
  return liveSpansOf({ live_sessions: c.live_sessions, shots: c.shots })
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
        spans: accountSpans(c),
      })
      walk(c.related, company)
    }
  }
  walk(competitors, null)
  return out
}

/**
 * 在竞品树里按 id 找原始记录（递归 related）。页面上的视图拿的是摊平后的 LiveAccount，
 * 点账号开开播记录弹窗时要换回 CompetitorWithHistory（弹窗吃它）。找不到（比如刚被删掉）为 null。
 */
export function findCompetitor(list: CompetitorWithHistory[], id: string): CompetitorWithHistory | null {
  for (const c of list) {
    if (c.id === id) return c
    const hit = findCompetitor(c.related, id)
    if (hit) return hit
  }
  return null
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
  /**
   * 在调用方给的 today 之后：还没到。这种日子 status 照常是 nodata（确实没有数据），
   * 但界面要画成「未到」而不是「无数据」——画成斜线会被读成巡检漏了这些天。没传 today 时恒为 false。
   */
  future: boolean
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
 * today（YYYY-MM-DD，可省）只用来标 future，不影响 status 与汇总。
 */
export function monthRow(
  account: LiveAccount,
  month: string,
  timeZone: string,
  patrolDays: ReadonlySet<string>,
  today?: string | null,
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
    const future = today != null && date > today
    const day = (byDate.get(date) ?? []).slice().sort((a, b) => a.start - b.start || a.end - b.end)
    if (day.length === 0) {
      return { date, status: hasData(date) ? 'idle' : 'nodata', bars: [], firstStart: null, tip: [], future }
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
      future,
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

/** 一批场次的来源：只有导入 / 只有截图推断 / 两者都有 / 一场都没有。 */
export function spanSource(spans: readonly Pick<LiveSpan, 'source'>[]): 'history' | 'shot' | 'mixed' | 'none' {
  const hasHistory = spans.some((s) => s.source === 'history')
  const hasShot = spans.some((s) => s.source === 'shot')
  return hasHistory && hasShot ? 'mixed' : hasHistory ? 'history' : hasShot ? 'shot' : 'none'
}

// ---- 国家月历 ----
// 下面这些是国家月历视图的整形：选哪个国家、能翻到哪个月、怎么按公会分组、顶部三个指标。
// 都是「挑」与「数」，不碰场次本身的计算（那是上面 monthRow / monthTotals 的事）。

/**
 * 按码点比较，不用 localeCompare：后者跟着运行环境的默认语言走，服务端渲染与浏览器
 * 可能排出两种顺序，水合时整张月历的行会对不上。handle 与公司名本来就是 ASCII 为主，码点序足够。
 */
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export interface CountryOption {
  code: RegionCode
  /** 该国有场次的号数。 */
  count: number
}

/**
 * 月历的国家选项：只数有场次的号——月历只列这些，没场次的号选进去也是一片空白。
 * 地区不在清单里（未填 / 历史脏值）的号不归入任何国家。号多的在前，同数按清单顺序。
 */
export function liveCountries(accounts: LiveAccount[]): CountryOption[] {
  const counts = new Map<RegionCode, number>()
  for (const a of accounts) {
    if (a.spans.length === 0) continue
    const code = normalizeRegion(a.region)
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return REGION_CODES.filter((code) => counts.has(code))
    .map((code) => ({ code, count: counts.get(code) ?? 0 }))
    .sort((a, b) => b.count - a.count || REGION_CODES.indexOf(a.code) - REGION_CODES.indexOf(b.code))
}

/**
 * 选中的国家：请求值（URL 上的 country，大小写容错）在选项里就用它；否则日本——日区是主战场；
 * 没有日本取第一个（号最多的国家）；一个选项都没有为 null。
 */
export function pickCountry(options: CountryOption[], requested: string | null | undefined): RegionCode | null {
  const want = normalizeRegion(requested)
  if (want && options.some((o) => o.code === want)) return want
  if (options.some((o) => o.code === 'JP')) return 'JP'
  return options[0]?.code ?? null
}

/**
 * 有场次、但地区未填或不在清单里的号数：月历按国家列，这些号哪个国家都进不去。
 * 界面要明说「另有 N 个号未列出」，否则它们会悄无声息地消失。
 */
export function regionlessLiveCount(accounts: LiveAccount[]): number {
  return accounts.filter((a) => a.spans.length > 0 && normalizeRegion(a.region) == null).length
}

/** 某国有任何场次的号（月历只列这些，口径同 liveCountries）。 */
export function countryAccounts(accounts: LiveAccount[], code: RegionCode): LiveAccount[] {
  return accounts.filter((a) => a.spans.length > 0 && normalizeRegion(a.region) === code)
}

/** YYYY-MM 加减若干个月（跨年自动进退位）。格式不对原样返回。 */
export function shiftMonth(month: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return month
  const index = Number(m[1]) * 12 + Number(m[2]) - 1 + delta
  const year = Math.floor(index / 12)
  return `${String(year).padStart(4, '0')}-${String(index - year * 12 + 1).padStart(2, '0')}`
}

/**
 * 月历能翻到的范围：这批号最早一场所在月 ～ 今天所在月。
 * 最早一场按各号自己的地区时区落日期（与 monthRow 落格子同一口径，否则月初那场所在的月份可能翻不到）；
 * 地区不在清单里才用 fallbackZone。没有任何场次、或最早一场比今天还晚（时钟或数据异常）时，只有今天所在月。
 */
export function monthBounds(
  accounts: LiveAccount[],
  today: string,
  fallbackZone: string,
): { from: string; to: string } {
  const to = today.slice(0, 7)
  let from = to
  for (const a of accounts) {
    if (a.spans.length === 0) continue
    // startedAt 统一是 toISOString() 写法（见 liveSessions.ts），按字符串比较就是按时刻比较。
    let first = a.spans[0].startedAt
    for (const s of a.spans) if (s.startedAt < first) first = s.startedAt
    const month = zonedYmd(first, regionTimeZone(a.region, fallbackZone))?.slice(0, 7)
    if (month && month < from) from = month
  }
  return { from, to }
}

/** URL 上的月份收进可翻范围：缺失或格式不对取今天所在月（范围上端），越界夹到两端。 */
export function clampMonth(raw: string | null | undefined, bounds: { from: string; to: string }): string {
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return bounds.to
  if (raw < bounds.from) return bounds.from
  if (raw > bounds.to) return bounds.to
  return raw
}

/**
 * 翻月：以当前值为底（先收进范围）走 delta 个月，结果再夹回范围。
 * 「当前值」由调用方在点击那一刻从地址栏读，而不是用上一次渲染的值：连点两下时第二下还没等到重渲染，
 * 拿渲染时的值会算出同一个目标月，丢一次点击。结果再夹一次，是因为按钮的禁用态同样要等重渲染才跟上。
 */
export function stepMonth(current: string | null | undefined, delta: number, bounds: { from: string; to: string }): string {
  return clampMonth(shiftMonth(clampMonth(current, bounds), delta), bounds)
}

export interface CompanyGroup {
  /** 公会（公司）名；没登记的为 null，界面上写「未归属公会」。 */
  company: string | null
  accounts: LiveAccount[]
}

/**
 * 按公会分组：有名字的按号数降序、同数按名字；未归属的一组放最后（它不是一家公司，排进中间会被读成最大的一家）。
 * 组内按 handle 排，翻月时行序不跳。
 */
export function groupByCompany(accounts: LiveAccount[]): CompanyGroup[] {
  const map = new Map<string | null, LiveAccount[]>()
  for (const a of accounts) {
    const key = a.company || null
    const list = map.get(key)
    if (list) list.push(a)
    else map.set(key, [a])
  }
  return Array.from(map, ([company, list]) => ({
    company,
    accounts: list.slice().sort((x, y) => byCodePoint(x.handle, y.handle)),
  })).sort((a, b) => {
    if ((a.company == null) !== (b.company == null)) return a.company == null ? 1 : -1
    return b.accounts.length - a.accounts.length || byCodePoint(a.company ?? '', b.company ?? '')
  })
}

export interface CountryMonthKpis {
  /** 本月有开播的号数。 */
  active: number
  /** 月历里列出的号数。 */
  total: number
  /** 开播号数最多的一天（月内下标，0 = 1 号）；并列取最早；整月没人开播为 null。 */
  busiest: { index: number; live: number } | null
  /** 至少有一个号有数据的天数（无数据 ≠ 没播，没人有数据的日子不算进来）。 */
  dataDays: number
}

/** 国家月历顶部的三个指标，入参就是同一批号的 monthRow 结果与 monthTotals。 */
export function countryMonthKpis(
  rows: Pick<MonthRowResult, 'liveDays'>[],
  totals: { live: number; withData: number }[],
): CountryMonthKpis {
  let busiest: CountryMonthKpis['busiest'] = null
  for (let index = 0; index < totals.length; index += 1) {
    const live = totals[index].live
    // 严格大于：并列时保留先出现的（更早的）那天
    if (live > (busiest?.live ?? 0)) busiest = { index, live }
  }
  return {
    active: rows.filter((r) => r.liveDays > 0).length,
    total: rows.length,
    busiest,
    dataDays: totals.filter((d) => d.withData > 0).length,
  }
}

/**
 * 底行「当天开播号数」的热度：主色透明度 0.15 + 0.7 × live / maxLive（最多的那天 0.85）。
 * 当天没人开播为 null——不上色，和「有人播但很少」分得开。
 */
export function heatAlpha(live: number, maxLive: number): number | null {
  if (live <= 0 || maxLive <= 0) return null
  return 0.15 + 0.7 * Math.min(1, live / maxLive)
}

/**
 * 竖条在条区里的纵向位置与高度（px）：条区从上到下是 06:00 → 次日 02:00，高 stripPx。
 * - 起止先夹进轴内：越过 02:00 的下播只画到轴尾，02:00 之后才开播的场次落在轴尾。
 * - 高度不足 minPx 补到 minPx（几分钟的短场、零长度的轴尾条也要看得见），
 *   然后整根往上收，保证不从条区底边冒出去。
 * 国家月历（40px 一格）与单个直播间（一天一列）共用这一份几何。
 */
export function barBox(
  bar: { start: number; end: number },
  stripPx: number,
  minPx: number,
): { top: number; height: number } {
  const pxPerMin = stripPx / (AXIS_END - AXIS_START)
  const start = Math.min(Math.max(bar.start, AXIS_START), AXIS_END)
  const end = Math.min(Math.max(bar.end, start), AXIS_END)
  const height = Math.max(minPx, (end - start) * pxPerMin)
  return { top: Math.max(0, Math.min((start - AXIS_START) * pxPerMin, stripPx - height)), height }
}

/**
 * 一场的起止钟点（轴上分钟 → HH:mm），提示框用。nextDay = 下播落在开播的次日。
 * 凌晨开播的场次轴上 +1440，但它仍归开播当天，所以跨不跨日要从它自己的那一天量起。
 */
export function barClock(bar: MonthBar): { start: string; end: string; nextDay: boolean } {
  const dayStart = bar.start >= 1440 ? 1440 : 0
  return { start: minutesToLabel(bar.start), end: minutesToLabel(bar.end), nextDay: bar.end - dayStart >= 1440 }
}

// ---- 单个直播间 ----
// 一个号、一个月：横轴当月每天（一天一列），纵轴 06:00 → 次日 02:00，每场一根竖条，
// 条上方粗体标开播、下方灰字标下播；主档画成横向虚线。这里管「列哪些号、默认选哪个」、
// 「每根条的两个标签标不标」「主档线画在轴上哪一分钟」和顶部指标；竖条几何仍走上面的 barBox。

/**
 * 同一天下一场开播距本场下播在这么多分钟以内（含），本场不标下播：
 * 单个直播间 0.5px/分钟，50 分钟 = 25px，刚好放下「本场下播」与「下一场开播」两行 10px 字（各占 12px 行高 + 1px 间隔）。
 */
export const ROOM_END_LABEL_GAP = 50

/** 地区排序键：清单顺序（日区在前，与国家选项同一顺序），未填 / 不在清单里的排最后。 */
const regionRank = (region: string | null) => {
  const code = normalizeRegion(region)
  return code ? REGION_CODES.indexOf(code) : REGION_CODES.length
}

/**
 * 单个直播间的账号下拉：只列有场次的号（没场次的号选进去是一整张空图），按地区、再按 handle 排。
 * 地区未填的号也列：它们进不了国家月历，这里是唯一能单独看它们的地方。
 */
export function roomAccounts(accounts: LiveAccount[]): LiveAccount[] {
  return accounts
    .filter((a) => a.spans.length > 0)
    .sort((a, b) => regionRank(a.region) - regionRank(b.region) || byCodePoint(a.handle, b.handle))
}

/**
 * 选中的号：URL 上的 acc（竞品 id）在选项里就用它；否则取场次最多的号——
 * 第一次点进来就看到一张画得满的图，而不是排在第一个、只有一两场截图的号。
 * 并列取排在前面的（选项已按地区 → handle 排好，结果稳定）；一个选项都没有为 null。
 */
export function pickRoomAccount(options: LiveAccount[], requested: string | null | undefined): LiveAccount | null {
  if (requested) {
    const hit = options.find((a) => a.id === requested)
    if (hit) return hit
  }
  let best: LiveAccount | null = null
  // 严格大于：并列时保留先出现的
  for (const a of options) if (best == null || a.spans.length > best.spans.length) best = a
  return best
}

export interface RoomBar {
  /** 竖条的纵向位置与高度（px），即 barBox 的结果：起止已夹进轴内，并补了最小高度。 */
  top: number
  height: number
  /** 下播只是截图推断的下限。 */
  approx: boolean
  /** 真实起止的钟点（不夹轴）：越过 02:00 的下播照实写。 */
  start: string
  end: string
  /** 下播落在开播的次日。 */
  nextDay: boolean
  /** 真实时长（分钟）。 */
  minutes: number
  /** 条上方标不标开播时刻。 */
  showStart: boolean
  /** 条下方标不标下播时刻。 */
  showEnd: boolean
}

/**
 * 单个直播间一天里每根竖条的几何与标签取舍。入参是 monthRow 的一个格子：bars（夹轴，画条用）与
 * tip（真实起止，写字用）同序一一对应。
 *
 * - 下播标签：截图推断的场次不标（那只是最后一张截图的时刻，标出来会被当成真的下播）；
 *   同一天下一场开播距本场下播 ≤ ROOM_END_LABEL_GAP 分钟也不标，否则本场下播与下一场开播两行字叠在一起。
 *   间隔按画出来的几何量，不按真实时刻：夹到轴尾、补最小高度都会让两根条在图上比真实更近
 *   （例：01:00–01:30 之后 02:30 又开一场，真实隔 60 分钟，画出来第二根被夹到轴尾、紧贴第一根）。
 * - 开播标签：与上一个标出来的开播标签挤在一行高度（labelPx）以内就不标——同一分钟附近连开两场
 *   （断线重连、零长度的一场）时只留第一个。精确时刻提示框里都有，图上宁可少写一个也不叠字。
 */
export function roomDayBars(
  cell: Pick<MonthCell, 'bars' | 'tip'>,
  geometry: { stripPx: number; minPx: number; labelPx: number },
): RoomBar[] {
  const pxPerMin = geometry.stripPx / (AXIS_END - AXIS_START)
  const boxes = cell.bars.map((bar) => barBox(bar, geometry.stripPx, geometry.minPx))
  let lastStartTop: number | null = null
  return cell.bars.map((bar, i) => {
    const real = cell.tip[i] ?? bar
    const box = boxes[i]
    // 同一天的下一根（没有为 undefined：数组越界不报错，类型上要显式写出来）
    const nextBox = boxes[i + 1] as { top: number; height: number } | undefined
    const clock = barClock(real)
    const showStart = lastStartTop == null || box.top - lastStartTop >= geometry.labelPx
    if (showStart) lastStartTop = box.top
    // 量的是画出来的空隙：没被夹、没补高的条上它就等于「真实间隔 > ROOM_END_LABEL_GAP 分钟」；
    // 夹轴、补最小高度只会让空隙比真实更小，所以这一条同时覆盖了真实口径，不必再按真实时刻量一遍。
    const roomBelow = nextBox == null || nextBox.top - (box.top + box.height) > ROOM_END_LABEL_GAP * pxPerMin
    return {
      top: box.top,
      height: box.height,
      approx: real.approx,
      start: clock.start,
      end: clock.end,
      nextDay: clock.nextDay,
      minutes: real.end - real.start,
      showStart,
      showEnd: !real.approx && roomBelow,
    }
  })
}

/**
 * 主档参考线在轴上的位置（轴上分钟）。入参是 summarizeLiveHabit 的 slots：startMinutes 是一天里的第几分钟，
 * 跨午夜合并的档可能是负数，先归一到 0–1439；早于 06:00 的 +1440，与凌晨开播的竖条画在同一处（轴的底部）。
 * 落在 02:00 之后、06:00 之前的档轴上没有位置，不画（KPI 里照样写出来）。按位置从上到下排。
 */
export function roomSlotLines(slots: readonly Pick<LiveSlot, 'startMinutes' | 'label'>[]): { minute: number; label: string }[] {
  const out: { minute: number; label: string }[] = []
  for (const s of slots) {
    let minute = ((s.startMinutes % 1440) + 1440) % 1440
    if (minute < AXIS_START) minute += 1440
    if (minute > AXIS_END) continue
    out.push({ minute, label: s.label })
  }
  return out.sort((a, b) => a.minute - b.minute)
}

export interface RoomMonthSummary {
  /** 本月开播天数（同一天多场只算一天）。 */
  liveDays: number
  /** 本月场次数。 */
  sessions: number
  /** 本月有数据的天数（有场次的日子一定算；其余按 coverageOf，「无数据」≠「没播」）。 */
  dataDays: number
  /** 本月天数。 */
  totalDays: number
  /** 平均单场（分钟，真实时长）；本月没场次为 null。 */
  avgMinutes: number | null
  /** 本月有截图推断的场次：它们的时长是下限，平均单场偏短，界面要加注。 */
  approx: boolean
}

/**
 * 单个直播间顶部的指标（主档除外：主档按该号全部场次算，不随翻月变，见 summarizeLiveHabit）。
 * 区间统计直接用 windowStats，与开播记录弹窗同一份口径；场次按账号时区落到开播当地日期。
 * 月份格式不对时全为 0。
 */
export function roomMonthSummary(
  account: LiveAccount,
  month: string,
  timeZone: string,
  patrolDays: ReadonlySet<string>,
): RoomMonthSummary {
  const days = monthDays(month)
  if (days.length === 0) return { liveDays: 0, sessions: 0, dataDays: 0, totalDays: 0, avgMinutes: null, approx: false }
  const from = days[0]
  const to = days[days.length - 1]
  const located = locateSpans(account.spans, timeZone)
  const stats = windowStats(located, from, to, coverageOf(located, patrolDays))
  return {
    liveDays: stats.liveDays,
    sessions: stats.sessions,
    dataDays: stats.dataDays,
    totalDays: days.length,
    avgMinutes: stats.avgMinutes,
    approx: inRange(located, from, to).some((s) => s.approxEnd),
  }
}

/**
 * 导入场次（LIVE History）覆盖的当地日期范围：首场 ～ 末场。账号元信息里写「数据覆盖到哪」用——
 * 这段日子里没场次就是没播（同 coverageOf 的口径）。截图推断的场次不撑出范围；没有导入记录为 null。
 */
export function roomHistoryRange(account: LiveAccount, timeZone: string): { from: string; to: string } | null {
  let from: string | null = null
  let to: string | null = null
  for (const s of locateSpans(account.spans, timeZone)) {
    if (s.source !== 'history') continue
    if (from == null || s.date < from) from = s.date
    if (to == null || s.date > to) to = s.date
  }
  return from != null && to != null ? { from, to } : null
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

  const source = spanSource(w)

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

// ---- 时段对比（番组表） ----
// 一个号一列，按国家 → 公会分组；列里是 densityColumn 的在播密度与主档标签。这里管「列哪些号、怎么排、
// 筛选项怎么收敛」「主档标签摆在哪、哪个让位」「我方排期换到各列时区落在轴上哪一段」与几处小格式。
// 每列的 densityColumn 由视图按时区模式算好（要 useMemo，40 个号 × 90 天的场次，切筛选不该重算）。

/**
 * 开播时段页的基准时区：统一时区、页面「今天」、我方排期、以及地区不在清单里时 regionTimeZone 的回落值，
 * 全用这一个——日区是主战场，排期本身也是日本时间的钟点，shot_on 等日期列也按日区业务日落库。
 * 页面（page.tsx）、国家月历、番组表都从这里取，别各写一份 'Asia/Tokyo'。
 */
export const HOME_ZONE = 'Asia/Tokyo'

/** 番组表的统计范围：截至 today（含）的 90 个自然日。 */
export const TIMETABLE_DAYS = 90

/**
 * [today − 89, today]，两端都含。today 是页面级的日区业务日；各列按自己的时区落当地日期再比，
 * 与国家月历同一个近似——只在对方午夜前后那一两个小时差一天。
 */
export function timetableRange(today: string): { from: string; to: string } {
  return { from: addDaysYmd(today, -(TIMETABLE_DAYS - 1)), to: today }
}

/** 时区切换：统一按日本时间（跨国看同一时刻谁在播）/ 各自当地时间（看各自的作息）。 */
export type TimetableZoneMode = 'jst' | 'local'

/**
 * 一列用哪个时区。各自当地时间 = 账号地区时区；地区未填或不在清单里的号回落日本时间——
 * 这些号本来就进不了番组表（见 timetableSplit），回落值只是让算式有个确定结果。
 */
export function timetableZone(region: string | null, mode: TimetableZoneMode): string {
  return mode === 'local' ? regionTimeZone(region, HOME_ZONE) : HOME_ZONE
}

export interface TimetableColumn {
  account: LiveAccount
  /** 这一列的 densityColumn 用的时区（timetableZone 的结果），我方排期按它换算。 */
  timeZone: string
  column: DensityColumn
}

/**
 * 番组表列哪些号：区间内有场次、且地区在清单里的（按国家分组，没有国家的号放不进去）。
 * 区间内有场次、地区却不明的号另报个数：界面要明说「另有 N 个号未列出」，否则它们悄无声息地消失。
 */
export function timetableSplit(columns: TimetableColumn[]): { listed: TimetableColumn[]; regionless: number } {
  const listed: TimetableColumn[] = []
  let regionless = 0
  for (const c of columns) {
    if (c.column.sessions === 0) continue
    if (normalizeRegion(c.account.region)) listed.push(c)
    else regionless += 1
  }
  return { listed, regionless }
}

/**
 * 国家筛选：URL 值（大小写容错）在选项里就用它，否则为 null = 全部。
 * 与国家月历不同，这里缺省是全部而不是日本：番组表本来就是跨国对比用的。
 */
export function pickTimetableCountry(options: CountryOption[], requested: string | null | undefined): RegionCode | null {
  const want = normalizeRegion(requested)
  return want && options.some((o) => o.code === want) ? want : null
}

export interface GuildOption {
  /** 公会（公司）名；null = 未归属公会。 */
  company: string | null
  count: number
}

/**
 * 公会筛选项：入参是已按国家筛过的列，所以只列这个国家里有的公会，不给一个点进去是空白的选项。
 * 顺序同 groupByCompany（有名字的按号数降序，未归属最后）。
 */
export function timetableGuilds(columns: TimetableColumn[]): GuildOption[] {
  return groupByCompany(columns.map((c) => c.account)).map((g) => ({ company: g.company, count: g.accounts.length }))
}

/**
 * 公会筛选的取值，与 URL 上的 guild 同一套写法：公司名 = 这家；空串 = 未归属公会；null = 全部。
 * 未归属用空串而不是某个保留字：公司名是用户填的，任何保留字都可能撞上真名，空串不会（公司名为空即未归属）。
 * 请求值不在选项里（缺省、换了国家后这家公司不在了）回落全部；URL 原样留着，换回原来的国家时还认得。
 */
export function pickTimetableGuild(options: GuildOption[], requested: string | null | undefined): string | null {
  if (requested == null) return null
  if (requested === '') return options.some((o) => o.company == null) ? '' : null
  return options.some((o) => o.company === requested) ? requested : null
}

/** 一列的排序键：首个主档的开播分钟；没有主档的排最后。 */
const firstSlotStart = (c: TimetableColumn) => c.column.slots[0]?.start ?? Number.POSITIVE_INFINITY

export interface TimetableCompanyGroup {
  company: string | null
  columns: TimetableColumn[]
}

export interface TimetableCountryGroup {
  code: RegionCode
  /** 本组列出的号数（筛选之后）。 */
  count: number
  companies: TimetableCompanyGroup[]
}

/**
 * 番组表的列序：国家按号数降序（同数按地区清单顺序，即 liveCountries）→ 公会（groupByCompany：有名字的按号数降序、
 * 未归属最后）→ 组内按首个主档开播升序，没有主档的放最后；同一时刻按 handle（groupByCompany 已按 handle 排好，sort 稳定）。
 * 按开播排而不是按 handle 排：同一个公会里谁早播谁晚播，从左往右一眼扫过去就是时间顺序。
 * 入参是 timetableSplit 的 listed（再经筛选）：地区不明的号这里会被丢掉。下方逐号列表照这个顺序摊平。
 */
export function timetableGroups(columns: TimetableColumn[]): TimetableCountryGroup[] {
  const byId = new Map(columns.map((c) => [c.account.id, c]))
  const bySlot = (x: TimetableColumn, y: TimetableColumn) => {
    const a = firstSlotStart(x)
    const b = firstSlotStart(y)
    return a === b ? 0 : a < b ? -1 : 1
  }
  return liveCountries(columns.map((c) => c.account)).map(({ code, count }) => ({
    code,
    count,
    companies: groupByCompany(
      columns.filter((c) => normalizeRegion(c.account.region) === code).map((c) => c.account),
    ).map((g) => ({
      company: g.company,
      columns: g.accounts.flatMap((a) => byId.get(a.id) ?? []).sort(bySlot),
    })),
  }))
}

export interface TimetableLabel {
  /** 开播（白底黑框粗体）/ 下播（白底灰框）。 */
  kind: 'start' | 'end'
  /** 标签上沿（px）：中心压在对应时刻上，再收进条区——贴着轴首 / 轴尾的标签不冒出列外、不压到列头。 */
  top: number
  /** 真实钟点 HH:mm：越过 02:00 的下播照实写，只是位置夹在轴尾。 */
  time: string
  /** 该档场次数（提示框用）。 */
  count: number
  /** 开播标签专用：这一档没有下播中位（档内有截图推断的场次），界面写成「HH:mm起」。 */
  open: boolean
}

/**
 * 一列的主档标签摆在哪。入参是 densityColumn 的 slots（没有夹轴）：
 * - 开播落在 02:00–06:00（轴上 ≥ AXIS_END）或早于轴首的档，轴上没有位置，整档不标（逐号列表里照样写）。
 * - 下播越过 02:00 的夹到轴尾，钟点照实写。
 * - 先摆开播（主信息），再摆下播；任何标签与已摆的标签挤在一行高度（labelPx）以内就不摆——
 *   下播离自己的开播太近（短场）、或贴着下一档的开播时，让位给开播。精确时刻在逐号列表与提示框里都有。
 * 结果按位置从上到下排。
 */
export function timetableSlotLabels(
  slots: readonly DensitySlot[],
  geometry: { stripPx: number; labelPx: number },
): TimetableLabel[] {
  const pxPerMin = geometry.stripPx / (AXIS_END - AXIS_START)
  // 收进条区这一步顺带把越过轴尾的下播夹到了轴尾：中心超出条区底边，上沿一律落在 stripPx − labelPx。
  const topAt = (minute: number) =>
    Math.min(Math.max((minute - AXIS_START) * pxPerMin - geometry.labelPx / 2, 0), geometry.stripPx - geometry.labelPx)
  const placed: TimetableLabel[] = []
  const fits = (top: number) => placed.every((l) => Math.abs(l.top - top) >= geometry.labelPx)
  const onAxis = slots.filter((s) => s.start >= AXIS_START && s.start < AXIS_END)
  for (const s of onAxis) {
    const top = topAt(s.start)
    if (fits(top)) placed.push({ kind: 'start', top, time: minutesToLabel(s.start), count: s.count, open: s.end == null })
  }
  for (const s of onAxis) {
    if (s.end == null) continue
    const top = topAt(s.end)
    if (fits(top)) placed.push({ kind: 'end', top, time: minutesToLabel(s.end), count: s.count, open: false })
  }
  return placed.sort((a, b) => a.top - b.top)
}

/** 第 index 格（15 分钟）的起止钟点，「同时在播最多」卡片用。轴上 24 点之后照常写成 00:00 起。 */
export function bucketClock(index: number): { start: string; end: string } {
  const start = AXIS_START + index * BUCKET_MINUTES
  return { start: minutesToLabel(start), end: minutesToLabel(start + BUCKET_MINUTES) }
}

/**
 * 一格在播密度的主色透明度：0.14 + 0.78 × share（满格 0.92）。share 为 0（或算不出来）不上色——
 * 和「偶尔在播」的浅色分得开。超过 1 夹到 1（份额本不会超过 1，防御脏值）。
 */
export function densityAlpha(share: number): number | null {
  if (!(share > 0)) return null
  return 0.14 + 0.78 * Math.min(1, share)
}

/**
 * 我方排期在某个时区落在轴上哪几段（轴上分钟）。排期是日本时间的钟点；「各自当地时间」下列的时区不同，
 * 要换成该列的当地钟点才是同一时刻——否则吉隆坡那列的参考线会错开一小时，读出来的「撞不撞档」是错的。
 * 时差按 date（页面「今天」）那天算，夏令时地区（洛杉矶）随日期变。换算后跨过轴首 / 轴尾的只留轴内部分。
 */
function scheduleIn(timeZone: string, date: string): [number, number][] {
  const midnight = Date.parse(`${date}T00:00:00+09:00`)
  const out: [number, number][] = []
  for (const [a, b] of OUR_SCHEDULE_JST) {
    const instant = midnight + a * 60_000
    const shift = zoneOffsetMinutes(instant, timeZone) - zoneOffsetMinutes(instant, HOME_ZONE)
    // 一天里的钟点按 1440 循环：前一天、当天、后一天三个位置各与轴求一次交集
    for (const k of [-1440, 0, 1440]) {
      const start = Math.max(a + shift + k, AXIS_START)
      const end = Math.min(b + shift + k, AXIS_END)
      if (end > start) out.push([start, end])
    }
  }
  return out.sort((x, y) => x[0] - y[0])
}

/**
 * 番组表上的我方排期：byZone = 每个时区一份（每列按自己的时区取）；axis = 时间轴上的「我方」标签位置，
 * 只在所有列的时区换算出同一组钟点时给（统一按日本时间、或只看日韩），否则为 null——
 * 时间轴只有一根，各列钟点不一时标在哪都会对错一半的列。
 */
export function timetableSchedule(
  zones: readonly string[],
  date: string,
): { byZone: Map<string, [number, number][]>; axis: [number, number][] | null } {
  const byZone = new Map<string, [number, number][]>()
  for (const z of zones) if (!byZone.has(z)) byZone.set(z, scheduleIn(z, date))
  const all = Array.from(byZone.values())
  const key = (r: [number, number][]) => r.map((x) => x.join('-')).join(',')
  const axis = all.length > 0 && all.every((r) => key(r) === key(all[0])) ? all[0] : null
  return { byZone, axis }
}
