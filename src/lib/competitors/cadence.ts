// src/lib/competitors/cadence.ts
// 采集间隔不固定时的展示口径。纯函数、零时钟——today 一律由调用方注入。
//
// 背景：竞品主页指标名义上每周采一次，实际间隔 6～22 天不等。按周曲线把每次采集
// 归到所在的 ISO 周，但「两个点之间隔了几天」不能被周格掩盖：
//   - 涨幅：间隔 ≤ WEEKLY_MAX_DAYS 才写「/周」；更长就写真实天数，另附匀速折算的每周值
//   - 窗口首尾（5 周格，首尾隔 4 周）给一个月对比，同样写真实天数
//   - 最后一次采集距今多久：曲线右侧多一格 + 竞品公司方块上的新鲜度颜色
import { daysBetween } from './summary.ts'

/** 两次采集相隔不超过这么多天，才把涨幅写成「/周」。名义周采，实际 6～8 天都算一周。 */
export const WEEKLY_MAX_DAYS = 8

/** 新鲜度分档：≤ FRESH_DAYS 正常；≤ AGING_DAYS 提醒；再久标「待更新」。 */
export const FRESH_DAYS = 7
export const AGING_DAYS = 14

export interface CapturePoint {
  captured_on: string | null
  followers: number | null
}

export interface IntervalDelta {
  /** 区间涨幅百分比，一位小数 */
  pct: number
  /** 两次采集相隔天数 */
  days: number
  /** 匀速折算的每周涨幅；间隔 ≤ WEEKLY_MAX_DAYS 时为 null（pct 本身就是周涨幅） */
  perWeekPct: number | null
}

export interface WindowChange {
  pct: number
  days: number
  from: string
  to: string
}

export type Freshness = 'fresh' | 'aging' | 'stale'

const round1 = (n: number) => Math.round(n * 10) / 10
const ISO = /^\d{4}-\d{2}-\d{2}$/

function valid(p: CapturePoint | null | undefined): p is { captured_on: string; followers: number } {
  return !!p && typeof p.captured_on === 'string' && ISO.test(p.captured_on)
    && typeof p.followers === 'number' && Number.isFinite(p.followers)
}

/** 两次采集之间的涨幅。基数为 0、日期倒置或同一天时给 null（没有可比的区间）。 */
export function intervalDelta(prev: CapturePoint, cur: CapturePoint): IntervalDelta | null {
  if (!valid(prev) || !valid(cur) || prev.followers === 0) return null
  const days = daysBetween(prev.captured_on, cur.captured_on)
  if (!(days > 0)) return null
  const ratio = cur.followers / prev.followers
  return {
    pct: round1((ratio - 1) * 100),
    days,
    perWeekPct: days <= WEEKLY_MAX_DAYS ? null : round1((Math.pow(ratio, 7 / days) - 1) * 100),
  }
}

/**
 * 最近两次有数据的采集的涨幅。跨着缺采的周也照算——区间长短由 days 如实交代，
 * 不再像以前那样「上一周缺采就不显示」。
 */
export function latestDelta(points: CapturePoint[]): IntervalDelta | null {
  const real = (Array.isArray(points) ? points : []).filter(valid)
  if (real.length < 2) return null
  return intervalDelta(real[real.length - 2], real[real.length - 1])
}

/**
 * 窗口首尾的变化（5 周格首尾隔 4 周 ≈ 一个月）。首格或末格缺采就不给：
 * 拿窗口里第二个点充当起点，区间就不是「一个月」了。
 */
export function windowChange(slots: CapturePoint[]): WindowChange | null {
  const rows = Array.isArray(slots) ? slots : []
  if (rows.length < 2) return null
  const first = rows[0]
  const last = rows[rows.length - 1]
  const d = valid(first) && valid(last) ? intervalDelta(first, last) : null
  if (!d || !valid(first) || !valid(last)) return null
  return { pct: d.pct, days: d.days, from: first.captured_on, to: last.captured_on }
}

/** 每个采集日距它前一次采集的天数（第一个点没有前一次，不在表里）。 */
export function daysSincePrevious(points: CapturePoint[]): Map<string, { days: number; prev: string }> {
  const real = (Array.isArray(points) ? points : [])
    .filter(valid)
    .sort((a, b) => a.captured_on.localeCompare(b.captured_on))
  const out = new Map<string, { days: number; prev: string }>()
  for (let i = 1; i < real.length; i++) {
    out.set(real[i].captured_on, { days: daysBetween(real[i - 1].captured_on, real[i].captured_on), prev: real[i - 1].captured_on })
  }
  return out
}

/** 最后一次采集距今天数；日期不合法给 null。未来日期按 0 算（时区边界上可能差一天）。 */
export function daysSince(capturedOn: string | null | undefined, today: string | null | undefined): number | null {
  if (!capturedOn || !today || !ISO.test(capturedOn) || !ISO.test(today)) return null
  return Math.max(0, daysBetween(capturedOn, today))
}

/**
 * 某时区下 now 那一刻的日期 YYYY-MM-DD。服务端组件算「今天」用：服务器跑在 UTC，
 * 直接 toISOString 会在日本时间 0–9 点把今天算成昨天，而 captured_on 是日本业务日。
 */
export function isoDateInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function freshnessOf(days: number): Freshness {
  if (days <= FRESH_DAYS) return 'fresh'
  if (days <= AGING_DAYS) return 'aging'
  return 'stale'
}
