import assert from 'node:assert/strict'
import test from 'node:test'
import { createQuickShotHandlers, type QuickShotDeps, type ShotRow } from '../../../../lib/competitors/quickShotService.ts'
import type { CompetitorRef, ReadingRow } from '../../../../lib/competitors/quickShot.ts'

// ============================================================
// 覆盖范围：扩展一键上传接口只认 Bearer 令牌（没有后台网页的 Cookie）。
//   1. 无令牌 / 令牌无效 → 401，什么都不碰
//   2. 文件缺失 / 类型不符 → 400，不上传
//   3. handle 不在竞品库 → 404 not_in_library，不上传、不写库
//   4. 正常 → 201：截图行字段（tag/上传人/日本时间日期/人数）+ 读数行 + 今日计数
//   5. 读数写入失败 → 207 readings_failed，截图照样在
//   6. 本机时钟快了 → 用服务器时间
//   7. 人数原文超长 → 按未读到处理
//   8. GET 今日计数
// ============================================================

const SERVER_NOW = Date.UTC(2026, 9, 9, 9, 42) // 日本时间 2026-10-09 18:42
const LIB: CompetitorRef[] = [
  { id: 'c-dear', handle: '1mb.dear', display_name: '1MB DEAR' },
  { id: 'c-uni', handle: 'uni.chuuu', display_name: 'UNi Chuuu' },
]

function makeDeps(over: Partial<QuickShotDeps> = {}) {
  const calls = { uploads: 0, shots: [] as ShotRow[], readings: [] as ReadingRow[][], counts: [] as [string, string][] }
  const deps: QuickShotDeps = {
    verifyToken: async (t) => (t === 'good' ? { id: 'user-1' } : null),
    listCompetitors: async () => LIB,
    validateImage: (f) => (f.type === 'image/webp' ? { ok: true } : { ok: false, error: 'type' }),
    uploadImage: async () => { calls.uploads += 1; return { url: 'https://x.supabase.co/storage/v1/object/public/competitor-shots/a.webp', error: null } },
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

test('无令牌 → 401，不查库不上传', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS(), null))
  assert.equal(r.status, 401)
  assert.equal(calls.uploads, 0)
})

test('令牌无效 → 401', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS(), 'bad'))
  assert.equal(r.status, 401)
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

test('handle 不在竞品库 → 404 not_in_library，不上传、不写库', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), handle: 'heroangels_' }))
  assert.equal(r.status, 404)
  assert.deepEqual(r.body, { data: null, error: 'not_in_library' })
  assert.equal(calls.uploads, 0)
  assert.equal(calls.shots.length, 0)
})

test('正常上传 → 201，截图行与读数行字段都对', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 201)
  assert.deepEqual(r.body, { data: { competitor_name: '1MB DEAR', shot_id: 'shot-1', readings: 3, today_uploads: 7 }, error: null })

  const capturedIso = new Date(SERVER_NOW - 60_000).toISOString()
  assert.deepEqual(calls.shots, [{
    competitor_id: 'c-dear',
    image_url: 'https://x.supabase.co/storage/v1/object/public/competitor-shots/a.webp',
    shot_on: '2026-10-09',
    tag: 'live_manual',
    viewer_count: 99,
    captured_at: capturedIso,
    created_by: 'user-1',
  }])
  assert.deepEqual(calls.readings[0].map((x) => [x.competitor_id, x.source, x.viewer_count]), [
    ['c-dear', 'current', 99],
    ['c-dear', 'sidebar', 103],
    ['c-uni', 'sidebar', 64],
  ])
  assert.deepEqual(calls.counts, [['user-1', '2026-10-09']])
})

test('读数写入失败 → 207 readings_failed，截图照样写了', async () => {
  const { deps, calls } = makeDeps({ insertReadings: async () => false })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 207)
  assert.equal((r.body as { error: string }).error, 'readings_failed')
  assert.equal(calls.shots.length, 1)
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

test('GET：返回我今天（日本时间）的上传数', async () => {
  const { deps, calls } = makeDeps()
  const req = new Request('http://localhost/api/competitors/quick-shot', { headers: { authorization: 'Bearer good' } })
  const r = await createQuickShotHandlers(deps).get(req)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { data: { today_uploads: 7 }, error: null })
  assert.deepEqual(calls.counts, [['user-1', '2026-10-09']])
})

test('GET：无令牌 → 401', async () => {
  const { deps } = makeDeps()
  const r = await createQuickShotHandlers(deps).get(new Request('http://localhost/api/competitors/quick-shot'))
  assert.equal(r.status, 401)
})
