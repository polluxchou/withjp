// src/lib/competitors/ask-context.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAskContext } from './ask-context.ts'
import type { CompetitorBoard, CompetitorShot, CompetitorWithHistory } from './types.ts'

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

function shot(over: Partial<CompetitorShot> = {}): CompetitorShot {
  return {
    id: over.id ?? 'shot-1',
    competitor_id: 'id-1',
    image_url: 'https://example.test/a.jpg',
    shot_on: over.shot_on ?? null,
    tag: null,
    caption: '',
    sort_order: over.sort_order ?? 0,
    created_at: '2026-08-19T13:00:00Z',
    viewer_count: over.viewer_count ?? null,
    stream_started_at: over.stream_started_at ?? null,
    captured_at: over.captured_at ?? null,
  }
}

test('liveHabit: 三场同档达到门槛，confidence 为 ok', () => {
  // 三场都在东京 21:2x → zh 界面（上海，比东京晚一小时）应显示 20:2x。
  const ctx = buildAskContext(
    board([comp({
      shots: [
        shot({ id: 's1', stream_started_at: '2026-08-19T12:28:00Z' }),
        shot({ id: 's2', stream_started_at: '2026-08-18T12:30:00Z' }),
        shot({ id: 's3', stream_started_at: '2026-08-17T12:26:00Z' }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const h = ctx.competitors[0].liveHabit
  assert.equal(h.confidence, 'ok')
  assert.equal(h.slots.length, 1)
  assert.equal(h.slots[0].at, '20:28')
  assert.equal(h.slots[0].sessions, 3)
  assert.equal(h.sessions, 3)
  assert.equal(h.latestStartedAt, '2026-08-19T12:28:00Z')
})

test('liveHabit: 同一场的多张截图只算一次场次', () => {
  const ctx = buildAskContext(
    board([comp({
      shots: [
        shot({ id: 's1', stream_started_at: '2026-08-19T12:28:00Z' }),
        shot({ id: 's2', stream_started_at: '2026-08-19T12:28:00Z' }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  assert.equal(ctx.competitors[0].liveHabit.sessions, 1)
})

test('liveHabit: 不足三场时 slots 为空且 confidence 为 insufficient，但保留最近一场', () => {
  const ctx = buildAskContext(
    board([comp({ shots: [shot({ stream_started_at: '2026-08-19T12:28:00Z' })] })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const h = ctx.competitors[0].liveHabit
  assert.equal(h.confidence, 'insufficient')
  assert.deepEqual(h.slots, [])
  assert.equal(h.latestStartedAt, '2026-08-19T12:28:00Z')
})

test('liveHabit: 钟点随界面语言换算，同一时刻中日相差一小时', () => {
  const shots = [
    shot({ id: 's1', stream_started_at: '2026-08-19T12:28:00Z' }),
    shot({ id: 's2', stream_started_at: '2026-08-18T12:30:00Z' }),
    shot({ id: 's3', stream_started_at: '2026-08-17T12:26:00Z' }),
  ]
  const now = new Date('2026-08-20T01:00:00Z')
  const zh = buildAskContext(board([comp({ shots })]), now, 'zh')
  const ja = buildAskContext(board([comp({ shots })]), now, 'ja')
  assert.equal(zh.competitors[0].liveHabit.slots[0].at, '20:28')
  assert.equal(ja.competitors[0].liveHabit.slots[0].at, '21:28')
})
