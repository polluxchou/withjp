// src/lib/competitors/shotWindow.ts
// 纯函数：竞品相册「按日期窗口加载」的全部判据——全量索引、加载起点、补取时机、合并。
// 零 IO、零时钟，可单测。设计见
// docs/superpowers/specs/2026-10-10-competitor-shot-album-windowing-design.md
import { SHOT_WINDOW_SIZE, UNDATED_KEY, compareShotsForBoard, isValidShotDate } from './shotGrid.ts'
import type { BoardShot, CompetitorBoard, CompetitorShot, CompetitorWithHistory, SessionShot } from './types.ts'

/** 全量瘦查询的一行：只要归属、日期、开播时刻、截图时刻四列。 */
export type ShotIndexRow = Pick<CompetitorShot, 'competitor_id' | 'shot_on' | 'stream_started_at' | 'captured_at'>

export interface ShotIndex {
  /** 完整日期轴：有图日期升序去重；存在无日期截图时末尾追加 UNDATED_KEY。 */
  shotAxis: string[]
  /**
   * 账号 id → 截图推断的场次（每场一行，按开播时刻升序），即 CompetitorWithHistory.sessionShots。
   * 从没采到开播时刻的账号不在里面。
   */
  sessionShotsBy: Map<string, SessionShot[]>
}

const parseMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/**
 * 全量截图 → 日期轴 + 各账号的场次。
 *
 * 场次的聚合规则必须与 liveSessions.ts 里 liveSpansOf 对截图的分组完全一致——
 * 把这里的输出喂给 liveSpansOf，结果要与直接喂全部截图逐字节相同（shotWindow.test.ts 对拍钉着）：
 * 按开播时刻的毫秒值分组（读不出的跳过；同一毫秒的不同写法算一场），组内截图时刻读不出或为 null
 * 时按开播时刻算，取最大（不早于开播）。每组输出该组第一条的原始开播串 + 最大截图时刻的 toISOString。
 * 身份是 (账号, 开播时刻)：跨账号同一秒开播是两场。
 */
export function buildShotIndex(rows: ShotIndexRow[]): ShotIndex {
  const dated = new Set<string>()
  let hasUndated = false
  // 账号 id → 开播毫秒 → { 原始开播串, 最大截图毫秒 }
  const groups = new Map<string, Map<number, { raw: string; last: number }>>()
  for (const r of rows ?? []) {
    if (r.shot_on) dated.add(r.shot_on)
    else hasUndated = true
    const start = parseMs(r.stream_started_at)
    if (start == null) continue
    const cap = parseMs(r.captured_at) ?? start
    const byStart = groups.get(r.competitor_id) ?? new Map<number, { raw: string; last: number }>()
    const g = byStart.get(start)
    if (g) g.last = Math.max(g.last, cap)
    else byStart.set(start, { raw: r.stream_started_at as string, last: Math.max(start, cap) })
    groups.set(r.competitor_id, byStart)
  }
  // Array.from 而非展开：避免 Set 展开在当前 tsconfig 下触发 TS2802
  const shotAxis = Array.from(dated).sort((a, b) => a.localeCompare(b))
  if (hasUndated) shotAxis.push(UNDATED_KEY)
  const sessionShotsBy = new Map<string, SessionShot[]>()
  groups.forEach((byStart, id) => {
    const list = Array.from(byStart)
      .sort((a, b) => a[0] - b[0])
      .map(([, g]) => ({ stream_started_at: g.raw, captured_at: new Date(g.last).toISOString() }))
    sessionShotsBy.set(id, list)
  })
  return { shotAxis, sessionShotsBy }
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

/**
 * 刷新请求该带的 since。已加载起点非 null 时原样给；null 表示「全部已加载」，
 * 但不能不带参数——服务端缺省会回最近一段，翻到轴首后刷新就缩回去了。
 * 所以 null 时带上轴上第一个有图日，服务端 resolveLoadedFrom 会把它归一回 null（全部）。
 * 轴上没有有图日（空轴、只有无日期截图）时没东西可带，返回 null（不带参数）。
 */
export function refreshSince(loadedFrom: string | null, axis: string[]): string | null {
  if (loadedFrom !== null) return loadedFrom
  return datedOf(axis)[0] ?? null
}

/** 改完数据后刷新看板的请求路径：带上已加载起点，翻到历史后刷新不会被缩回首屏范围。 */
export function boardRefreshPath(loadedFrom: string | null): string {
  return loadedFrom === null ? '/api/competitors' : `/api/competitors?since=${loadedFrom}`
}

/** 补取一段截图的请求路径。 */
export function shotRangePath(range: ShotRange): string {
  return `/api/competitors/shots?from=${range.from}&before=${range.before}`
}

/**
 * 这一天的截图在不在已加载范围里。全部已加载（null）、轴为空（date 为 null）、无日期列一律算已加载：
 * 无日期截图首屏就全量带上，轴为空时本来就没有可显示的格子。
 */
export function isShotDateLoaded(date: string | null, loadedFrom: string | null): boolean {
  if (loadedFrom === null || date === null || date === UNDATED_KEY) return true
  return date >= loadedFrom
}

/** 第一个不早于 date 的有图日下标；全都早于它时返回 dated.length。 */
function lowerBound(dated: string[], date: string): number {
  let i = 0
  while (i < dated.length && dated[i] < date) i += 1
  return i
}

/**
 * 下一段该补哪里。当前屏第一天往前、已加载的有图日不足一屏时，补 [from, loadedFrom)：
 * from 取「起点再往前 SHOT_CHUNK_DAYS 天」与「当前屏再往前一屏」中较早的那个（夹到轴首），
 * 这样即使窗口一次跳很远，这一段也能把整屏盖住，不会补一小段又卡住。
 * 起点不在轴上（那天的图刚被删光）时按轴上第一个不早于它的日期定位。
 */
export function nextChunk(axis: string[], dateWindow: string[], loadedFrom: string | null): ShotRange | null {
  if (loadedFrom === null) return null
  const firstVisible = dateWindow.find((d) => d !== UNDATED_KEY)
  if (!firstVisible) return null
  const dated = datedOf(axis)
  const loadedIdx = lowerBound(dated, loadedFrom)
  if (loadedIdx === 0) return null // 轴上没有比起点更早的日期了
  const visibleIdx = lowerBound(dated, firstVisible)
  if (visibleIdx - loadedIdx >= SHOT_WINDOW_SIZE) return null
  const fromIdx = Math.max(0, Math.min(loadedIdx - SHOT_CHUNK_DAYS, visibleIdx - SHOT_WINDOW_SIZE))
  return { from: dated[fromIdx], before: loadedFrom }
}

/**
 * 把补取到的一段 [from, before) 并进看板。前提是看板的起点仍是这段的右端（before）——
 * 不是就说明请求飞行期间看板被刷新换掉了，结果已过期，原样返回，由调用方按新状态重判。
 * 只收落在区间里的行；先去掉各账号区间内已有的行再并入，所以重复合并不会出重复。
 * 找不到归属账号的行（账号刚被删）丢弃。
 */
export function mergeShotRange<S extends BoardShot>(
  board: CompetitorBoard<S>,
  rows: S[],
  range: ShotRange,
): CompetitorBoard<S> {
  if (board.shotsLoadedFrom !== range.before) return board
  const inRange = (s: S) => s.shot_on != null && s.shot_on >= range.from && s.shot_on < range.before
  const byComp = new Map<string, S[]>()
  for (const r of rows ?? []) {
    if (!inRange(r)) continue
    const arr = byComp.get(r.competitor_id) ?? []
    arr.push(r)
    byComp.set(r.competitor_id, arr)
  }
  const walk = (list: CompetitorWithHistory<S>[]): CompetitorWithHistory<S>[] =>
    list.map((c) => ({
      ...c,
      shots: [...c.shots.filter((s) => !inRange(s)), ...(byComp.get(c.id) ?? [])].sort(compareShotsForBoard),
      related: walk(c.related),
    }))
  const dated = datedOf(board.shotAxis)
  return {
    ...board,
    competitors: walk(board.competitors),
    shotsLoadedFrom: dated.length === 0 || range.from <= dated[0] ? null : range.from,
  }
}
