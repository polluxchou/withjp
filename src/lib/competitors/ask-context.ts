// src/lib/competitors/ask-context.ts
// 纯函数：把竞品看板压成一份喂给对话模型的结构化上下文包。
//
// 设计前提（见 docs/superpowers/specs/2026-08-20-competitor-ask-design.md）：
// 模型只负责挑数据和措辞，一次算术都不做。所以所有聚合值、差值、置信度
// 门槛都必须在这里算完——模型拿不到能自由推论的原料，就推不出错的结论。
//
// 零 IO、零时钟：now 由调用方注入，才能把跨日、跨时区的行为钉死在单测里。
import { timeZoneForLocale } from '../time/localeZone.ts'
import { summarizeLiveHabit } from './liveSlots.ts'
import { STALE_DAYS, competitorName } from './summary.ts'
import { shotUptimeParts } from './types.ts'
import type { CompetitorBoard, CompetitorWithHistory } from './types.ts'

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
  /** 去重后的总场次（同一场的多张截图只算一次）。 */
  sessions: number
  latestStartedAt: string | null
  confidence: Confidence
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
   * 最近一次采集时刻的「已播时长」——是截图那一刻已经播了多久，
   * 不是这场直播总共播了多久（后续可能还在播，这只是一个下限）。
   * 按 captured_at 取最大值，不依赖数组顺序：shot_on 精度只到天，同一天
   * 多张截图在库里的相对顺序不保证（两条写入路径的 sort_order 都硬编码 0）。
   */
  lastShotUptimeMinutes: number | null
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
 * 两个 YYYY-MM-DD 相差的整天数。走 Date.UTC 而不是 new Date(str)——
 * 后者按本地时区解析，跨夏令时的地区会有 ±1 天误差（同 summary.ts 的做法）。
 */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

const EMPTY_FOLLOWERS: AskFollowers = {
  latest: null, on: null, prev: null, prevOn: null,
  delta: null, spanDays: null, confidence: 'insufficient',
}

/** history 按 captured_on 升序（见 assemble.ts），所以最新的在末尾。 */
function followersOf(c: CompetitorWithHistory): AskFollowers {
  const pts = c.history.filter((p): p is typeof p & { followers: number } => p.followers != null)
  if (pts.length === 0) return EMPTY_FOLLOWERS

  const last = pts[pts.length - 1]
  if (pts.length === 1) {
    return { ...EMPTY_FOLLOWERS, latest: last.followers, on: last.captured_on }
  }

  const prev = pts[pts.length - 2]
  return {
    latest: last.followers,
    on: last.captured_on,
    prev: prev.followers,
    prevOn: prev.captured_on,
    delta: last.followers - prev.followers,
    spanDays: daysBetween(prev.captured_on, last.captured_on),
    confidence: 'ok',
  }
}

/**
 * 开播作息。门槛沿用 liveSlots 的 SLOT_MIN_SESSIONS（默认 3 场才成档）——
 * 不达标时 slots 为空，模型就没有任何可用来谈"规律"的原料，只剩最近一场这个硬事实。
 */
function liveHabitOf(c: CompetitorWithHistory, timeZone: string): AskLiveHabit {
  const habit = summarizeLiveHabit(c.shots.map((s) => s.stream_started_at), timeZone)
  return {
    slots: habit.slots.map((s) => ({ at: s.label, sessions: s.count })),
    sessions: habit.sessions,
    latestStartedAt: habit.latestStartedAt,
    confidence: habit.slots.length > 0 ? 'ok' : 'insufficient',
  }
}

function shotsOf(c: CompetitorWithHistory): AskShots {
  const dates = Array.from(
    new Set(c.shots.map((s) => s.shot_on).filter((d): d is string => d != null)),
  ).sort((a, b) => b.localeCompare(a))

  const viewers = c.shots.map((s) => s.viewer_count).filter((v): v is number => v != null)

  // 按 captured_at（采集时刻）取最大值，不按数组顺序或 shot_on（那只精确到天）——
  // shot_on 相同的同一天可能有多张截图，写入时 sort_order 恒为 0，数组顺序不可信。
  let last: { at: string; minutes: number } | null = null
  for (const s of c.shots) {
    const parts = shotUptimeParts(s.stream_started_at, s.captured_at)
    if (!parts || s.captured_at == null) continue
    if (last == null || s.captured_at > last.at) last = { at: s.captured_at, minutes: parts.h * 60 + parts.m }
  }

  return {
    total: c.shots.length,
    capturedDates: dates,
    lastOn: dates[0] ?? null,
    peakViewersAllTime: viewers.length ? Math.max(...viewers) : null,
    lastShotUptimeMinutes: last?.minutes ?? null,
  }
}

interface FlatEntry {
  c: CompetitorWithHistory
  parentHandle: string | null
}

/** 把 related 里的子主播摊平成独立条目——它们各有自己的粉丝与开播数据，
 *  嵌套结构会让模型难以做跨账号比较。父子关系用 parentHandle 保留。 */
function flatten(list: CompetitorWithHistory[], parentHandle: string | null): FlatEntry[] {
  const out: FlatEntry[] = []
  for (const c of list) {
    out.push({ c, parentHandle })
    out.push(...flatten(c.related ?? [], c.handle))
  }
  return out
}

function healthOf(f: AskFollowers, todayTokyo: string): AskHealth {
  if (f.on == null) return { metricsAgeDays: null, stale: true }
  const age = daysBetween(f.on, todayTokyo)
  return { metricsAgeDays: age, stale: age > STALE_DAYS }
}

export function buildAskContext(board: CompetitorBoard, now: Date, locale: string): AskContext {
  const displayTimeZone = timeZoneForLocale(locale)
  const todayTokyo = dayIn(now, SHOT_TZ)
  const flat = flatten(board.competitors, null)

  const competitors: AskCompetitor[] = flat.map(({ c, parentHandle }) => {
    const followers = followersOf(c)
    return {
      handle: c.handle,
      name: competitorName(c),
      region: c.region,
      isChild: parentHandle != null,
      parentHandle,
      members: c.member_count,
      followers,
      liveHabit: liveHabitOf(c, displayTimeZone),
      shots: shotsOf(c),
      health: healthOf(followers, todayTokyo),
    }
  })

  const metricsDays = new Set<string>()
  const shotDays = new Set<string>()
  const sessions = new Set<string>()
  for (const { c } of flat) {
    for (const p of c.history) metricsDays.add(p.captured_on)
    for (const s of c.shots) {
      if (s.shot_on != null) shotDays.add(s.shot_on)
      if (s.stream_started_at != null) sessions.add(s.stream_started_at)
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
