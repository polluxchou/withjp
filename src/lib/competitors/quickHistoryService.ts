// src/lib/competitors/quickHistoryService.ts
// /api/competitors/quick-history 的业务逻辑：浏览器扩展在直播间读到头像弹窗里的 History 原文，
// 一键导入开播记录。2026-11 TikTok 把弹窗换成 user-select:none 的组件，人工全选复制失效，
// 改由扩展读 DOM 文字；解析与入库仍走后台「粘贴导入」同一套：parseLiveHistory + upsertLiveSessions。
// 照 quickShotService.ts 的模式：依赖全部注入、不 import next/*，node --test 直接跑。
// 鉴权只认 Authorization: Bearer —— 调用方是扩展，没有后台网页的 Cookie。
import { COMPETITORS_SCOPE, scopeAllows } from '../auth/access-scope.ts'
import { LIVE_SESSIONS_MAX_BATCH, parseLiveHistory, type LiveSessionRow } from './liveHistory.ts'
import { bearerToken, indexByHandle, normalizeHandle, type CompetitorRef } from './quickShot.ts'

/** 原文长度上限。100 场 × 每场约 80 字 ≈ 8K，留足余量也挡住误传整页 HTML。 */
export const QUICK_HISTORY_MAX_TEXT = 200_000

export interface QuickHistoryActor {
  id: string
  access_scope: string | null
}

export interface QuickHistoryDeps {
  /** 同 QuickShotDeps.verifyToken：无效 → null（401）；Auth 暂时不可用 → 抛错（503）。另带受限范围。 */
  verifyToken: (token: string) => Promise<QuickHistoryActor | null>
  listCompetitors: () => Promise<CompetitorRef[] | null>
  /** 按 (competitor_id, started_at) upsert；受限帐号改不了别人建的场次（计入 skipped）。 */
  upsertSessions: (
    competitorId: string,
    rows: LiveSessionRow[],
    actor: QuickHistoryActor,
  ) => Promise<{ inserted: number; updated: number; skipped: number } | null>
  now: () => number
}

export interface HandlerResult {
  status: number
  body: unknown
}

function fail(status: number, error: string): HandlerResult {
  return { status, body: { data: null, error } }
}

function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz === '' || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** 某时区「今天」的 YYYY-MM-DD。 */
export function todayIn(timeZone: string, ms: number): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}`
}

export function createQuickHistoryHandlers(deps: QuickHistoryDeps) {
  async function post(req: Request): Promise<HandlerResult> {
    const token = bearerToken(req.headers.get('authorization'))
    if (!token) return fail(401, 'unauthorized')
    let actor: QuickHistoryActor | null
    try {
      actor = await deps.verifyToken(token)
    } catch {
      return fail(503, 'auth_unavailable')
    }
    if (!actor) return fail(401, 'unauthorized')
    // 受限帐号只放行竞品范围（与后台粘贴导入同一口径）；不认识的范围一律拒
    if (!scopeAllows(actor.access_scope, COMPETITORS_SCOPE)) return fail(403, 'forbidden')

    let body: Record<string, unknown>
    try {
      const json = await req.json()
      if (!json || typeof json !== 'object' || Array.isArray(json)) return fail(400, 'invalid_json')
      body = json as Record<string, unknown>
    } catch {
      return fail(400, 'invalid_json')
    }

    const handle = normalizeHandle(body.handle)
    if (!handle) return fail(400, 'handle_required')
    const text = body.text
    if (typeof text !== 'string' || text.trim() === '') return fail(400, 'text_required')
    if (text.length > QUICK_HISTORY_MAX_TEXT) return fail(400, 'text_too_long')
    // 时刻是 TikTok 按浏览器本地时区渲染的：时区由扩展从那个页面读来，缺了就没法换算
    if (!validTimeZone(body.time_zone)) return fail(400, 'invalid_time_zone')
    const timeZone = body.time_zone

    const competitors = await deps.listCompetitors()
    if (!competitors) return fail(500, 'db_error')
    const target = indexByHandle(competitors).get(handle)
    if (!target) return fail(404, 'not_in_library')

    const { sessions, issues } = parseLiveHistory(text, { timeZone, today: todayIn(timeZone, deps.now()) })
    if (sessions.length === 0) {
      return { status: 422, body: { data: { issues: issues.length }, error: 'no_sessions' } }
    }
    if (sessions.length > LIVE_SESSIONS_MAX_BATCH) return fail(400, 'too_many_sessions')

    const rows: LiveSessionRow[] = sessions.map((s) => ({
      started_at: s.started_at, ended_at: s.ended_at, title: s.title, likes: s.likes,
    }))
    const saved = await deps.upsertSessions(target.id, rows, actor)
    if (!saved) return fail(500, 'db_error')

    // 列表是新→旧排的
    const dates = sessions.map((s) => s.local_date).sort()
    return {
      status: 200,
      body: {
        data: {
          competitor_name: target.display_name || target.handle,
          parsed: sessions.length,
          inserted: saved.inserted,
          updated: saved.updated,
          skipped: saved.skipped,
          issues: issues.length,
          first_date: dates[0],
          last_date: dates[dates.length - 1],
          time_zone: timeZone,
        },
        error: null,
      },
    }
  }

  return { post }
}
