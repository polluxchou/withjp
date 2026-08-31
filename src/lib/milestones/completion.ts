// src/lib/milestones/completion.ts — 战略节点「完成日期 ⇄ 已完成状态」的唯一推导处。
//
// 不变式（全站唯一真相）：
//     status === 'completed'  ⇔  completed_date !== null
//
// 双向联动的四条规则都收在 resolveCompletion 里，API 的 POST/PATCH 一律过这道
// 关口，前端不做任何状态推导 —— 否则「表单清了日期」和「详情页点了状态」两条
// 入口会各自算出一半，落库后互相打架。
//
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名（同 src/lib/time/localeZone.ts）。
import type { MilestoneStatus } from '../types/index.ts'
import { AT_RISK_DAYS } from './constants.ts'

const DAY_MS = 86_400_000

/** 归档用日期列一律按东京业务日落库（同 scripts/live-watch/record-live-shot.mjs 的 shot_on 约定）。 */
const BUSINESS_ZONE = 'Asia/Tokyo'

export interface MilestoneDates {
  start_date: string
  target_date: string
}

export interface CompletionState {
  status: MilestoneStatus
  completed_date: string | null
}

/** patch 用「键在不在」区分「没提到」与「显式清空」，所以这里不能用可选值折叠。 */
export type CompletionPatch = Record<string, unknown>

/** 某一时刻所在的东京业务日 → `YYYY-MM-DDT00:00:00.000Z`。 */
export function tokyoDayStamp(now: Date): string {
  // en-CA 的 short date 就是 YYYY-MM-DD，省一轮 formatToParts 拼装。
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return `${ymd}T00:00:00.000Z`
}

/**
 * 用户输入的日期 → 规范化的日戳。
 *
 * - `null` / `''` / 纯空白 → `null`（= 清空）
 * - `YYYY-MM-DD` 或完整 ISO → `YYYY-MM-DDT00:00:00.000Z`
 * - 非法输入 → `undefined`，调用方据此回 400。**不能静默当成 null**：那会把
 *   「日期打错了」变成「悄悄取消完成状态」。
 */
export function normalizeDayStamp(input: unknown): string | null | undefined {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') return undefined
  const raw = input.trim()
  if (raw === '') return null

  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw)
  const parsed = new Date(dayOnly ? `${raw}T00:00:00.000Z` : raw)
  if (Number.isNaN(parsed.getTime())) return undefined
  // `2026-13-45` 这类越界值 Date 会照收并进位，回读一遍才能挡住。
  const ymd = parsed.toISOString().slice(0, 10)
  if (dayOnly && ymd !== raw) return undefined
  return `${ymd}T00:00:00.000Z`
}

/**
 * 没有完成日期时，节点该处于哪个状态。
 *
 * 与 GET /api/milestones 的时间兜底（route.ts:syncStatusByTime）同一套阈值，
 * 唯一的差别：那里从不把 planned 推进成 active（开工是人的动作，不该由定时任务
 * 代劳），而这里是「取消完成」后的重算 —— 既然它一度被标为完成，开始日期已过
 * 就按 active 还原，回到 planned 反而是丢信息。
 */
export function fallbackStatus(dates: MilestoneDates, now: Date): MilestoneStatus {
  const tick = now.getTime()
  const target = new Date(dates.target_date).getTime()
  const start = new Date(dates.start_date).getTime()

  if (Number.isFinite(target) && target < tick) return 'missed'
  if (Number.isFinite(target) && target < tick + AT_RISK_DAYS * DAY_MS) return 'at_risk'
  if (Number.isFinite(start) && start <= tick) return 'active'
  return 'planned'
}

/**
 * 把一次写入请求解析成 `{ status, completed_date }` 的最终形态。
 *
 * 优先级从上到下：
 *  1. patch 填了完成日期 → 置 completed（同批里显式给的其它状态一律让位，日期是权威）
 *  2. patch 清空了完成日期 → 显式给的非完成状态优先，否则按起止日期回退重算
 *  3. patch 只改状态：点 completed 且原本没日期 → 补今天（已有日期不覆盖）；
 *     点其它状态 → 清空日期，否则下次读回来又会被判成已完成
 *  4. 两者都没提到 → 原样返回
 *
 * 传入的 completed_date 必须已经过 normalizeDayStamp（非法值应在路由层拦掉）。
 */
export function resolveCompletion(
  prev: MilestoneDates & CompletionState,
  patch: CompletionPatch,
  now: Date,
): CompletionState {
  const hasDate = 'completed_date' in patch
  const hasStatus = 'status' in patch
  const nextStatus = hasStatus ? (patch.status as MilestoneStatus) : undefined
  const nextDate = hasDate ? normalizeDayStamp(patch.completed_date) ?? null : undefined

  if (hasDate && nextDate) {
    return { status: 'completed', completed_date: nextDate }
  }

  if (hasDate) {
    const explicit = nextStatus && nextStatus !== 'completed' ? nextStatus : null
    return { status: explicit ?? fallbackStatus(prev, now), completed_date: null }
  }

  if (hasStatus && nextStatus) {
    return nextStatus === 'completed'
      ? { status: 'completed', completed_date: prev.completed_date ?? tokyoDayStamp(now) }
      : { status: nextStatus, completed_date: null }
  }

  return { status: prev.status, completed_date: prev.completed_date }
}

/**
 * 完成日期 − 目标日期，按日界取整。正数=延期，负数=提前，0=准点；无完成日期返回 null。
 * API 在 GET 时算好随 payload 下发，列表与详情共用，前端不各算一遍。
 */
export function completionDeltaDays(
  completedDate: string | null | undefined,
  targetDate: string | null | undefined,
): number | null {
  if (!completedDate || !targetDate) return null
  const done = new Date(completedDate)
  const target = new Date(targetDate)
  if (Number.isNaN(done.getTime()) || Number.isNaN(target.getTime())) return null
  return Math.round((done.setUTCHours(0, 0, 0, 0) - target.setUTCHours(0, 0, 0, 0)) / DAY_MS)
}
