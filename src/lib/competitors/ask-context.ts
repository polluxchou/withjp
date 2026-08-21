// src/lib/competitors/ask-context.ts
// 纯函数：把竞品看板压成一份喂给对话模型的结构化上下文包。
//
// 设计前提（见 docs/superpowers/specs/2026-08-20-competitor-ask-design.md）：
// 模型只负责挑数据和措辞，一次算术都不做。所以所有聚合值、差值、置信度
// 门槛都必须在这里算完——模型拿不到能自由推论的原料，就推不出错的结论。
//
// 零 IO、零时钟：now 由调用方注入，才能把跨日、跨时区的行为钉死在单测里。
import { timeZoneForLocale } from '../time/localeZone.ts'
import { recentSessionStarts, summarizeLiveHabit } from './liveSlots.ts'
import { checkProfileLanguage } from './profileLanguage.ts'
import { RULER_WINDOW_DAYS } from './regionRuler.ts'
import { STALE_DAYS, competitorName, daysBetween } from './summary.ts'
import { shotUptimeParts } from './types.ts'
import type { CompetitorBoard, CompetitorShot, CompetitorWithHistory, HistoryPoint } from './types.ts'

const DAY_MS = 86_400_000

/** 截图日期列（shot_on）按东京业务日落库，日期比较必须用同一个日历。 */
const SHOT_TZ = 'Asia/Tokyo'

export const CAPTURE_NOTE =
  '主页指标为每周人工触发采集；直播截图为半自动采集，仅在人工发起时抓取。'
  + '因此某一天没有截图记录，只代表当天没有采集，不代表未开播。'

export type Confidence = 'ok' | 'insufficient'

export interface AskCoverage {
  competitors: number
  roots: number
  withMetrics: number
  metricsDays: number
  shotDays: number
  sessionsWithStartTime: number
}

export interface AskMeta {
  todayTokyo: string
  displayTimeZone: string
  coverage: AskCoverage
  captureNote: string
}

export interface AskContext {
  meta: AskMeta
  competitors: AskCompetitor[]
}

export interface AskFollowers {
  latest: number | null
  on: string | null
  prev: number | null
  prevOn: string | null
  delta: number | null
  spanDays: number | null
  confidence: Confidence
}

export interface AskLiveSlot {
  /** HH:mm，已按 meta.displayTimeZone 换算。 */
  at: string
  sessions: number
}

export interface AskLiveHabit {
  slots: AskLiveSlot[]
  /**
   * 窗口内（windowDays 天）去重后的场次数——这是推论侧的证据，决定 slots
   * 能不能成档。不是账号总共播过多少场，那是 meta.coverage.sessionsWithStartTime。
   */
  sessionsInWindow: number
  /**
   * 最近一场开播时刻——这是硬事实，不受 windowDays 门槛限制，只挡未来时刻的
   * 脏数据（t <= now）。哪怕半年前才播过一次、早就够不上"规律"，"上一次是什么
   * 时候"这件事本身依然存在，不能因为推不出规律就连事实都不说——那会让这个
   * 字段和 meta.coverage.sessionsWithStartTime 在同一份数据包里自相矛盾。
   */
  latestStartedAt: string | null
  confidence: Confidence
  /**
   * 门槛窗口天数，直接复用 regionRuler.ts 的 RULER_WINDOW_DAYS——同一张卡片上
   * 「开播作息」与「同地区标尺」两处对同一件事的新鲜度判断绝不能各定义一份、各自跑偏。
   */
  windowDays: number
  /** 窗口内去重后最近几场的时刻（降序），给人核对这个档次是不是「新鲜」的证据。 */
  recentSessions: string[]
}

export interface AskShots {
  total: number
  /**
   * 已采集到截图的日期，降序去重，**不截断**。
   * 这是「某天没记录只代表没采集」这条口径的物证：模型必须能看到完整的
   * 采集日历，才能如实回答"那天有没有采到"，而不是被迫猜"有没有开播"。
   */
  capturedDates: string[]
  lastOn: string | null
  /** 全部截图里的在线人数峰值（不是最近一场的峰值——这是全量历史最大值）。 */
  peakViewersAllTime: number | null
  /**
   * 「已播时长」——某一张截图那一刻已经播了多久，不是这场直播总共播了多久
   * （后续可能还在播，这只是一个下限）。归属的采集时刻见 lastShotUptimeAt，
   * **不一定是 lastOn 那天**：lastOn 是最新有日期的截图，这个时长取的是全部
   * 截图里 captured_at 最大的那张——如果最新那张恰好没有开播时刻算不出时长，
   * 这里会落到更早一张身上。两个字段没有绑定关系，不能默认配对。
   */
  lastShotUptimeMinutes: number | null
  /** lastShotUptimeMinutes 所属那张截图的 captured_at，供核对它到底是哪一次采集。 */
  lastShotUptimeAt: string | null
}

export interface AskHealth {
  /** 距最近一次主页指标采集的天数；从未采集为 null。 */
  metricsAgeDays: number | null
  stale: boolean
}

export interface AskCompetitor {
  handle: string
  name: string
  region: string
  /**
   * 主页语言观测值（原样，未观测为 null）——只是辅助参考，不是权威地区。
   * 权威值仍是 region；见 profileLanguage.ts 顶部注释。
   */
  observedLanguage: string | null
  /**
   * 语言能明确推出地区、且与人工填的 region 冲突时为 true。生产库真实事故：
   * 23 个顶层竞品全被人工填成 JP，其中 3 个其实是韩国团，错了一个月没人发现
   * （见 migrations/20260819000000_competitor_snapshot_language.sql）。
   * 模型不能只拿到裸 region、把这类冲突悄悄说圆——必须能看到这面交叉校验。
   */
  regionMismatch: boolean
  isChild: boolean
  parentHandle: string | null
  members: number | null
  followers: AskFollowers
  liveHabit: AskLiveHabit
  shots: AskShots
  health: AskHealth
}

/** Date → 指定时区的 YYYY-MM-DD。不用 toISOString（那是 UTC）。 */
export function dayIn(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${at('year')}-${at('month')}-${at('day')}`
}

/**
 * 两个快照之间的跨度超过这个天数就不算「最近变化」——三个采集周期
 * （主页指标周采一次）。生产库实测全部 21 个有 ≥2 条快照的账号跨度都
 * 没超过 7 天，这个上限今天不吃掉任何真实数据，只挡未来数据断档后
 * 冒出的「跨度 309 天」这种会被读成"最近涨了六万"的假近况。
 */
export const FOLLOWERS_MAX_SPAN_DAYS = 21

const EMPTY_FOLLOWERS: AskFollowers = {
  latest: null, on: null, prev: null, prevOn: null,
  delta: null, spanDays: null, confidence: 'insufficient',
}

/**
 * history 按 captured_on 升序是 assemble.ts 的约定，但这里不依赖调用方保证——
 * 本地重新排序一次，谁传乱序进来都不会把 latest/prev 认反。
 */
export function followersOf(history: HistoryPoint[]): AskFollowers {
  const pts = history
    .filter((p): p is HistoryPoint & { followers: number } => p.followers != null)
    .slice()
    .sort((a, b) => a.captured_on.localeCompare(b.captured_on))
  if (pts.length === 0) return EMPTY_FOLLOWERS

  const last = pts[pts.length - 1]
  if (pts.length === 1) {
    return { ...EMPTY_FOLLOWERS, latest: last.followers, on: last.captured_on }
  }

  const prev = pts[pts.length - 2]
  const spanDays = daysBetween(prev.captured_on, last.captured_on)
  return {
    latest: last.followers,
    on: last.captured_on,
    prev: prev.followers,
    prevOn: prev.captured_on,
    delta: last.followers - prev.followers,
    spanDays,
    // 跨度太长时 delta/prev 仍然原样保留（事实性问题可能还想用到它们）——
    // 只是 confidence 降级，prompt 层会据此挡掉"最近怎么样"这类比较结论。
    confidence: spanDays > FOLLOWERS_MAX_SPAN_DAYS ? 'insufficient' : 'ok',
  }
}

/**
 * 开播作息。窗口只挡"这是不是规律"这一层推论（slots/sessionsInWindow/
 * recentSessions），不挡"上一次是什么时候"这个硬事实（latestStartedAt）——
 * 半年前连播三场、之后再没开播过的账号，"够不上规律"是真的，但"上一次开播
 * 是 2 月"也是真的，两者不能因为共用一次过滤就被同一刀切掉。
 * 推论侧与 regionRuler.ts 的标尺共用同一条窗口规则，两处对"新鲜"的定义
 * 不能各跑各的；事实侧只挡未来时刻的脏数据（t <= now），不设下限。
 */
function liveHabitOf(c: CompetitorWithHistory, timeZone: string, now: Date): AskLiveHabit {
  const nowMs = now.getTime()
  const cutoff = nowMs - RULER_WINDOW_DAYS * DAY_MS

  // 硬事实：只挡未来时刻的脏数据，不设下限——半年前的一场开播依然是「事实」。
  const allStarts = c.shots
    .map((s) => s.stream_started_at)
    .filter((iso): iso is string => {
      if (!iso) return false
      const t = Date.parse(iso)
      return !Number.isNaN(t) && t <= nowMs
    })
  // ISO 8601 定长同格式，字符串比较即时刻比较（同 liveSlots.ts 的做法）。
  const latestStartedAt = allStarts.length
    ? allStarts.reduce((a, b) => (b > a ? b : a))
    : null

  // 推论：窗口内的场次才够格谈"规律"，镜像 regionRuler.ts 的窗口过滤。
  const windowedStarts = allStarts.filter((iso) => Date.parse(iso) >= cutoff)
  const habit = summarizeLiveHabit(windowedStarts, timeZone)

  return {
    slots: habit.slots.map((s) => ({ at: s.label, sessions: s.count })),
    sessionsInWindow: habit.sessions,
    latestStartedAt,
    confidence: habit.slots.length > 0 ? 'ok' : 'insufficient',
    windowDays: RULER_WINDOW_DAYS,
    recentSessions: recentSessionStarts(windowedStarts, 5),
  }
}

/** 只收截图列表本身——测试也就不用为了几张图造出整棵档案树（同 summary.ts 的取舍）。 */
export function shotsOf(shots: CompetitorShot[]): AskShots {
  const dates = Array.from(
    new Set(shots.map((s) => s.shot_on).filter((d): d is string => d != null)),
  ).sort((a, b) => b.localeCompare(a))

  const viewers = shots.map((s) => s.viewer_count).filter((v): v is number => v != null)

  // 按 captured_at（采集时刻）取最大值，不按数组顺序或 shot_on（那只精确到天）——
  // shot_on 相同的同一天可能有多张截图，写入时 sort_order 恒为 0，数组顺序不可信。
  let last: { at: string; minutes: number } | null = null
  for (const s of shots) {
    const parts = shotUptimeParts(s.stream_started_at, s.captured_at)
    if (!parts || s.captured_at == null) continue
    if (last == null || s.captured_at > last.at) last = { at: s.captured_at, minutes: parts.h * 60 + parts.m }
  }

  return {
    total: shots.length,
    capturedDates: dates,
    lastOn: dates[0] ?? null,
    peakViewersAllTime: viewers.length ? Math.max(...viewers) : null,
    lastShotUptimeMinutes: last?.minutes ?? null,
    lastShotUptimeAt: last?.at ?? null,
  }
}

interface FlatEntry {
  c: CompetitorWithHistory
  parentHandle: string | null
}

/**
 * 把 related 里的子主播摊平成独立条目——它们各有自己的粉丝与开播数据，
 * 嵌套结构会让模型难以做跨账号比较。父子关系用 parentHandle 保留。
 *
 * 递归不做防环处理：依赖 assemble.ts 保证 related 是一棵无环树
 * （下探发现的子账号 parent_id 只会指向顶层竞品，不会反过来指回子孙），
 * 这个前提一旦被打破这里会死循环——这是文档而非代码修复。
 */
function flatten(list: CompetitorWithHistory[], parentHandle: string | null): FlatEntry[] {
  const out: FlatEntry[] = []
  for (const c of list) {
    out.push({ c, parentHandle })
    out.push(...flatten(c.related ?? [], c.handle))
  }
  return out
}

/**
 * 新鲜度看 c.latest.captured_on（最后一次采集，不管有没有解析出粉丝数），
 * 而不是 followers.on（最后一条有粉丝数的记录）——两者在 parseCount 解析失败、
 * 写出 followers:null 的行时会分岔。看板自己的「待更新」徽标（summary.ts 的
 * summarizeBoard）用的就是前者，这里必须对齐，否则同一屏对同一个账号
 * 新鲜不新鲜会给出两个矛盾的答案。
 */
function healthOf(latestCapturedOn: string | null, todayTokyo: string): AskHealth {
  if (latestCapturedOn == null) return { metricsAgeDays: null, stale: true }
  const age = daysBetween(latestCapturedOn, todayTokyo)
  return { metricsAgeDays: age, stale: age > STALE_DAYS }
}

export function buildAskContext(board: CompetitorBoard, now: Date, locale: string): AskContext {
  const displayTimeZone = timeZoneForLocale(locale)
  const todayTokyo = dayIn(now, SHOT_TZ)
  const flat = flatten(board.competitors, null)

  const competitors: AskCompetitor[] = flat.map(({ c, parentHandle }) => {
    const followers = followersOf(c.history)
    return {
      handle: c.handle,
      name: competitorName(c),
      region: c.region,
      observedLanguage: c.latest?.language ?? null,
      regionMismatch: checkProfileLanguage(c.latest?.language, c.region)?.mismatch ?? false,
      isChild: parentHandle != null,
      parentHandle,
      members: c.member_count,
      followers,
      liveHabit: liveHabitOf(c, displayTimeZone, now),
      shots: shotsOf(c.shots),
      health: healthOf(c.latest?.captured_on ?? null, todayTokyo),
    }
  })

  const metricsDays = new Set<string>()
  const shotDays = new Set<string>()
  const sessions = new Set<string>()
  for (const { c } of flat) {
    for (const p of c.history) metricsDays.add(p.captured_on)
    for (const s of c.shots) {
      if (s.shot_on != null) shotDays.add(s.shot_on)
      // 场次的身份是 (竞品, 开播时刻)，不是裸时刻——两个竞品凑巧在同一秒开播
      // 是真实可能发生的巧合，不该被去重塌成一场。
      if (s.stream_started_at != null) sessions.add(`${c.id}|${s.stream_started_at}`)
    }
  }

  return {
    meta: {
      todayTokyo,
      displayTimeZone,
      coverage: {
        competitors: competitors.length,
        roots: board.competitors.length,
        withMetrics: competitors.filter((x) => x.followers.latest != null).length,
        metricsDays: metricsDays.size,
        shotDays: shotDays.size,
        sessionsWithStartTime: sessions.size,
      },
      captureNote: CAPTURE_NOTE,
    },
    competitors,
  }
}
