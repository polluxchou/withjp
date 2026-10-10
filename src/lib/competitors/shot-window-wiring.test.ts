// src/lib/competitors/shot-window-wiring.test.ts
// 源码断言 + 常量断言：截图按日期窗口加载在服务端与路由层的接线。
// 判据本身在 shotWindow.test.ts 单测；这里钉「服务端真的在用它们」。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { ASK_SHOT_COLUMNS } from './service.ts'
import type { AskShot } from './types.ts'

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

test('getAskBoard：快照取全列；错误按三表顺序传播；截图原样交给 assembleBoard', () => {
  // createServerClient 在函数内构造、无法注入，没法跑真实调用，只能钉源码形态。
  const body = bodyOf(SERVICE, 'getAskBoard')
  assert.match(body, /db\.from\('competitor_snapshots'\)\.select\('\*'\)/)
  assert.ok(body.includes('compRes.error ?? snapRes.error ?? shotRes.error'), '三表任一出错都应返回 db_error')
  assert.ok(body.includes('(shotRes.data ?? []) as AskShot[]'), '截图应原样交给 assembleBoard')
})

test('问答服务改走 getAskBoard（全量历史），不再用相册窗口化的 getCompetitorBoard', () => {
  assert.match(ASK_SERVICE, /import \{ getAskBoard \} from '\.\/service\.ts'/)
  assert.doesNotMatch(ASK_SERVICE, /getCompetitorBoard/)
})

const BOARD_ROUTE = readFileSync(new URL('../../app/api/competitors/route.ts', import.meta.url), 'utf8')
const SHOTS_ROUTE = readFileSync(new URL('../../app/api/competitors/shots/route.ts', import.meta.url), 'utf8')

test('getCompetitorBoard：先瘦查询建全量索引，截图本体按已加载范围过滤', () => {
  const body = bodyOf(SERVICE, 'getCompetitorBoard')
  assert.match(body, /db\.from\('competitor_shots'\)\.select\('competitor_id, shot_on, stream_started_at'\)/)
  assert.match(body, /buildShotIndex\(/)
  assert.match(body, /resolveLoadedFrom\(index\.shotAxis, since\)/)
  assert.match(body, /db\.from\('competitor_shots'\)\.select\('\*'\)\s*\.or\(loadedRangeOrFilter\(loadedFrom\)\)/)
  // 全量索引与已加载起点必须一起交给 assembleBoard，否则前端拿不到完整日期轴
  assert.match(body, /shotsLoadedFrom: loadedFrom/)
})

test('getCompetitorBoard：since 进查询前自己再校验一道', () => {
  const body = bodyOf(SERVICE, 'getCompetitorBoard')
  assert.match(body, /isValidShotDate\(since\)/)
})

test('getShotsInRange：按 [from, before) 取整段，入参再校验一道', () => {
  const body = bodyOf(SERVICE, 'getShotsInRange')
  assert.match(body, /parseShotRangeQuery\(rangeFrom, rangeBefore\)/)
  assert.match(body, /\.gte\('shot_on', q\.from\)\.lt\('shot_on', q\.before\)/)
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
