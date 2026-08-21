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

test('shots: capturedDates 去重降序，不截断，null 日期不进列表', () => {
  const ctx = buildAskContext(
    board([comp({
      shots: [
        shot({ id: 'a', shot_on: '2026-08-19' }),
        shot({ id: 'b', shot_on: '2026-08-19' }),
        shot({ id: 'c', shot_on: '2026-08-17' }),
        shot({ id: 'd', shot_on: null }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const s = ctx.competitors[0].shots
  assert.equal(s.total, 4)
  assert.deepEqual(s.capturedDates, ['2026-08-19', '2026-08-17'])
  assert.equal(s.lastOn, '2026-08-19')
})

test('shots: peakViewers 取最大值，全 null 时为 null', () => {
  const withViewers = buildAskContext(
    board([comp({
      shots: [shot({ id: 'a', viewer_count: 312 }), shot({ id: 'b', viewer_count: 934 })],
    })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(withViewers.competitors[0].shots.peakViewers, 934)

  const none = buildAskContext(
    board([comp({ shots: [shot({ id: 'a' })] })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(none.competitors[0].shots.peakViewers, null)
})

test('shots: lastUptimeMinutes 取最近一张有完整时刻的截图', () => {
  const ctx = buildAskContext(
    board([comp({
      // shots 已按 shot_on 降序（assemble.ts），这里照此顺序给。
      shots: [
        shot({ id: 'a', shot_on: '2026-08-19', stream_started_at: '2026-08-19T12:00:00Z', captured_at: '2026-08-19T13:36:00Z' }),
        shot({ id: 'b', shot_on: '2026-08-17', stream_started_at: '2026-08-17T12:00:00Z', captured_at: '2026-08-17T12:30:00Z' }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(ctx.competitors[0].shots.lastUptimeMinutes, 96)
})

test('shots: 没有任何截图时形状完整且不抛异常', () => {
  const ctx = buildAskContext(board([comp({})]), new Date('2026-08-20T01:00:00Z'), 'zh')
  assert.deepEqual(ctx.competitors[0].shots, {
    total: 0, capturedDates: [], lastOn: null, peakViewers: null, lastUptimeMinutes: null,
  })
})

test('身份字段：显示名三级回退 快照名 → 竞品名 → handle', () => {
  const now = new Date('2026-08-20T01:00:00Z')
  const bare = buildAskContext(board([comp({ handle: 'alpha' })]), now, 'zh')
  assert.equal(bare.competitors[0].name, 'alpha')

  const named = buildAskContext(
    board([comp({ handle: 'alpha', display_name: 'Alpha 团' })]), now, 'zh',
  )
  assert.equal(named.competitors[0].name, 'Alpha 团')
})

test('health: 超过 7 天未采集算陈旧，正好 7 天不算', () => {
  const now = new Date('2026-08-20T01:00:00Z') // 东京 2026-08-20
  const fresh = buildAskContext(
    board([comp({ history: [point('2026-08-13', 100)] })]), now, 'zh',
  )
  assert.equal(fresh.competitors[0].health.metricsAgeDays, 7)
  assert.equal(fresh.competitors[0].health.stale, false)

  const stale = buildAskContext(
    board([comp({ history: [point('2026-08-12', 100)] })]), now, 'zh',
  )
  assert.equal(stale.competitors[0].health.metricsAgeDays, 8)
  assert.equal(stale.competitors[0].health.stale, true)
})

test('health: 从未采集过指标时 age 为 null 且算陈旧', () => {
  const ctx = buildAskContext(board([comp({})]), new Date('2026-08-20T01:00:00Z'), 'zh')
  assert.deepEqual(ctx.competitors[0].health, { metricsAgeDays: null, stale: true })
})

test('父子：子主播独立成条目并带 parentHandle，isChild 为 true', () => {
  const child = comp({ id: 'c-1', handle: 'kid', parent_id: 'id-1' })
  const ctx = buildAskContext(
    board([comp({ handle: 'alpha', related: [child] })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(ctx.competitors.length, 2)
  assert.equal(ctx.competitors[0].handle, 'alpha')
  assert.equal(ctx.competitors[0].isChild, false)
  assert.equal(ctx.competitors[0].parentHandle, null)
  assert.equal(ctx.competitors[1].handle, 'kid')
  assert.equal(ctx.competitors[1].isChild, true)
  assert.equal(ctx.competitors[1].parentHandle, 'alpha')
})

test('coverage: 主竞品与子主播都计入 competitors，roots 只数顶层', () => {
  const child = comp({
    id: 'c-1', handle: 'kid', parent_id: 'id-1',
    shots: [shot({ id: 'k1', shot_on: '2026-08-18', stream_started_at: '2026-08-18T12:00:00Z' })],
  })
  const ctx = buildAskContext(
    board([comp({
      handle: 'alpha',
      history: [point('2026-08-17', 1000)],
      shots: [shot({ id: 'a1', shot_on: '2026-08-19', stream_started_at: '2026-08-19T12:00:00Z' })],
      related: [child],
    })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.deepEqual(ctx.meta.coverage, {
    competitors: 2, roots: 1, withMetrics: 1,
    metricsDays: 1, shotDays: 2, sessionsWithStartTime: 2,
  })
})
