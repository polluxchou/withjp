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

export interface AskCompetitor {
  handle: string
  followers: AskFollowers
  liveHabit: AskLiveHabit
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

export function buildAskContext(board: CompetitorBoard, now: Date, locale: string): AskContext {
  const displayTimeZone = timeZoneForLocale(locale)
  return {
    meta: {
      todayTokyo: dayIn(now, SHOT_TZ),
      displayTimeZone,
      coverage: {
        competitors: 0, roots: board.competitors.length, withMetrics: 0,
        metricsDays: 0, shotDays: 0, sessionsWithStartTime: 0,
      },
      captureNote: CAPTURE_NOTE,
    },
    competitors: board.competitors.map((c) => ({
      handle: c.handle,
      followers: followersOf(c),
      liveHabit: liveHabitOf(c, displayTimeZone),
    })),
  }
}
