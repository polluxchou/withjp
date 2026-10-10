// src/lib/competitors/shotWindow.ts
// 纯函数：竞品相册「按日期窗口加载」的全部判据——全量索引、加载起点、补取时机、合并。
// 零 IO、零时钟，可单测。设计见
// docs/superpowers/specs/2026-10-10-competitor-shot-album-windowing-design.md
import { UNDATED_KEY, isValidShotDate } from './shotGrid.ts'
import type { CompetitorShot } from './types.ts'

/** 全量瘦查询的一行：只要归属、日期、开播时刻三列。 */
export type ShotIndexRow = Pick<CompetitorShot, 'competitor_id' | 'shot_on' | 'stream_started_at'>

export interface ShotIndex {
  /** 完整日期轴：有图日期升序去重；存在无日期截图时末尾追加 UNDATED_KEY。 */
  shotAxis: string[]
  /** 账号 id → 全部历史里去重后的开播时刻（升序）。从没采到开播时刻的账号不在里面。 */
  sessionStartsBy: Map<string, string[]>
}

export function buildShotIndex(rows: ShotIndexRow[]): ShotIndex {
  const dated = new Set<string>()
  let hasUndated = false
  const starts = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    if (r.shot_on) dated.add(r.shot_on)
    else hasUndated = true
    if (r.stream_started_at) {
      // 同一场直播的多张截图报同一个开播时刻；身份是 (账号, 时刻)，跨账号不去重。
      const set = starts.get(r.competitor_id) ?? new Set<string>()
      set.add(r.stream_started_at)
      starts.set(r.competitor_id, set)
    }
  }
  // Array.from 而非展开：避免 Set 展开在当前 tsconfig 下触发 TS2802
  const shotAxis = Array.from(dated).sort((a, b) => a.localeCompare(b))
  if (hasUndated) shotAxis.push(UNDATED_KEY)
  const sessionStartsBy = new Map<string, string[]>()
  starts.forEach((set, id) => {
    sessionStartsBy.set(id, Array.from(set).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })
  return { shotAxis, sessionStartsBy }
}

/** 首屏与每次补取的段长：有图日的个数，正好两屏（SHOT_WINDOW_SIZE = 5）。 */
export const SHOT_CHUNK_DAYS = 10

function datedOf(axis: string[]): string[] {
  return axis.filter((d) => d !== UNDATED_KEY)
}

/**
 * 首屏加载起点：倒数第 SHOT_CHUNK_DAYS 个有图日。不超过这么多天就全取（null）。
 * 按「有图日」而不是日历日数：轴上有空档（整周没采集），按日历天切会凑不满一屏。
 */
export function initialLoadedFrom(axis: string[]): string | null {
  const dated = datedOf(axis)
  if (dated.length <= SHOT_CHUNK_DAYS) return null
  return dated[dated.length - SHOT_CHUNK_DAYS]
}

/**
 * 实际加载起点：首屏默认起点与调用方给的 since 取较早者——改完数据刷新时保住用户已翻到的范围，
 * 同时永远至少盖住默认那两屏（轴在两次请求之间变长时，旧 since 可能比新默认起点还晚）。
 * 早于或等于轴上第一天时归一成 null（= 全部）。
 */
export function resolveLoadedFrom(axis: string[], since: string | null): string | null {
  const initial = initialLoadedFrom(axis)
  if (initial === null) return null
  const from = since !== null && since < initial ? since : initial
  return from <= datedOf(axis)[0] ? null : from
}

/**
 * 截图本体查询的 PostgREST or() 过滤串：已加载 = shot_on >= loadedFrom 或无日期。
 * null（全部）也给一个恒真式而不是省掉 .or()——查询链保持同一个形状，源码断言才钉得住。
 * 入参必须先过 isValidShotDate：这串会原样拼进查询。
 */
export function loadedRangeOrFilter(loadedFrom: string | null): string {
  return loadedFrom === null
    ? 'shot_on.is.null,shot_on.not.is.null'
    : `shot_on.gte.${loadedFrom},shot_on.is.null`
}

/** GET /api/competitors 的 since：缺省为 null；给了就必须是真实存在的 YYYY-MM-DD。 */
export function parseSinceQuery(raw: string | null): { ok: true; since: string | null } | { ok: false } {
  if (raw === null) return { ok: true, since: null }
  return isValidShotDate(raw) ? { ok: true, since: raw } : { ok: false }
}

/** 一段日期 [from, before)。 */
export interface ShotRange {
  from: string
  before: string
}

/**
 * GET /api/competitors/shots 的 from / before：都必须是真实日期，且 from < before。
 * 先挡 null：isValidShotDate 对 null 放行（那是给"清空日期"留的口子），这里不能放。
 */
export function parseShotRangeQuery(
  from: string | null,
  before: string | null,
): ({ ok: true } & ShotRange) | { ok: false } {
  if (from === null || before === null) return { ok: false }
  if (!isValidShotDate(from) || !isValidShotDate(before)) return { ok: false }
  if (!(from < before)) return { ok: false }
  return { ok: true, from, before }
}

/** 改完数据后刷新看板的请求路径：带上已加载起点，翻到历史后刷新不会被缩回首屏范围。 */
export function boardRefreshPath(loadedFrom: string | null): string {
  return loadedFrom === null ? '/api/competitors' : `/api/competitors?since=${loadedFrom}`
}

/** 补取一段截图的请求路径。 */
export function shotRangePath(range: ShotRange): string {
  return `/api/competitors/shots?from=${range.from}&before=${range.before}`
}
