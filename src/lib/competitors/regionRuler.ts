// src/lib/competitors/regionRuler.ts
// 「同地区各账号的开播时段」标尺：把一个地区里已采到开播时刻的账号，全部摊在
// 同一条 24 小时轴上，用来回答「这家在同区里算早还是算晚」。
//
// 证据只有一种：competitor_shots.stream_started_at（直播间自报的开播时刻）。
// 人工上传的截图只有 shot_on 一个日期、没有时刻——上传时间不等于开播时间
// （深夜补传会把点打到凌晨），所以它们进不了这条轴。
//
// 每档画成「中位数 ±30 分钟」的段，而不是一个点：两周内同一档本来就会有
// 十几分钟的浮动（实测 1mb.rizz 13:29/13:31/13:42），画成点会假装精确。
//
// 纯函数、不读时钟（now 由调用方注入），可单测。
import { SLOT_MIN_SESSIONS, minutesToLabel, summarizeLiveHabit } from './liveSlots.ts'

/** 只看最近这些天：更早的档次代表不了现在的作息。 */
export const RULER_WINDOW_DAYS = 14

/** 段的半宽（分钟）。中位数 ±30 → 一段一小时。 */
export const RULER_HALF_BAND_MINUTES = 30

/** 轴的最小跨度（分钟）。数据挤在两小时内时也别把轴缩成一条缝。 */
export const RULER_MIN_SPAN_MINUTES = 480

const DAY_MINUTES = 1440
const DAY_MS = 86_400_000

export interface RulerInput {
  id: string
  handle: string
  display_name?: string | null
  region?: string | null
  latest?: { display_name?: string | null } | null
  shots?: { stream_started_at?: string | null }[]
  /** 下钻的子主播也算「已收集账号」，递归纳入。 */
  related?: RulerInput[]
}

export interface RulerBand {
  /** 段的左右边界（一天里的第几分钟），已夹到 [0, 1440]。 */
  startMinutes: number
  endMinutes: number
  /** 段中心的 HH:mm，给当前账号显示用。 */
  centerLabel: string
  /** 这一档的场次数。 */
  sessions: number
  /** 是否达到「成档」门槛（SLOT_MIN_SESSIONS）。未达标的只是推测。 */
  established: boolean
}

export interface RulerRow {
  id: string
  name: string
  handle: string
  /** 该账号在窗口内的总场次（去重后）。 */
  sessions: number
  bands: RulerBand[]
  /** 是否是鼠标当前所在那张卡的账号——标尺上要强调的那一条。 */
  current: boolean
}

export interface RegionRuler {
  region: string
  windowDays: number
  /** 轴的左右端（一天里的第几分钟）。 */
  axisStart: number
  axisEnd: number
  /** 上了轴的账号数与场次数——标题里报出来，让人知道这图有多少证据。 */
  accounts: number
  sessions: number
  /** 按首档时刻升序：轴读起来就是「谁先开播」。 */
  rows: RulerRow[]
}

function flatten(list: RulerInput[], out: RulerInput[] = []): RulerInput[] {
  for (const c of list) {
    out.push(c)
    if (c.related?.length) flatten(c.related, out)
  }
  return out
}

/** 显示名三级回退，与卡片标题一致。 */
function nameOf(c: RulerInput): string {
  return c.latest?.display_name ?? c.display_name ?? c.handle
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** 归一到 [0, 1440)：跨午夜合并出的中位数可能是负数（见 liveSlots 的注释）。 */
const normalize = (m: number) => ((m % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES

export function buildRegionRuler({
  competitors,
  region,
  timeZone,
  now,
  currentId,
}: {
  competitors: RulerInput[]
  /** 要画哪个地区（大小写/空白不敏感）。空值返回空图。 */
  region: string | null | undefined
  timeZone: string
  /** 「现在」的 ISO，用来算 14 天窗口。纯函数不读时钟。 */
  now: string
  currentId?: string
}): RegionRuler {
  const wanted = region?.trim().toUpperCase() ?? ''
  const empty: RegionRuler = {
    region: region?.trim() ?? '',
    windowDays: RULER_WINDOW_DAYS,
    axisStart: 0,
    axisEnd: DAY_MINUTES,
    accounts: 0,
    sessions: 0,
    rows: [],
  }
  if (!wanted) return empty

  const nowMs = Date.parse(now)
  if (Number.isNaN(nowMs)) return empty
  const cutoff = nowMs - RULER_WINDOW_DAYS * DAY_MS

  const rows: RulerRow[] = []
  let sessions = 0

  for (const c of flatten(competitors ?? [])) {
    if ((c.region?.trim().toUpperCase() ?? '') !== wanted) continue

    const starts = (c.shots ?? [])
      .map((s) => s.stream_started_at)
      .filter((iso): iso is string => {
        if (!iso) return false
        const t = Date.parse(iso)
        return !Number.isNaN(t) && t >= cutoff && t <= nowMs
      })
    if (!starts.length) continue

    // minSessions=1：标尺要把「只播过一次」的账号也摆上去（用浅色标成推测），
    // 否则 15 个账号里只有 4 个够 3 场，图上几乎是空的、看不出分布。
    const habit = summarizeLiveHabit(starts, timeZone, 1)
    if (!habit.slots.length) continue

    const bands: RulerBand[] = habit.slots.map((slot) => {
      const center = normalize(slot.startMinutes)
      return {
        // 跨午夜的段会被夹断（例如 00:10 的段左边界 -20 夹到 0）。日区团播的
        // 档位实测在 08:00–23:00，先接受这个近似，别为罕见情况把轴拆成两段。
        startMinutes: clamp(center - RULER_HALF_BAND_MINUTES, 0, DAY_MINUTES),
        endMinutes: clamp(center + RULER_HALF_BAND_MINUTES, 0, DAY_MINUTES),
        centerLabel: minutesToLabel(center),
        sessions: slot.count,
        established: slot.count >= SLOT_MIN_SESSIONS,
      }
    })

    sessions += habit.sessions
    rows.push({
      id: c.id,
      name: nameOf(c),
      handle: c.handle,
      sessions: habit.sessions,
      bands,
      current: !!currentId && c.id === currentId,
    })
  }

  if (!rows.length) return empty

  rows.sort((a, b) => a.bands[0].startMinutes - b.bands[0].startMinutes)

  const allStarts = rows.flatMap((r) => r.bands.map((b) => b.startMinutes))
  const allEnds = rows.flatMap((r) => r.bands.map((b) => b.endMinutes))
  let axisStart = Math.floor(Math.min(...allStarts) / 60) * 60
  let axisEnd = Math.ceil(Math.max(...allEnds) / 60) * 60

  // 跨度太小就两边对称补足，再夹进一天之内；两边都顶到头时按整天算。
  const short = RULER_MIN_SPAN_MINUTES - (axisEnd - axisStart)
  if (short > 0) {
    axisStart = clamp(axisStart - Math.ceil(short / 2), 0, DAY_MINUTES)
    axisEnd = clamp(axisEnd + Math.ceil(short / 2), 0, DAY_MINUTES)
    if (axisEnd - axisStart < RULER_MIN_SPAN_MINUTES) {
      axisStart = 0
      axisEnd = Math.max(RULER_MIN_SPAN_MINUTES, axisEnd)
    }
  }

  return {
    region: region!.trim(),
    windowDays: RULER_WINDOW_DAYS,
    axisStart,
    axisEnd,
    accounts: rows.length,
    sessions,
    rows,
  }
}

/** 轴上每隔几小时打一个刻度：跨度大就稀一点，免得标签挤在一起。 */
export function tickStepHours(spanMinutes: number): number {
  if (spanMinutes <= 360) return 1
  if (spanMinutes <= 720) return 2
  return 3
}

/** 轴上的刻度（一天里的第几分钟），含两端。 */
export function axisTicks(axisStart: number, axisEnd: number): number[] {
  const step = tickStepHours(axisEnd - axisStart) * 60
  const first = Math.ceil(axisStart / step) * step
  const ticks: number[] = []
  for (let m = first; m <= axisEnd; m += step) ticks.push(m)
  return ticks
}
