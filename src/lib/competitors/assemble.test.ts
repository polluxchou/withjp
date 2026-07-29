// src/lib/competitors/assemble.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseHandleFromUrl, assembleBoard } from './assemble.ts'
import type { Competitor, CompetitorSnapshot, CompetitorShot } from './types.ts'

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
  note: '', created_at: '2026-07-01T00:00:00Z',
  avatar_url: null, region: 'JP', member_count: null, composition: null,
  launch_city: null, launched_on: null, mc_note: null, online_note: null, latest_videos: null,
  ...over,
})
const snap = (captured_on: string, followers: number): CompetitorSnapshot => ({
  id: 's-' + captured_on, competitor_id: 'c1', captured_on, followers,
  likes: null, videos: null, following: null, display_name: null, bio: null,
  region: null, verified: null, raw: null, captured_at: captured_on + 'T00:00:00Z',
})
const shot = (id: string, shot_on: string | null, sort_order = 0): CompetitorShot => ({
  id, competitor_id: 'c1', image_url: 'https://x/' + id + '.png', shot_on,
  tag: null, caption: '', sort_order, created_at: '2026-07-01T00:00:00Z',
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
  // 两周：W(0727) 末点 30、W(0803) 末点 40
  assert.deepEqual(board.competitors[0].weekly, [
    { week_start: '2026-07-27', followers: 30 },
    { week_start: '2026-08-03', followers: 40 },
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
})
