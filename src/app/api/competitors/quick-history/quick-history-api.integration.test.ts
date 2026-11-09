import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createQuickHistoryHandlers, todayIn, type QuickHistoryActor, type QuickHistoryDeps,
} from '../../../../lib/competitors/quickHistoryService.ts'
import type { LiveSessionRow } from '../../../../lib/competitors/liveHistory.ts'
import type { CompetitorRef } from '../../../../lib/competitors/quickShot.ts'

// ============================================================
// 覆盖范围：扩展「读开播记录」接口（Bearer 令牌，没有后台网页的 Cookie）。
//   1. 无令牌 / 令牌无效 → 401；Auth 暂时不可用 → 503（扩展不因此登出）
//   2. 受限帐号：竞品范围放行，其它范围 403
//   3. 入参：非 JSON / handle / text / 时区 缺失或非法 → 400；不在库 → 404；库查询失败 → 500
//   4. 正常：按页面时区换算 UTC，行字段与粘贴导入一致；回传新增/更新/跳过与日期范围
//   5. 弹窗里 History 之外的行（Fan Club 等）只计入 issues，不影响导入
//   6. 一场都没解析出 → 422；入库失败 → 500
//   7. 「今天」按页面时区取：UTC 还是 12-31、日本已是 1-1 时，Jan 1 归到新的一年
// ============================================================

const LIB: CompetitorRef[] = [{ id: 'c-sample', handle: 'sample.jp', display_name: 'SAMPLE' }]
const SERVER_NOW = Date.UTC(2026, 10, 9, 3, 40) // 日本时间 2026-11-09 12:40

// 2026-11-09 在扩展里实测读到的弹窗文字（节选）：History 前面还有粉丝团等行
const MODAL_TEXT = `SAMPLE🪭's LIVE
Fan Club
Lv.1
161
Gift Gallery
1 / 20
Watch LIVE

History

Nov
8

SAMPLE🪭ダンス配信!!!

Sunday, 8:03 PM - 10:57 PM · 265.5K likes
Nov
6

SAMPLE🪭's LIVE

Friday, 4:00 PM - 5:05 PM · 747 likes
Aug
11

SAMPLE🪭's LIVE

Tuesday, 7:15 PM - 10:39 PM · 753.1K likes`

function makeDeps(over: Partial<QuickHistoryDeps> = {}) {
  const calls = { upserts: [] as [string, LiveSessionRow[], QuickHistoryActor][] }
  const deps: QuickHistoryDeps = {
    verifyToken: async (t) => (t === 'good' ? { id: 'user-1', access_scope: null } : t === 'scoped' ? { id: 'user-2', access_scope: 'competitors' } : t === 'odd' ? { id: 'user-3', access_scope: 'finance' } : null),
    listCompetitors: async () => LIB,
    upsertSessions: async (id, rows, actor) => { calls.upserts.push([id, rows, actor]); return { inserted: 2, updated: 1, skipped: 0 } },
    now: () => SERVER_NOW,
    ...over,
  }
  return { deps, calls }
}

function req(body: unknown, token: string | null = 'good'): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request('http://localhost/api/competitors/quick-history', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
const OK_BODY = { handle: '@SAMPLE.jp', text: MODAL_TEXT, time_zone: 'Asia/Tokyo' }

test('无令牌 / 令牌无效 → 401；Auth 抛错 → 503；都不入库', async () => {
  const { deps, calls } = makeDeps()
  const h = createQuickHistoryHandlers(deps)
  assert.equal((await h.post(req(OK_BODY, null))).status, 401)
  assert.equal((await h.post(req(OK_BODY, 'bad'))).status, 401)
  const down = createQuickHistoryHandlers(makeDeps({ verifyToken: async () => { throw new Error('5xx') } }).deps)
  const r = await down.post(req(OK_BODY))
  assert.equal(r.status, 503)
  assert.deepEqual(r.body, { data: null, error: 'auth_unavailable' })
  assert.equal(calls.upserts.length, 0)
})

test('受限帐号：竞品范围放行并把范围传给入库；其它范围 403', async () => {
  const { deps, calls } = makeDeps()
  const h = createQuickHistoryHandlers(deps)
  assert.equal((await h.post(req(OK_BODY, 'scoped'))).status, 200)
  assert.deepEqual(calls.upserts[0][2], { id: 'user-2', access_scope: 'competitors' })
  const r = await h.post(req(OK_BODY, 'odd'))
  assert.equal(r.status, 403)
  assert.equal(calls.upserts.length, 1)
})

test('入参校验：400 / 404 / 500', async () => {
  const { deps, calls } = makeDeps()
  const h = createQuickHistoryHandlers(deps)
  const err = async (body: unknown) => {
    const r = await h.post(req(body))
    return [r.status, (r.body as { error: string }).error]
  }
  assert.deepEqual(await err('{not json'), [400, 'invalid_json'])
  assert.deepEqual(await err([1]), [400, 'invalid_json'])
  assert.deepEqual(await err({ ...OK_BODY, handle: '' }), [400, 'handle_required'])
  assert.deepEqual(await err({ ...OK_BODY, text: '  ' }), [400, 'text_required'])
  assert.deepEqual(await err({ ...OK_BODY, text: 'x'.repeat(200_001) }), [400, 'text_too_long'])
  assert.deepEqual(await err({ ...OK_BODY, time_zone: 'Mars/Base' }), [400, 'invalid_time_zone'])
  assert.deepEqual(await err({ ...OK_BODY, time_zone: undefined }), [400, 'invalid_time_zone'])
  assert.deepEqual(await err({ ...OK_BODY, handle: 'nobody' }), [404, 'not_in_library'])
  const broken = createQuickHistoryHandlers(makeDeps({ listCompetitors: async () => null }).deps)
  assert.equal((await broken.post(req(OK_BODY))).status, 500)
  assert.equal(calls.upserts.length, 0)
})

test('正常导入：按页面时区换算、行字段与粘贴导入一致、回传计数与日期范围', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickHistoryHandlers(deps).post(req(OK_BODY))
  assert.equal(r.status, 200)
  const [id, rows] = calls.upserts[0]
  assert.equal(id, 'c-sample')
  assert.deepEqual(rows, [
    { started_at: '2026-11-08T11:03:00.000Z', ended_at: '2026-11-08T13:57:00.000Z', title: 'SAMPLE🪭ダンス配信!!!', likes: 265500 },
    { started_at: '2026-11-06T07:00:00.000Z', ended_at: '2026-11-06T08:05:00.000Z', title: "SAMPLE🪭's LIVE", likes: 747 },
    { started_at: '2026-08-11T10:15:00.000Z', ended_at: '2026-08-11T13:39:00.000Z', title: "SAMPLE🪭's LIVE", likes: 753100 },
  ])
  const data = (r.body as { data: Record<string, unknown> }).data
  assert.equal(data.competitor_name, 'SAMPLE')
  assert.equal(data.parsed, 3)
  assert.equal(data.inserted, 2)
  assert.equal(data.updated, 1)
  assert.equal(data.skipped, 0)
  assert.equal(data.first_date, '2026-08-11')
  assert.equal(data.last_date, '2026-11-08')
  // History 前面那 7 行（Fan Club / Lv.1 …）认不出来，只计数，不挡导入
  assert.equal(data.issues, 7)
})

test('页面时区不同，同一段原文换算出的 UTC 跟着变', async () => {
  const { deps, calls } = makeDeps()
  await createQuickHistoryHandlers(deps).post(req({ ...OK_BODY, time_zone: 'America/Los_Angeles' }))
  assert.equal(calls.upserts[0][1][0].started_at, '2026-11-09T04:03:00.000Z')
})

test('一场都没解析出 → 422，不入库；入库失败 → 500', async () => {
  const { deps, calls } = makeDeps()
  const h = createQuickHistoryHandlers(deps)
  const r = await h.post(req({ ...OK_BODY, text: 'Fan Club\nLv.1' }))
  assert.equal(r.status, 422)
  assert.deepEqual(r.body, { data: { issues: 2 }, error: 'no_sessions' })
  assert.equal(calls.upserts.length, 0)
  const broken = createQuickHistoryHandlers(makeDeps({ upsertSessions: async () => null }).deps)
  assert.equal((await broken.post(req(OK_BODY))).status, 500)
})

test('「今天」按页面时区：UTC 12-31、日本已是 1-1 时，Jan 1 记成新的一年', async () => {
  const now = Date.UTC(2026, 11, 31, 16, 0) // 日本 2027-01-01 01:00
  assert.equal(todayIn('Asia/Tokyo', now), '2027-01-01')
  assert.equal(todayIn('UTC', now), '2026-12-31')
  const { deps, calls } = makeDeps({ now: () => now })
  const text = 'History\nJan\n1\nNew Year LIVE\nFriday, 12:10 AM - 12:50 AM · 1K likes\nDec\n31\nEve\nThursday, 8:00 PM - 11:00 PM · 2K likes'
  const r = await createQuickHistoryHandlers(deps).post(req({ ...OK_BODY, text }))
  assert.equal(r.status, 200)
  assert.deepEqual(calls.upserts[0][1].map((x) => x.started_at), ['2026-12-31T15:10:00.000Z', '2026-12-31T11:00:00.000Z'])
})
