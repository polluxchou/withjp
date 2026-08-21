// src/lib/competitors/ask-context.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAskContext } from './ask-context.ts'
import type { CompetitorBoard, CompetitorWithHistory } from './types.ts'

/** 造一个字段齐全的竞品，只覆盖测试关心的部分。 */
function comp(over: Partial<CompetitorWithHistory> = {}): CompetitorWithHistory {
  return {
    id: over.id ?? 'id-1',
    platform: 'tiktok',
    handle: over.handle ?? 'alpha',
    profile_url: '',
    display_name: over.display_name ?? null,
    note: '',
    created_at: '2026-07-01T00:00:00Z',
    parent_id: over.parent_id ?? null,
    avatar_url: null,
    region: over.region ?? '日本',
    member_count: over.member_count ?? null,
    composition: null,
    launch_city: null,
    launched_on: null,
    mc_note: null,
    online_note: null,
    latest_videos: null,
    latest: over.latest ?? null,
    history: over.history ?? [],
    shots: over.shots ?? [],
    weekly: over.weekly ?? [],
    related: over.related ?? [],
  }
}

function board(competitors: CompetitorWithHistory[]): CompetitorBoard {
  return { competitors, canEdit: true }
}

test('meta.todayTokyo 按东京日算，跨日不会错一天', () => {
  // UTC 15:30 == 东京次日 00:30。若误用 UTC 会得到 08-19。
  const ctx = buildAskContext(board([]), new Date('2026-08-19T15:30:00Z'), 'zh')
  assert.equal(ctx.meta.todayTokyo, '2026-08-20')
})

test('meta.displayTimeZone 跟界面语言走', () => {
  const now = new Date('2026-08-19T15:30:00Z')
  assert.equal(buildAskContext(board([]), now, 'zh').meta.displayTimeZone, 'Asia/Shanghai')
  assert.equal(buildAskContext(board([]), now, 'ja').meta.displayTimeZone, 'Asia/Tokyo')
  assert.equal(buildAskContext(board([]), now, 'en').meta.displayTimeZone, 'America/Los_Angeles')
})

test('meta.captureNote 始终存在且点明「缺席只代表未采集」', () => {
  const ctx = buildAskContext(board([]), new Date('2026-08-19T15:30:00Z'), 'zh')
  assert.ok(ctx.meta.captureNote.includes('不代表未开播'))
})

test('空看板不抛异常，competitors 为空数组', () => {
  const ctx = buildAskContext(board([]), new Date('2026-08-19T15:30:00Z'), 'zh')
  assert.deepEqual(ctx.competitors, [])
  assert.equal(ctx.meta.coverage.competitors, 0)
  assert.equal(ctx.meta.coverage.roots, 0)
})

function point(captured_on: string, followers: number | null) {
  return { captured_on, followers, likes: null, videos: null }
}

test('followers: 两个及以上快照给出 delta 与 spanDays，confidence 为 ok', () => {
  const ctx = buildAskContext(
    board([comp({
      handle: 'solulune',
      history: [point('2026-08-10', 241000), point('2026-08-17', 246200)],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const f = ctx.competitors[0].followers
  assert.equal(f.latest, 246200)
  assert.equal(f.on, '2026-08-17')
  assert.equal(f.prev, 241000)
  assert.equal(f.prevOn, '2026-08-10')
  assert.equal(f.delta, 5200)
  assert.equal(f.spanDays, 7)
  assert.equal(f.confidence, 'ok')
})

test('followers: 只有一个快照时 delta 为 null 且 confidence 为 insufficient', () => {
  const ctx = buildAskContext(
    board([comp({ history: [point('2026-08-17', 246200)] })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const f = ctx.competitors[0].followers
  assert.equal(f.latest, 246200)
  assert.equal(f.prev, null)
  assert.equal(f.prevOn, null)
  assert.equal(f.delta, null)
  assert.equal(f.spanDays, null)
  assert.equal(f.confidence, 'insufficient')
})

test('followers: followers 为 null 的快照不参与计算', () => {
  const ctx = buildAskContext(
    board([comp({
      history: [point('2026-08-10', 241000), point('2026-08-17', null)],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const f = ctx.competitors[0].followers
  assert.equal(f.latest, 241000)
  assert.equal(f.on, '2026-08-10')
  assert.equal(f.confidence, 'insufficient')
})

test('followers: 完全没有快照时全为 null', () => {
  const ctx = buildAskContext(board([comp({})]), new Date('2026-08-20T01:00:00Z'), 'zh')
  const f = ctx.competitors[0].followers
  assert.deepEqual(f, {
    latest: null, on: null, prev: null, prevOn: null,
    delta: null, spanDays: null, confidence: 'insufficient',
  })
})
