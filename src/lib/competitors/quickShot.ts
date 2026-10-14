// src/lib/competitors/quickShot.ts
// 浏览器扩展一键上传（/api/competitors/quick-shot）用到的纯函数。零副作用，node --test 直接测。
import { isoDateInTimeZone } from './cadence.ts'
import { parseCount } from './metrics.ts'

export const QUICK_SHOT_TAG = 'live_manual'
const SHOT_TZ = 'Asia/Tokyo'
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
const MAX_PAST_SKEW_MS = 24 * 60 * 60 * 1000
const MAX_CO_LIVE = 50
const MAX_VIEWER_TEXT = 16
const MAX_HANDLE = 64
const MAX_CO_LIVE_RAW = 16 * 1024
const MAX_INT4 = 2_147_483_647
const MAX_SHOT_KEYS = 20
const MAX_DATE_MS = 8.64e15

export type ViewerSource = 'room' | 'anchored' | 'sole'
export type CoLiveEntry = { handle: string; viewer: string | null }
export type CompetitorRef = { id: string; handle: string; display_name: string | null }
export type ReadingRow = {
  competitor_id: string
  captured_at: string
  viewer_count: number | null
  viewer_text: string | null
  source: 'current' | 'sidebar'
  viewer_source: ViewerSource | null
  shot_id: string
  created_by: string
}

/** `Authorization: Bearer <token>` → token；其它方案一律 null。 */
export function bearerToken(header: string | null): string | null {
  if (!header) return null
  const m = header.match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}

/** handle 统一成库里比对用的形态：去 @、去空白、小写。非字符串给空串。 */
export function normalizeHandle(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^@/, '').toLowerCase()
}

export type ShotKey = { key: string; handle: string; ms: number }

/**
 * 插件暂存区核对：GET 的 `shots` 参数是逗号分隔的「handle@截图毫秒」，key 原样回传给插件对号。
 * 坏项（没有 @、handle 为空或超长、毫秒不是正整数或超出 Date 范围）丢掉；只看前 20 项（插件最多暂存 9 张）。
 */
export function parseShotKeys(raw: string | null): ShotKey[] {
  if (!raw) return []
  const out: ShotKey[] = []
  for (const key of raw.split(',').slice(0, MAX_SHOT_KEYS)) {
    const at = key.lastIndexOf('@')
    if (at <= 0) continue
    const handle = normalizeHandle(key.slice(0, at))
    const msText = key.slice(at + 1)
    if (!handle || handle.length > MAX_HANDLE || !/^\d{1,16}$/.test(msText)) continue
    const ms = Number(msText)
    if (ms <= 0 || ms > MAX_DATE_MS) continue
    out.push({ key, handle, ms })
  }
  return out
}

/**
 * 读数时刻用客户端传的。插件会在本地暂存还没上传的截图，隔几个小时再补传是正常的，
 * 所以「过去」最多认 24 小时（插件那边满 23 小时 50 分就置灰不让传）；比服务器快 5 分钟以上、
 * 或早于 24 小时都视为时钟/单位异常（例如传了秒而不是毫秒），异常或非法就改用服务器时间。
 */
export function resolveCapturedAt(clientMs: unknown, serverMs: number): number {
  const raw = typeof clientMs === 'string' ? Number(clientMs) : clientMs
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return serverMs
  const n = Math.round(raw)
  if (n <= 0) return serverMs
  if (n > serverMs + MAX_FUTURE_SKEW_MS) return serverMs
  if (n < serverMs - MAX_PAST_SKEW_MS) return serverMs
  return n
}

/** 归档日期 = 读数时刻的日本时间日期，与自动巡检的 shot_on 同一口径。 */
export function shotOnFor(ms: number): string {
  return isoDateInTimeZone(new Date(ms), SHOT_TZ)
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * ms 所在日本时间自然日的起止时刻 [00:00, 次日 00:00)，用于「今日上传」按上传时刻计数。
 * 日本没有夏令时，一天恒为 24 小时，直接按 +09:00 偏移算。
 */
export function jstDayBounds(ms: number): { startIso: string; endIso: string } {
  const start = Math.floor((ms + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS
  return { startIso: new Date(start).toISOString(), endIso: new Date(start + DAY_MS).toISOString() }
}

/** 人数原文：去空白，空串给 null；超过 16 个字符视为异常（正常最长也就「1,234,567」这种），给 null —— 既防 parseCount 的正则回溯拖垮请求，也防超长文本入库。 */
export function parseViewerText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  return t && t.length <= MAX_VIEWER_TEXT ? t : null
}

/** 人数 → 能写进 integer 列的值。parseCount 会给出 1.5、25 亿这类值，写库会被 PostgREST 拒掉、每次重试都 500；不是 0..int4 上限内的整数就按「没读到」处理。 */
export function toViewerCount(text: string | null): number | null {
  const n = parseCount(text)
  return n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INT4 ? n : null
}

export function parseViewerSource(raw: unknown): ViewerSource | null {
  return raw === 'room' || raw === 'anchored' || raw === 'sole' ? raw : null
}

/** 扩展传来的 Following 侧栏条目（JSON 字符串）→ 规范化后的列表；坏数据丢弃，最多 50 条，整串超过 16KB 直接丢弃。 */
export function parseCoLive(raw: unknown): CoLiveEntry[] {
  if (typeof raw !== 'string' || raw === '' || raw.length > MAX_CO_LIVE_RAW) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: CoLiveEntry[] = []
  for (const it of parsed.slice(0, MAX_CO_LIVE)) {
    if (!it || typeof it !== 'object') continue
    const handle = normalizeHandle((it as { handle?: unknown }).handle)
    if (!handle || handle.length > MAX_HANDLE) continue
    out.push({ handle, viewer: parseViewerText((it as { viewer?: unknown }).viewer) })
  }
  return out
}

export function indexByHandle(rows: CompetitorRef[]): Map<string, CompetitorRef> {
  const m = new Map<string, CompetitorRef>()
  for (const r of rows) {
    const h = normalizeHandle(r.handle)
    if (h && !m.has(h)) m.set(h, r)
  }
  return m
}

/**
 * 一次点击要写的人数读数：
 * - current：当前房间（截图口径），人数没读到就不写；
 * - sidebar：Following 侧栏里在竞品库的账号各一行，不在库的丢掉，同一账号只留第一条。
 */
export function buildReadings(input: {
  library: Map<string, CompetitorRef>
  current: { competitorId: string; viewerText: string | null; viewerSource: ViewerSource | null }
  coLive: CoLiveEntry[]
  capturedAtIso: string
  shotId: string
  userId: string
}): ReadingRow[] {
  const base = { captured_at: input.capturedAtIso, shot_id: input.shotId, created_by: input.userId }
  const rows: ReadingRow[] = []
  if (input.current.viewerText) {
    rows.push({
      ...base,
      competitor_id: input.current.competitorId,
      viewer_count: toViewerCount(input.current.viewerText),
      viewer_text: input.current.viewerText,
      source: 'current',
      viewer_source: input.current.viewerSource,
    })
  }
  const seen = new Set<string>()
  for (const e of input.coLive) {
    const ref = input.library.get(e.handle)
    if (!ref || seen.has(ref.id)) continue
    seen.add(ref.id)
    rows.push({
      ...base,
      competitor_id: ref.id,
      viewer_count: toViewerCount(e.viewer),
      viewer_text: e.viewer,
      source: 'sidebar',
      viewer_source: null,
    })
  }
  return rows
}
