// 一个号的「场次」有两个来源，在这里合成一份：
//   - LIVE History 粘贴导入（competitor_live_sessions）：起止完整、带点赞——权威
//   - 截图推断（competitor_shots.stream_started_at）：只知开播；下播只能拿该场最后一张截图的时刻，是下限
// 同一场两边都有时（开播差 ≤ 10 分钟），以导入的为准。
// 时刻在这里统一成 toISOString() 写法：库里读回来的是 +00:00 写法，下游按字符串比较时刻，写法必须一致。
//
// 显示时区：竞品的开播时刻按**账号所在地区**的时区显示（看的是对方当地作息；且与界面语言无关，
// 三地同事读到同一个数）。地区没填才回落到界面语言时区。
// 纯函数、不读时钟，可单测。
import type { RegionCode } from './regions.ts'
import { normalizeRegion } from './regions.ts'

export const REGION_TIME_ZONE: Record<RegionCode, string> = {
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  MY: 'Asia/Kuala_Lumpur',
  TW: 'Asia/Taipei',
  CN: 'Asia/Shanghai',
  TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh',
  ID: 'Asia/Jakarta',
  // 美国横跨多个时区；竞品目前都在西海岸，先取洛杉矶，与站内英文界面的时区一致。
  US: 'America/Los_Angeles',
}

export function regionTimeZone(region: string | null | undefined, fallback: string): string {
  const code = normalizeRegion(region)
  return code ? REGION_TIME_ZONE[code] : fallback
}

/** 截图推断的开播与导入的开播差在这个范围内就认作同一场（直播间自报的开播时刻带秒，导入的是整分钟）。 */
export const SHOT_MATCH_TOLERANCE_MS = 10 * 60_000

export interface LiveSpan {
  startedAt: string
  endedAt: string
  approxEnd: boolean
  likes: number | null
  title: string
  source: 'history' | 'shot'
}

export interface LiveSpanInput {
  live_sessions?: { started_at: string; ended_at: string; likes: number | null; title: string }[] | null
  shots?: { stream_started_at: string | null; captured_at: string | null }[] | null
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function liveSpansOf(input: LiveSpanInput): LiveSpan[] {
  const spans: LiveSpan[] = []
  const histStarts: number[] = []
  for (const s of input.live_sessions ?? []) {
    const start = ms(s.started_at)
    const end = ms(s.ended_at)
    if (start == null || end == null) continue
    histStarts.push(start)
    spans.push({
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(Math.max(end, start)).toISOString(),
      approxEnd: false,
      likes: s.likes ?? null,
      title: s.title ?? '',
      source: 'history',
    })
  }

  // 同一场的多张截图报同一个 stream_started_at：按它分组，下播取最晚那张。
  const lastCapture = new Map<number, number>()
  for (const s of input.shots ?? []) {
    const start = ms(s.stream_started_at)
    if (start == null) continue
    const cap = ms(s.captured_at) ?? start
    lastCapture.set(start, Math.max(lastCapture.get(start) ?? start, cap))
  }
  // tsconfig 没开 downlevelIteration，Map 直接 for...of 会过不了 tsc，包一层 Array.from（同仓库 liveTrack.ts 的写法）。
  for (const [start, end] of Array.from(lastCapture)) {
    if (histStarts.some((h) => Math.abs(h - start) <= SHOT_MATCH_TOLERANCE_MS)) continue
    spans.push({
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(end).toISOString(),
      approxEnd: true,
      likes: null,
      title: '',
      source: 'shot',
    })
  }

  return spans.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
}

export function liveStartsOf(input: LiveSpanInput): string[] {
  return liveSpansOf(input).map((s) => s.startedAt)
}
