// src/lib/competitors/shot-window-wiring.test.ts
// 源码断言 + 常量断言：截图按日期窗口加载在服务端与路由层的接线。
// 判据本身在 shotWindow.test.ts 单测；这里钉「服务端真的在用它们」。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { ASK_SHOT_COLUMNS, LIVE_SESSION_COLUMNS, getCompetitorBoard, getShotsInRange } from './service.ts'
import type { AskShot, BoardLiveSession } from './types.ts'

const SERVICE = readFileSync(new URL('./service.ts', import.meta.url), 'utf8')
const ASK_SERVICE = readFileSync(new URL('./ask-service.ts', import.meta.url), 'utf8')

function bodyOf(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`)
  assert.ok(start >= 0, `找不到 ${name}`)
  const next = src.indexOf('\nexport ', start + 1)
  return src.slice(start, next < 0 ? undefined : next)
}

// AskShot ↔ ASK_SHOT_COLUMNS 的联动：ask-context 的入参类型是 AskShot，它新读一个截图字段就逼着 AskShot 加键；
// 下面这个 Record<keyof AskShot, true> 在 AskShot 增删键时 tsc 直接报错，逼着改这里；
// 再与 ASK_SHOT_COLUMNS 的列集合对拍，列清单漏改就红。
const askShotKeys: Record<keyof AskShot, true> = {
  competitor_id: true,
  shot_on: true,
  sort_order: true,
  stream_started_at: true,
  viewer_count: true,
  captured_at: true,
}

test('问答截图列：与 AskShot 的键集合完全一致', () => {
  assert.deepEqual(
    ASK_SHOT_COLUMNS.split(',').map((s) => s.trim()).sort(),
    Object.keys(askShotKeys).sort(),
  )
})

// BoardLiveSession ↔ LIVE_SESSION_COLUMNS 的联动，写法同上面的 AskShot：
// 类型增删键时这个 Record 让 tsc 报错，列清单漏改时下面的对拍变红。
const boardLiveSessionKeys: Record<keyof BoardLiveSession, true> = {
  competitor_id: true,
  started_at: true,
  ended_at: true,
  title: true,
  likes: true,
}

test('开播记录列：与 BoardLiveSession 的键集合完全一致；service 里不再整表 select(*) 开播记录', () => {
  assert.deepEqual(
    LIVE_SESSION_COLUMNS.split(',').map((s) => s.trim()).sort(),
    Object.keys(boardLiveSessionKeys).sort(),
  )
  assert.doesNotMatch(SERVICE, /competitor_live_sessions'\)\.select\('\*'\)/)
})

test('getCompetitorBoard：开播记录只查 LIVE_SESSION_COLUMNS，仍全量分页（select → order(id 升序) → range，中间不夹过滤）', () => {
  assert.match(
    bodyOf(SERVICE, 'getCompetitorBoard'),
    /db\.from\('competitor_live_sessions'\)\.select\(LIVE_SESSION_COLUMNS\)\s*\.order\('id', \{ ascending: true \}\)\.range\(from, to\)\)/,
  )
})

test('getAskBoard：截图只查问答列，不 select(*)，查询链恰好是 select → order(id 升序) → range', () => {
  const body = bodyOf(SERVICE, 'getAskBoard')
  assert.doesNotMatch(body, /competitor_shots'\)\.select\('\*'\)/)
  // 白名单而非黑名单：select 与 .order('id') / .range 之间不许夹任何过滤，截图才是全量历史。
  assert.match(
    body,
    /db\.from\('competitor_shots'\)\.select\(ASK_SHOT_COLUMNS\)\s*\.order\('id', \{ ascending: true \}\)\.range\(from, to\)\)/,
  )
})

test('getAskBoard：竞品按 created_at 升序再 id 升序（问答数据包里的账号先后取自这里）', () => {
  const body = bodyOf(SERVICE, 'getAskBoard')
  assert.match(
    body,
    /db\.from\('competitors'\)\.select\('\*'\)\s*\.order\('created_at', \{ ascending: true \}\)\.order\('id', \{ ascending: true \}\)\.range\(from, to\)/,
  )
})

test('getAskBoard：快照取全列；错误按四表顺序传播；截图原样交给 assembleBoard', () => {
  // createServerClient 在函数内构造、无法注入，没法跑真实调用，只能钉源码形态。
  const body = bodyOf(SERVICE, 'getAskBoard')
  assert.match(body, /db\.from\('competitor_snapshots'\)\.select\('\*'\)/)
  assert.ok(
    body.includes('compRes.error ?? snapRes.error ?? shotRes.error ?? liveRes.error'),
    '竞品、快照、截图、开播记录任一出错都应返回 db_error',
  )
  assert.ok(body.includes('(shotRes.data ?? []) as AskShot[]'), '截图应原样交给 assembleBoard')
})

test('getAskBoard：开播记录全量拉取（只查 LIVE_SESSION_COLUMNS），作为 assembleBoard 的第 6 个实参（问答与卡片同一口径合并场次）', () => {
  const body = bodyOf(SERVICE, 'getAskBoard')
  assert.match(
    body,
    /db\.from\('competitor_live_sessions'\)\.select\(LIVE_SESSION_COLUMNS\)\s*\.order\('id', \{ ascending: true \}\)\.range\(from, to\)\)/,
  )
  assert.match(
    body,
    /assembleBoard\(\s*\(compRes\.data \?\? \[\]\) as Competitor\[\],\s*\(snapRes\.data \?\? \[\]\) as CompetitorSnapshot\[\],\s*\(shotRes\.data \?\? \[\]\) as AskShot\[\],\s*true,\s*\[\],\s*\(liveRes\.data \?\? \[\]\) as BoardLiveSession\[\],?\s*\)/,
  )
  // 截图仍是全量：问答不按相册窗口过滤
  assert.doesNotMatch(body, /loadedRangeOrFilter|\.or\(|\.gte\('shot_on'/)
})

test('问答服务改走 getAskBoard（全量历史），不再用相册窗口化的 getCompetitorBoard', () => {
  assert.match(ASK_SERVICE, /import \{ getAskBoard \} from '\.\/service\.ts'/)
  assert.doesNotMatch(ASK_SERVICE, /getCompetitorBoard/)
})

const BOARD_ROUTE = readFileSync(new URL('../../app/api/competitors/route.ts', import.meta.url), 'utf8')
const SHOTS_ROUTE = readFileSync(new URL('../../app/api/competitors/shots/route.ts', import.meta.url), 'utf8')

test('getCompetitorBoard：先瘦查询建全量索引，截图本体按已加载范围过滤', () => {
  const body = bodyOf(SERVICE, 'getCompetitorBoard')
  // captured_at 也要：场次的下播取该场最晚的截图时刻（见 shotWindow.ts 的 buildShotIndex）
  assert.match(body, /db\.from\('competitor_shots'\)\.select\('competitor_id, shot_on, stream_started_at, captured_at'\)/)
  assert.match(body, /buildShotIndex\(/)
  assert.match(body, /resolveLoadedFrom\(index\.shotAxis, since\)/)
  assert.match(body, /db\.from\('competitor_shots'\)\.select\('\*'\)\s*\.or\(loadedRangeOrFilter\(loadedFrom\)\)/)
  // 全量索引与已加载起点必须一起交给 assembleBoard，否则前端拿不到完整日期轴
  assert.match(body, /shotsLoadedFrom: loadedFrom/)
})

test('getCompetitorBoard：since 进查询前自己再校验一道', () => {
  const body = bodyOf(SERVICE, 'getCompetitorBoard')
  assert.match(body, /since !== null && !isValidShotDate\(since\)/)
  assert.match(body, /return err\('invalid_input', 'since must be/)
})

test('getShotsInRange：按 [from, before) 取整段，入参再校验一道', () => {
  const body = bodyOf(SERVICE, 'getShotsInRange')
  assert.match(body, /parseShotRangeQuery\(rangeFrom, rangeBefore\)/)
  // select('*')：补取回来的是截图本体，列不能少；过滤紧跟其后。
  assert.match(
    body,
    /db\.from\('competitor_shots'\)\.select\('\*'\)\s*\.gte\('shot_on', q\.from\)\.lt\('shot_on', q\.before\)/,
  )
})

test('GET /api/competitors：鉴权后解析 since 再取看板', () => {
  assert.match(BOARD_ROUTE, /parseSinceQuery\(req\.nextUrl\.searchParams\.get\('since'\)\)/)
  assert.match(BOARD_ROUTE, /getCompetitorBoard\(user\.id, \{ since: q\.since \}\)/)
  assert.ok(BOARD_ROUTE.indexOf('authGuard()') < BOARD_ROUTE.indexOf('parseSinceQuery('), 'GET 必须先鉴权')
})

test('GET /api/competitors/shots：鉴权后解析区间再取', () => {
  assert.match(SHOTS_ROUTE, /parseShotRangeQuery\(params\.get\('from'\), params\.get\('before'\)\)/)
  assert.match(SHOTS_ROUTE, /getShotsInRange\(q\.from, q\.before\)/)
  assert.ok(SHOTS_ROUTE.indexOf('authGuard()') >= 0 && SHOTS_ROUTE.indexOf('authGuard()') < SHOTS_ROUTE.indexOf('parseShotRangeQuery('), '必须先鉴权')
})

// ---- 路由：鉴权早返回与 400 -------------------------------------------------
// 只断言「authGuard() 调用还在」不够：留着调用、删掉 `if (user instanceof NextResponse) return user`，
// 未登录请求就直达数据库——补取接口里 user 后面没人用，tsc 也不报。
// 同理，非法参数分支必须真的返回 400，不能悄悄变成 200。
function handlerOf(src: string): string {
  const start = src.indexOf('export async function GET(')
  assert.ok(start >= 0, '找不到 GET 处理函数')
  const next = src.indexOf('\nexport ', start + 1)
  return src.slice(start, next < 0 ? undefined : next)
}

const ROUTES: [name: string, src: string][] = [
  ['GET /api/competitors', BOARD_ROUTE],
  ['GET /api/competitors/shots', SHOTS_ROUTE],
]

for (const [name, src] of ROUTES) {
  test(`${name}：鉴权失败直接返回，不往下走`, () => {
    assert.match(
      handlerOf(src),
      /const user = await authGuard\(\)\s*\n\s*if \(user instanceof NextResponse\) return user/,
    )
  })

  test(`${name}：参数非法返回 400`, () => {
    assert.match(handlerOf(src), /if \(!q\.ok\)[\s\S]{0,200}?status: 400/)
  })
}

// ---- 服务层：入参校验的方向与错误码（行为测试） ------------------------------
// 校验发生在 createServerClient() 之前，所以非法入参的调用不碰数据库（测试环境也没有数据库凭据）。
// 注意：这里只准用非法参数调用——合法参数会往下去连库。
test('getCompetitorBoard：不是真实日期的 since 被拒，错误码 invalid_input（不碰数据库）', async () => {
  for (const since of ['2026-02-30', '2026-08-16,id.gt.0', 'not-a-date']) {
    const res = await getCompetitorBoard('u', { since })
    assert.equal(res.data, null, since)
    assert.equal(res.error?.code, 'invalid_input', since)
  }
})

test('getShotsInRange：from 不早于 before、或带注入片段的区间被拒，错误码 invalid_input（不碰数据库）', async () => {
  const bad: [string, string][] = [
    ['2026-08-16', '2026-08-01'],
    ['2026-08-16', '2026-08-16'],
    ['2026-08-01', '2026-08-17,id.gt.0'],
    ['2026-08-01,id.gt.0', '2026-08-17'],
  ]
  for (const [from, before] of bad) {
    const res = await getShotsInRange(from, before)
    assert.equal(res.data, null, `${from} ${before}`)
    assert.equal(res.error?.code, 'invalid_input', `${from} ${before}`)
  }
})

// ---- 看板取数的数据流 --------------------------------------------------------
// 「meta 算出来了但没传」「索引喂了空数组」「截图本体换成 []」「canEdit 变 false」这几类改动，
// 单看「某个字符串还在」抓不住；这里把 assembleBoard 的整段调用连同实参顺序一起钉住。
test('getCompetitorBoard：索引吃瘦查询的行；assembleBoard 的实参依次是 竞品、快照、截图本体、canEdit=true、描述、开播记录、meta', () => {
  const body = bodyOf(SERVICE, 'getCompetitorBoard')
  assert.ok(
    body.includes('buildShotIndex((indexRes.data ?? []) as ShotIndexRow[])'),
    '索引必须由瘦查询的行构建',
  )
  assert.match(
    body,
    /assembleBoard\(\s*\(compRes\.data \?\? \[\]\) as Competitor\[\],\s*\(snapRes\.data \?\? \[\]\) as CompetitorSnapshot\[\],\s*\(shotRes\.data \?\? \[\]\) as CompetitorShot\[\],\s*true,\s*\(descRes\.data \?\? \[\]\) as CompetitorDescription\[\],\s*\(liveRes\.data \?\? \[\]\) as BoardLiveSession\[\],\s*\{ \.\.\.index, shotsLoadedFrom: loadedFrom \},?\s*\)/,
  )
})

// ---- 错误传播 ----------------------------------------------------------------
// 任何一段查询失败都要变成 db_error，不能静默退化成「空索引 / 缺图看板」。
test('getCompetitorBoard：五张表与截图本体任一出错都返回 db_error', () => {
  const body = bodyOf(SERVICE, 'getCompetitorBoard')
  assert.ok(
    body.includes('compRes.error ?? snapRes.error ?? indexRes.error ?? descRes.error ?? liveRes.error'),
    '竞品、快照、索引、描述、开播记录任一出错都应返回 db_error',
  )
  assert.ok(
    body.includes("if (shotRes.error) return err('db_error', shotRes.error.message)"),
    '截图本体查询出错应返回 db_error',
  )
})

test('getShotsInRange：补取查询出错返回 db_error', () => {
  const body = bodyOf(SERVICE, 'getShotsInRange')
  assert.ok(body.includes("if (res.error) return err('db_error', res.error.message)"))
})
