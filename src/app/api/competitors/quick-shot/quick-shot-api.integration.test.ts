import assert from 'node:assert/strict'
import test from 'node:test'
import { createQuickShotHandlers, type QuickShotDeps, type ShotRow } from '../../../../lib/competitors/quickShotService.ts'
import type { CompetitorRef, ReadingRow } from '../../../../lib/competitors/quickShot.ts'

// ============================================================
// 覆盖范围：扩展一键上传接口只认 Bearer 令牌（没有后台网页的 Cookie）。
//   1. 无令牌 / 令牌无效 → 401，什么都不碰
//   2. 文件缺失 / 类型不符 / 过大、handle 缺失 → 400，不上传
//   3. handle 不在竞品库 → 404 not_in_library；库查询失败 → 500 db_error（不能当成 404）
//   4. 正常 → 201：截图行字段（tag/上传人/日本时间日期/人数）+ 读数行 + 今日计数
//   5. 截图写入后的一切失败（读数写入失败/抛错、计数失败/抛错）都不能报整体失败
//   6. 重试幂等：同一读数时刻已有截图 → 不重复传桶、不重复写截图，读数照常补写
//   7. 日期口径：shot_on 取读数时刻的日本时间日期，今日计数取服务器当下的日本时间日期
//   8. 本机时钟快了 → 用服务器时间；人数原文超长 / 非整数 → 按未读到处理
//   9. GET 今日计数
// ============================================================

const SERVER_NOW = Date.UTC(2026, 9, 9, 15, 30) // 日本时间 2026-10-10 00:30 —— 与 UTC 不在同一天，日期写成 UTC 会被抓到
const LIB: CompetitorRef[] = [
  { id: 'c-dear', handle: '1mb.dear', display_name: '1MB DEAR' },
  { id: 'c-uni', handle: 'uni.chuuu', display_name: 'UNi Chuuu' },
]
const IMAGE_URL = 'https://x.supabase.co/storage/v1/object/public/competitor-shots/a.webp'

function makeDeps(over: Partial<QuickShotDeps> = {}, existingShotId: string | null = null) {
  const calls = {
    listed: 0,
    uploads: 0,
    finds: [] as [string, string, string][],
    shots: [] as ShotRow[],
    readings: [] as ReadingRow[][],
    counts: [] as [string, string][],
  }
  const deps: QuickShotDeps = {
    verifyToken: async (t) => (t === 'good' ? { id: 'user-1' } : null),
    listCompetitors: async () => { calls.listed += 1; return LIB },
    validateImage: (f) => (f.type === 'image/webp' ? { ok: true } : { ok: false, error: 'type' }),
    uploadImage: async () => { calls.uploads += 1; return { url: IMAGE_URL, error: null } },
    findShot: async (createdBy, competitorId, capturedAtIso) => {
      calls.finds.push([createdBy, competitorId, capturedAtIso])
      return existingShotId
    },
    insertShot: async (row) => { calls.shots.push(row); return { id: 'shot-1' } },
    insertReadings: async (rows) => { calls.readings.push(rows); return true },
    countTodayUploads: async (userId, shotOn) => { calls.counts.push([userId, shotOn]); return 7 },
    now: () => SERVER_NOW,
    ...over,
  }
  return { deps, calls }
}

function webp(): File {
  return new File([new Uint8Array(10)], 'a.webp', { type: 'image/webp' })
}

function postReq(fields: Record<string, string | File>, token: string | null = 'good'): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
  return new Request('http://localhost/api/competitors/quick-shot', { method: 'POST', headers, body: form })
}

const OK_FIELDS = () => ({
  file: webp(),
  handle: '1mb.dear',
  captured_at: String(SERVER_NOW - 60_000),
  viewer_text: '99',
  viewer_source: 'room',
  co_live: JSON.stringify([
    { handle: '1mb.dear', viewer: '103' },
    { handle: 'uni.chuuu', viewer: '64' },
    { handle: 'stranger', viewer: '692' },
  ]),
})

const CAPTURED_ISO = new Date(SERVER_NOW - 60_000).toISOString()

test('无令牌 → 401，不查库不上传', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS(), null))
  assert.equal(r.status, 401)
  assert.equal(calls.listed, 0)
  assert.equal(calls.uploads, 0)
  assert.equal(calls.shots.length, 0)
})

test('令牌无效 → 401，不查库不上传', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS(), 'bad'))
  assert.equal(r.status, 401)
  assert.equal(calls.listed, 0)
  assert.equal(calls.uploads, 0)
})

test('没带文件 → 400 file_required', async () => {
  const { deps } = makeDeps()
  const { file: _f, ...rest } = OK_FIELDS()
  const r = await createQuickShotHandlers(deps).post(postReq(rest))
  assert.equal(r.status, 400)
  assert.deepEqual(r.body, { data: null, error: 'file_required' })
})

test('文件类型不符 → 400 invalid_type，不上传', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), file: new File([new Uint8Array(1)], 'a.svg', { type: 'image/svg+xml' }) }))
  assert.equal(r.status, 400)
  assert.deepEqual(r.body, { data: null, error: 'invalid_type' })
  assert.equal(calls.uploads, 0)
})

test('文件过大 → 400 file_too_large，不上传', async () => {
  const { deps, calls } = makeDeps({ validateImage: () => ({ ok: false, error: 'size' }) })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 400)
  assert.deepEqual(r.body, { data: null, error: 'file_too_large' })
  assert.equal(calls.uploads, 0)
})

for (const handle of ['', '@']) {
  test(`handle 为 ${JSON.stringify(handle)} → 400 handle_required，不查库不上传`, async () => {
    const { deps, calls } = makeDeps()
    const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), handle }))
    assert.equal(r.status, 400)
    assert.deepEqual(r.body, { data: null, error: 'handle_required' })
    assert.equal(calls.listed, 0)
    assert.equal(calls.uploads, 0)
  })
}

test('handle 不在竞品库 → 404 not_in_library，不上传、不写库', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), handle: 'heroangels_' }))
  assert.equal(r.status, 404)
  assert.deepEqual(r.body, { data: null, error: 'not_in_library' })
  assert.equal(calls.uploads, 0)
  assert.equal(calls.shots.length, 0)
})

test('竞品库查询失败 → 500 db_error（不能当成 404），不上传', async () => {
  const { deps, calls } = makeDeps({ listCompetitors: async () => null })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 500)
  assert.deepEqual(r.body, { data: null, error: 'db_error' })
  assert.equal(calls.uploads, 0)
  assert.equal(calls.shots.length, 0)
})

test('正常上传 → 201，截图行与读数行字段都对', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 201)
  assert.deepEqual(r.body, { data: { competitor_name: '1MB DEAR', shot_id: 'shot-1', readings: 3, today_uploads: 7 }, error: null })

  assert.deepEqual(calls.finds, [['user-1', 'c-dear', CAPTURED_ISO]])
  assert.deepEqual(calls.shots, [{
    competitor_id: 'c-dear',
    image_url: IMAGE_URL,
    shot_on: '2026-10-10',
    tag: 'live_manual',
    viewer_count: 99,
    captured_at: CAPTURED_ISO,
    created_by: 'user-1',
  }])
  assert.deepEqual(calls.readings[0].map((x) => [x.competitor_id, x.source, x.viewer_count]), [
    ['c-dear', 'current', 99],
    ['c-dear', 'sidebar', 103],
    ['c-uni', 'sidebar', 64],
  ])
  assert.deepEqual(calls.readings[0][0], {
    competitor_id: 'c-dear',
    captured_at: CAPTURED_ISO,
    viewer_count: 99,
    viewer_text: '99',
    source: 'current',
    viewer_source: 'room',
    shot_id: 'shot-1',
    created_by: 'user-1',
  })
  for (const row of calls.readings[0]) {
    assert.equal(row.shot_id, 'shot-1')
    assert.equal(row.created_by, 'user-1')
    assert.equal(row.captured_at, CAPTURED_ISO)
  }
  assert.deepEqual(calls.counts, [['user-1', '2026-10-10']])
})

test('跨日本时间午夜：shot_on 取读数时刻（10-09），今日计数取服务器当下（10-10）', async () => {
  const serverNow = Date.UTC(2026, 9, 9, 15, 0, 30) // 日本时间 2026-10-10 00:00:30
  const capturedAt = Date.UTC(2026, 9, 9, 14, 59, 50) // 日本时间 2026-10-09 23:59:50
  const { deps, calls } = makeDeps({ now: () => serverNow })
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), captured_at: String(capturedAt) }))
  assert.equal(r.status, 201)
  assert.equal(calls.shots[0].shot_on, '2026-10-09')
  assert.deepEqual(calls.counts, [['user-1', '2026-10-10']])
})

test('display_name 为空串 → competitor_name 回落到 handle', async () => {
  const { deps } = makeDeps({ listCompetitors: async () => [{ id: 'c-dear', handle: '1mb.dear', display_name: '' }] })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 201)
  assert.equal((r.body as { data: { competitor_name: string } }).data.competitor_name, '1mb.dear')
})

test('重试幂等：同一读数时刻已有截图 → 不传桶、不写截图，读数照常用旧 shot_id 补写', async () => {
  const { deps, calls } = makeDeps({}, 'shot-old')
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 201)
  assert.deepEqual(r.body, { data: { competitor_name: '1MB DEAR', shot_id: 'shot-old', readings: 3, today_uploads: 7 }, error: null })
  assert.deepEqual(calls.finds, [['user-1', 'c-dear', CAPTURED_ISO]])
  assert.equal(calls.uploads, 0)
  assert.equal(calls.shots.length, 0)
  assert.equal(calls.readings.length, 1)
  assert.ok(calls.readings[0].every((x) => x.shot_id === 'shot-old'))
})

test('读数写入失败 → 207 readings_failed，截图照样写了', async () => {
  const { deps, calls } = makeDeps({ insertReadings: async () => false })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 207)
  assert.deepEqual(r.body, { data: { competitor_name: '1MB DEAR', shot_id: 'shot-1', readings: 0, today_uploads: 7 }, error: 'readings_failed' })
  assert.equal(calls.shots.length, 1)
})

test('读数写入抛错 → 同样 207，不能报整体失败', async () => {
  const { deps, calls } = makeDeps({ insertReadings: async () => { throw new Error('boom') } })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 207)
  assert.equal((r.body as { error: string }).error, 'readings_failed')
  assert.equal(calls.shots.length, 1)
})

test('POST 今日计数查询失败（返回 null）→ 仍是 201，today_uploads 为 null', async () => {
  const { deps } = makeDeps({ countTodayUploads: async () => null })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 201)
  assert.deepEqual(r.body, { data: { competitor_name: '1MB DEAR', shot_id: 'shot-1', readings: 3, today_uploads: null }, error: null })
})

test('POST 今日计数查询抛错 → 仍是 201，today_uploads 为 null', async () => {
  const { deps } = makeDeps({ countTodayUploads: async () => { throw new Error('boom') } })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 201)
  assert.deepEqual(r.body, { data: { competitor_name: '1MB DEAR', shot_id: 'shot-1', readings: 3, today_uploads: null }, error: null })
})

test('没有任何读数（没读到人数、侧栏为空）→ 201，且不调用 insertReadings', async () => {
  const { deps, calls } = makeDeps()
  const { viewer_text: _v, viewer_source: _s, ...rest } = OK_FIELDS()
  const r = await createQuickShotHandlers(deps).post(postReq({ ...rest, co_live: '[]' }))
  assert.equal(r.status, 201)
  assert.deepEqual(r.body, { data: { competitor_name: '1MB DEAR', shot_id: 'shot-1', readings: 0, today_uploads: 7 }, error: null })
  assert.equal(calls.readings.length, 0)
})

test('当前房间人数没读到 → 截图 viewer_count 为 null，不写 current 行', async () => {
  const { deps, calls } = makeDeps()
  const { viewer_text: _v, viewer_source: _s, ...rest } = OK_FIELDS()
  const r = await createQuickShotHandlers(deps).post(postReq(rest))
  assert.equal(r.status, 201)
  assert.equal(calls.shots[0].viewer_count, null)
  assert.ok(calls.readings[0].every((x) => x.source === 'sidebar'))
})

test('人数原文超长（17 位）→ 按未读到处理：viewer_count 为 null，不写 current 行', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), viewer_text: '1'.repeat(17) }))
  assert.equal(r.status, 201)
  assert.equal(calls.shots[0].viewer_count, null)
  assert.ok(calls.readings[0].every((x) => x.source === 'sidebar'))
})

test('人数原文是小数（1.5）→ 截图 viewer_count 为 null（写不进 integer 列），current 行保留原文', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), viewer_text: '1.5' }))
  assert.equal(r.status, 201)
  assert.equal(calls.shots[0].viewer_count, null)
  const current = calls.readings[0].find((x) => x.source === 'current')
  assert.equal(current?.viewer_count, null)
  assert.equal(current?.viewer_text, '1.5')
})

test('本机时钟快了 10 分钟 → 读数时刻改用服务器时间', async () => {
  const { deps, calls } = makeDeps()
  await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), captured_at: String(SERVER_NOW + 10 * 60_000) }))
  assert.equal(calls.shots[0].captured_at, new Date(SERVER_NOW).toISOString())
})

test('上传到桶失败 → 500 upload_failed，不写库', async () => {
  const { deps, calls } = makeDeps({ uploadImage: async () => ({ url: null, error: 'upload_failed' }) })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 500)
  assert.deepEqual(r.body, { data: null, error: 'upload_failed' })
  assert.equal(calls.shots.length, 0)
})

test('截图写库失败 → 500 db_error，不写读数', async () => {
  const { deps, calls } = makeDeps({ insertShot: async () => null })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 500)
  assert.deepEqual(r.body, { data: null, error: 'db_error' })
  assert.equal(calls.readings.length, 0)
})

test('GET：返回我今天（日本时间）的上传数', async () => {
  const { deps, calls } = makeDeps()
  const req = new Request('http://localhost/api/competitors/quick-shot', { headers: { authorization: 'Bearer good' } })
  const r = await createQuickShotHandlers(deps).get(req)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { data: { today_uploads: 7 }, error: null })
  assert.deepEqual(calls.counts, [['user-1', '2026-10-10']])
})

test('GET：计数查询失败 → 500 db_error', async () => {
  const { deps } = makeDeps({ countTodayUploads: async () => null })
  const req = new Request('http://localhost/api/competitors/quick-shot', { headers: { authorization: 'Bearer good' } })
  const r = await createQuickShotHandlers(deps).get(req)
  assert.equal(r.status, 500)
  assert.deepEqual(r.body, { data: null, error: 'db_error' })
})

test('GET：无令牌 → 401', async () => {
  const { deps } = makeDeps()
  const r = await createQuickShotHandlers(deps).get(new Request('http://localhost/api/competitors/quick-shot'))
  assert.equal(r.status, 401)
})
