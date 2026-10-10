// src/lib/competitors/assemble.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseHandleFromUrl, assembleBoard } from './assemble.ts'
import type { Competitor, CompetitorLiveSession, CompetitorSnapshot, CompetitorShot } from './types.ts'

test('parseHandleFromUrl: 从主页 URL 抽 handle', () => {
  assert.equal(parseHandleFromUrl('https://www.tiktok.com/@example'), 'example')
  assert.equal(parseHandleFromUrl('tiktok.com/@Foo_Bar/'), 'Foo_Bar')
})

test('parseHandleFromUrl: 裸 @handle / handle / 非法', () => {
  assert.equal(parseHandleFromUrl('@example'), 'example')
  assert.equal(parseHandleFromUrl('example'), 'example')
  assert.equal(parseHandleFromUrl('   '), null)
})

const comp = (over: Partial<Competitor> = {}): Competitor => ({
  id: 'c1', platform: 'tiktok', handle: 'a', profile_url: 'u', display_name: 'A',
  note: '', created_at: '2026-07-01T00:00:00Z', parent_id: null,
  avatar_url: null, region: 'JP', member_count: null, composition: null,
  launch_city: null, launched_on: null, mc_note: null, online_note: null, latest_videos: null,
  ...over,
})
const snap = (captured_on: string, followers: number): CompetitorSnapshot => ({
  id: 's-' + captured_on, competitor_id: 'c1', captured_on, followers,
  likes: null, videos: null, following: null, display_name: null, bio: null,
  region: null, language: null, verified: null, raw: null, captured_at: captured_on + 'T00:00:00Z',
})
const shot = (id: string, shot_on: string | null, sort_order = 0): CompetitorShot => ({
  id, competitor_id: 'c1', image_url: 'https://x/' + id + '.png', shot_on,
  tag: null, caption: '', sort_order, created_at: '2026-07-01T00:00:00Z',
  viewer_count: null, stream_started_at: null, captured_at: null,
})

test('assembleBoard: 挑最新快照 + 历史升序 + 周聚合', () => {
  const board = assembleBoard(
    [comp()],
    [snap('2026-07-29', 30), snap('2026-07-27', 10), snap('2026-08-03', 40)],
    [],
    true,
  )
  assert.equal(board.canEdit, true)
  assert.equal(board.competitors[0].latest?.captured_on, '2026-08-03')
  assert.deepEqual(board.competitors[0].history.map((h) => h.captured_on), ['2026-07-27', '2026-07-29', '2026-08-03'])
  // 两周：W(0727) 末点 30、W(0803) 末点 40。
  // captured_on 带的是被选中那条快照的真实日期——0729 是周三，不等于周一的 0727，
  // 这一条钉住"提示框报的是采集日、不是周桶刻度"一路传到了装配层。
  assert.deepEqual(board.competitors[0].weekly, [
    { week_start: '2026-07-27', followers: 30, captured_on: '2026-07-29' },
    { week_start: '2026-08-03', followers: 40, captured_on: '2026-08-03' },
  ])
})

test('assembleBoard: 截图按 shot_on 倒序（空值垫底）+ sort_order', () => {
  const board = assembleBoard(
    [comp()],
    [],
    [shot('x', null, 5), shot('a', '2026-07-20'), shot('b', '2026-07-25'), shot('c', '2026-07-25', 1)],
    true,
  )
  assert.deepEqual(board.competitors[0].shots.map((s) => s.id), ['b', 'c', 'a', 'x'])
})

test('assembleBoard: 无快照/无截图的竞品', () => {
  const board = assembleBoard([comp({ id: 'c9', handle: 'z' })], [], [], false)
  assert.equal(board.competitors[0].latest, null)
  assert.deepEqual(board.competitors[0].history, [])
  assert.deepEqual(board.competitors[0].shots, [])
  assert.deepEqual(board.competitors[0].weekly, [])
  assert.deepEqual(board.competitors[0].related, [])
  assert.deepEqual(board.competitors[0].live_sessions, [], '不传开播记录时为空数组')
})

test('assembleBoard: 子账号(parent_id)挂到父的 related,首页不平铺', () => {
  const parent = comp({ id: 'p', handle: 'parent' })
  const childA = comp({ id: 'a', handle: 'kidA', parent_id: 'p' })
  const childB = comp({ id: 'b', handle: 'kidB', parent_id: 'p' })
  const board = assembleBoard([parent, childA, childB], [], [], true)
  // 顶层只有父竞品
  assert.deepEqual(board.competitors.map((c) => c.id), ['p'])
  // 子账号挂在父的 related 下,保持顺序
  assert.deepEqual(board.competitors[0].related.map((c) => c.id), ['a', 'b'])
  // 子账号自身仍是完整节点(有空 related)
  assert.deepEqual(board.competitors[0].related[0].related, [])
})

test('assembleBoard: parent_id 悬空则回退为顶层', () => {
  const orphan = comp({ id: 'o', handle: 'orphan', parent_id: 'missing' })
  const board = assembleBoard([orphan], [], [], true)
  assert.deepEqual(board.competitors.map((c) => c.id), ['o'])
})

const live = (id: string, competitor_id: string, started_at: string): CompetitorLiveSession => ({
  id, competitor_id, started_at, ended_at: started_at, title: '', likes: null,
  source: 'tiktok_history', created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-10T00:00:00Z',
})

test('assembleBoard: 开播记录按竞品归组、按开播时刻倒序（按时刻比，不按字符串比）', () => {
  const board = assembleBoard(
    [comp(), comp({ id: 'c2', handle: 'b' })],
    [],
    [],
    true,
    [],
    [
      live('old', 'c1', '2026-09-16T07:47:00+00:00'),
      // 带 +09:00 的写法字符串上「更晚」（10-09 > 10-08），按时刻却是 10-08 23:00Z，
      // 比下面那条早半小时 —— 按字符串排序会把这两条排反。
      live('jst', 'c1', '2026-10-09T08:00:00+09:00'),
      live('latest', 'c1', '2026-10-08T23:30:00.000Z'),
      live('other', 'c2', '2026-10-01T00:00:00Z'),
    ],
  )
  assert.deepEqual(board.competitors[0].live_sessions.map((s) => s.id), ['latest', 'jst', 'old'])
  assert.deepEqual(board.competitors[1].live_sessions.map((s) => s.id), ['other'])
})
