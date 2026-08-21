// src/lib/competitors/ask-context.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAskContext } from './ask-context.ts'
import type { CompetitorBoard, CompetitorShot, CompetitorSnapshot, CompetitorWithHistory, HistoryPoint } from './types.ts'

/** 造一条字段齐全的快照，只覆盖测试关心的部分。 */
function snap(over: Partial<CompetitorSnapshot> = {}): CompetitorSnapshot {
  const captured_on = over.captured_on ?? '2026-08-17'
  return {
    id: over.id ?? 'snap-1',
    competitor_id: over.competitor_id ?? 'id-1',
    captured_on,
    followers: over.followers ?? null,
    likes: over.likes ?? null,
    videos: over.videos ?? null,
    following: over.following ?? null,
    display_name: over.display_name ?? null,
    bio: over.bio ?? null,
    language: over.language ?? null,
    region: over.region ?? null,
    verified: over.verified ?? null,
    raw: over.raw ?? null,
    captured_at: over.captured_at ?? `${captured_on}T00:00:00Z`,
  }
}

/**
 * 真实数据里 latest 与 history 的最后一条永远来自同一行（assemble.ts 从同一批
 * rows 里同时算出两者）。测试只声明 history 时，latest 照此规则自动派生，
 * 而不是各写各的、悄悄制造出两者不一致的假数据——除非显式传 over.latest 来
 * 测的就是"两者不一致"这件事本身（例如最新一条 followers 为 null 时）。
 */
function latestFromHistory(history: HistoryPoint[]): CompetitorSnapshot | null {
  if (history.length === 0) return null
  const last = [...history].sort((a, b) => a.captured_on.localeCompare(b.captured_on)).at(-1)!
  return snap({ captured_on: last.captured_on, followers: last.followers, likes: last.likes, videos: last.videos })
}

/** 造一个字段齐全的竞品，只覆盖测试关心的部分。 */
function comp(over: Partial<CompetitorWithHistory> = {}): CompetitorWithHistory {
  const history = over.history ?? []
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
    latest: over.latest ?? latestFromHistory(history),
    history,
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

test('followers: 跨度超过 FOLLOWERS_MAX_SPAN_DAYS(21 天/三个采集周期)时 confidence 降级,但仍保留 delta 与 prev', () => {
  // 309 天跨度：真实生产库里的一个反例——两条快照隔了近一年，delta 依然会算出来，
  // 但那读起来像"最近涨了 6 万"，实际是近一年的累计,必须挡掉才能进比较结论。
  const ctx = buildAskContext(
    board([comp({ history: [point('2025-10-15', 200000), point('2026-08-20', 260000)] })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const f = ctx.competitors[0].followers
  assert.equal(f.spanDays, 309)
  assert.equal(f.confidence, 'insufficient')
  assert.equal(f.delta, 60000)
  assert.equal(f.prev, 200000)
})

test('followers: delta 为 0 时必须是数字 0,不能读成 null(持平也是数据)', () => {
  const ctx = buildAskContext(
    board([comp({ history: [point('2026-08-10', 240000), point('2026-08-17', 240000)] })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const f = ctx.competitors[0].followers
  assert.equal(f.delta, 0)
  assert.notEqual(f.delta, null)
  assert.equal(f.confidence, 'ok')
})

test('顺序无关: history 与 shots 倒序输入,followers/capturedDates/lastOn 结果不变', () => {
  const now = new Date('2026-08-20T01:00:00Z')
  const history = [point('2026-08-10', 241000), point('2026-08-17', 246200)]
  const shots = [
    shot({ id: 'a', shot_on: '2026-08-19' }),
    shot({ id: 'b', shot_on: '2026-08-17' }),
  ]

  const forward = buildAskContext(board([comp({ history, shots })]), now, 'zh')
  const reversed = buildAskContext(
    board([comp({ history: [...history].reverse(), shots: [...shots].reverse() })]),
    now, 'zh',
  )

  assert.deepEqual(reversed.competitors[0].followers, forward.competitors[0].followers)
  assert.deepEqual(reversed.competitors[0].shots.capturedDates, forward.competitors[0].shots.capturedDates)
  assert.equal(reversed.competitors[0].shots.lastOn, forward.competitors[0].shots.lastOn)
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

test('liveHabit: 窗口外的历史场次不冒充「常见」——门槛与 regionRuler 共用同一个 14 天窗口', () => {
  // 三场都在 2026-02，now 是 2026-08-20：早就过了 RULER_WINDOW_DAYS，
  // 场次数够但太旧，不能说这就是「现在」的作息。
  const ctx = buildAskContext(
    board([comp({
      shots: [
        shot({ id: 's1', stream_started_at: '2026-02-19T12:28:00Z' }),
        shot({ id: 's2', stream_started_at: '2026-02-18T12:30:00Z' }),
        shot({ id: 's3', stream_started_at: '2026-02-17T12:26:00Z' }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  const h = ctx.competitors[0].liveHabit
  assert.equal(h.confidence, 'insufficient')
  assert.deepEqual(h.slots, [])
})

test('liveHabit: 未来时刻的开播记录（脏数据）被排除，不会成为 latestStartedAt', () => {
  const ctx = buildAskContext(
    board([comp({
      shots: [
        shot({ id: 'future', stream_started_at: '2026-08-25T12:00:00Z' }), // now 之后
        shot({ id: 's1', stream_started_at: '2026-08-19T12:28:00Z' }),
      ],
    })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  assert.equal(ctx.competitors[0].liveHabit.latestStartedAt, '2026-08-19T12:28:00Z')
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

test('shots: peakViewersAllTime 取最大值，全 null 时为 null', () => {
  const withViewers = buildAskContext(
    board([comp({
      shots: [shot({ id: 'a', viewer_count: 312 }), shot({ id: 'b', viewer_count: 934 })],
    })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(withViewers.competitors[0].shots.peakViewersAllTime, 934)

  const none = buildAskContext(
    board([comp({ shots: [shot({ id: 'a' })] })]),
    new Date('2026-08-20T01:00:00Z'), 'zh',
  )
  assert.equal(none.competitors[0].shots.peakViewersAllTime, null)
})

test('shots: lastShotUptimeMinutes 只认 captured_at 的最大值，与数组顺序无关', () => {
  // 同一场（都是 11:30 开播），两张截图的采集时刻不同：40 分钟那张与 200 分钟那张。
  // shot_on 精度只到天，同一天多张截图在库里的相对顺序不保证
  // （两条写入路径的 sort_order 都硬编码 0，见 record-live-shot.mjs / service.ts）。
  const early = shot({ id: 'a', shot_on: '2026-08-19', stream_started_at: '2026-08-19T11:30:00Z', captured_at: '2026-08-19T12:10:00Z' })
  const late = shot({ id: 'b', shot_on: '2026-08-19', stream_started_at: '2026-08-19T11:30:00Z', captured_at: '2026-08-19T14:50:00Z' })

  const orderA = buildAskContext(board([comp({ shots: [early, late] })]), new Date('2026-08-20T01:00:00Z'), 'zh')
  const orderB = buildAskContext(board([comp({ shots: [late, early] })]), new Date('2026-08-20T01:00:00Z'), 'zh')

  assert.equal(orderA.competitors[0].shots.lastShotUptimeMinutes, 200)
  assert.equal(orderB.competitors[0].shots.lastShotUptimeMinutes, 200)
})

test('shots: 采集时刻最新但未标日期的截图仍参与 lastShotUptimeMinutes 判定', () => {
  const dated = shot({ id: 'a', shot_on: '2026-08-19', stream_started_at: '2026-08-19T11:30:00Z', captured_at: '2026-08-19T12:10:00Z' })
  const undatedNewest = shot({ id: 'b', shot_on: null, stream_started_at: '2026-08-19T11:30:00Z', captured_at: '2026-08-19T15:00:00Z' })

  const ctx = buildAskContext(board([comp({ shots: [dated, undatedNewest] })]), new Date('2026-08-20T01:00:00Z'), 'zh')
  assert.equal(ctx.competitors[0].shots.lastShotUptimeMinutes, 210)
})

test('shots: 没有任何截图时形状完整且不抛异常', () => {
  const ctx = buildAskContext(board([comp({})]), new Date('2026-08-20T01:00:00Z'), 'zh')
  assert.deepEqual(ctx.competitors[0].shots, {
    total: 0, capturedDates: [], lastOn: null, peakViewersAllTime: null, lastShotUptimeMinutes: null,
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

test('health: 最新快照 followers 为 null 时仍以 latest.captured_on 算新鲜度，不退回上一条有粉丝数的记录', () => {
  // parseCount 解析失败会写出 followers:null 的行（record-profile-snapshot.mjs）——
  // 这一行仍然是"采集过"，新鲜度要认它，不能因为它没有粉丝数就当没采集过、
  // 退回去用上一条有数字的旧记录（那正是看板徽标与这里曾经的分歧所在）。
  const ctx = buildAskContext(
    board([comp({ history: [point('2026-08-05', 240000), point('2026-08-19', null)] })]),
    new Date('2026-08-20T01:00:00Z'),
    'zh',
  )
  assert.equal(ctx.competitors[0].health.metricsAgeDays, 1)
  assert.equal(ctx.competitors[0].health.stale, false)
  // followers 块是另一套口径，仍然指向最后一条有粉丝数的记录——两者刻意不同步。
  assert.equal(ctx.competitors[0].followers.on, '2026-08-05')
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
