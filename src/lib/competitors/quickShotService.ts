// src/lib/competitors/quickShotService.ts
// /api/competitors/quick-shot 的业务逻辑。照 src/lib/site/upload-service.ts 的模式：
// 不 import 'next/server'，依赖全部注入，route.ts 只负责绑定真实依赖并转成 NextResponse，
// 本文件由 node --test 直接跑。
// 鉴权只认 Authorization: Bearer —— 调用方是浏览器扩展，没有后台网页的 Cookie。
import {
  QUICK_SHOT_TAG, bearerToken, buildReadings, indexByHandle, normalizeHandle, parseCoLive,
  parseViewerSource, parseViewerText, resolveCapturedAt, shotOnFor, toViewerCount, type CompetitorRef, type ReadingRow,
} from './quickShot.ts'

export const SHOT_BUCKET = 'competitor-shots'

export interface HandlerResult {
  status: number
  body: unknown
}

export interface ShotRow {
  competitor_id: string
  image_url: string
  shot_on: string
  tag: string
  viewer_count: number | null
  captured_at: string
  created_by: string
}

export interface QuickShotDeps {
  verifyToken: (token: string) => Promise<{ id: string } | null>
  /** TikTok 平台的全部竞品（含子级成员）；查询失败返回 null。 */
  listCompetitors: () => Promise<CompetitorRef[] | null>
  validateImage: (file: { type: string; size: number }) => { ok: true } | { ok: false; error: 'type' | 'size' }
  uploadImage: (bucket: string, file: File) => Promise<{ url: string; error: null } | { url: null; error: 'upload_failed' }>
  /** 同一上传人、同一竞品、同一读数时刻已有的截图 id（重试去重用）；没有返回 null。 */
  findShot: (createdBy: string, competitorId: string, capturedAtIso: string) => Promise<string | null>
  insertShot: (row: ShotRow) => Promise<{ id: string } | null>
  insertReadings: (rows: ReadingRow[]) => Promise<boolean>
  /** created_by=userId、tag=live_manual、shot_on=当天 的截图数；查询失败返回 null。 */
  countTodayUploads: (userId: string, shotOn: string) => Promise<number | null>
  now: () => number
}

function fail(status: number, error: string): HandlerResult {
  return { status, body: { data: null, error } }
}

// 截图写进去之后的依赖调用都走这里：抛错也只退回兜底值，不能让「已经写成功」变成整体失败
async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

async function authenticate(deps: QuickShotDeps, req: Request): Promise<{ id: string } | null> {
  const token = bearerToken(req.headers.get('authorization'))
  return token ? deps.verifyToken(token) : null
}

export function createQuickShotHandlers(deps: QuickShotDeps) {
  async function post(req: Request): Promise<HandlerResult> {
    const user = await authenticate(deps, req)
    if (!user) return fail(401, 'unauthorized')

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return fail(400, 'invalid_form_data')
    }

    const file = form.get('file')
    if (!(file instanceof File)) return fail(400, 'file_required')
    const validated = deps.validateImage(file)
    if (!validated.ok) return fail(400, validated.error === 'type' ? 'invalid_type' : 'file_too_large')

    const handle = normalizeHandle(form.get('handle'))
    if (!handle) return fail(400, 'handle_required')

    const competitors = await deps.listCompetitors()
    if (!competitors) return fail(500, 'db_error')
    const library = indexByHandle(competitors)
    const target = library.get(handle)
    // 不在库就什么都不写——截图要挂在某个竞品名下，没有归属的图不入桶
    if (!target) return fail(404, 'not_in_library')

    const capturedAt = resolveCapturedAt(form.get('captured_at'), deps.now())
    const capturedAtIso = new Date(capturedAt).toISOString()
    const shotOn = shotOnFor(capturedAt)
    // 当前房间人数原文同样过 16 字符闸门：超长按「没读到」处理，不喂给人数解析、不入库
    const viewerText = parseViewerText(form.get('viewer_text'))

    // 重试幂等：第一次其实全部写成功、只是响应在路上丢了，人点重试时同一读数时刻会再来一次——
    // 不重复传桶、不重复写截图；读数照常补写（route 层是 upsert 忽略重复），
    // 顺带把上次 207 没写进去的读数补上
    const existingId = await deps.findShot(user.id, target.id, capturedAtIso)
    let shotId: string
    if (existingId) {
      shotId = existingId
    } else {
      const uploaded = await deps.uploadImage(SHOT_BUCKET, file)
      if (uploaded.url === null) return fail(500, 'upload_failed')

      const shot = await deps.insertShot({
        competitor_id: target.id,
        image_url: uploaded.url,
        shot_on: shotOn,
        tag: QUICK_SHOT_TAG,
        viewer_count: toViewerCount(viewerText),
        captured_at: capturedAtIso,
        created_by: user.id,
      })
      if (!shot) return fail(500, 'db_error')
      shotId = shot.id
    }

    const readings = buildReadings({
      library,
      current: { competitorId: target.id, viewerText, viewerSource: parseViewerSource(form.get('viewer_source')) },
      coLive: parseCoLive(form.get('co_live')),
      capturedAtIso,
      shotId,
      userId: user.id,
    })
    const readingsOk = readings.length === 0 || (await safely(() => deps.insertReadings(readings), false))
    // 「今天」与 GET 同一口径：服务器当下的日本时间日期，不是读数时刻的日期
    const todayUploads = await safely(() => deps.countTodayUploads(user.id, shotOnFor(deps.now())), null)

    // 截图已经写进去了：读数失败不能报整体失败（否则人会重传一张重复的），用 207 如实说部分成功
    return {
      status: readingsOk ? 201 : 207,
      body: {
        data: {
          competitor_name: target.display_name || target.handle,
          shot_id: shotId,
          readings: readingsOk ? readings.length : 0,
          today_uploads: todayUploads,
        },
        error: readingsOk ? null : 'readings_failed',
      },
    }
  }

  async function get(req: Request): Promise<HandlerResult> {
    const user = await authenticate(deps, req)
    if (!user) return fail(401, 'unauthorized')
    const todayUploads = await deps.countTodayUploads(user.id, shotOnFor(deps.now()))
    if (todayUploads === null) return fail(500, 'db_error')
    return { status: 200, body: { data: { today_uploads: todayUploads }, error: null } }
  }

  return { post, get }
}
