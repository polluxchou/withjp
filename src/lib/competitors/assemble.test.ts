import assert from 'node:assert/strict'
import test from 'node:test'

import { parseHandleFromUrl, assembleBoard } from './assemble.ts'
import type { Competitor, CompetitorSnapshot } from './types.ts'

test('parseHandleFromUrl: 从主页 URL 抽 handle', () => {
  assert.equal(parseHandleFromUrl('https://www.tiktok.com/@example'), 'example')
  assert.equal(parseHandleFromUrl('https://www.tiktok.com/@example?lang=en'), 'example')
  assert.equal(parseHandleFromUrl('tiktok.com/@Foo_Bar/'), 'Foo_Bar')
})

test('parseHandleFromUrl: 裸 @handle 或 handle', () => {
  assert.equal(parseHandleFromUrl('@example'), 'example')
  assert.equal(parseHandleFromUrl('example'), 'example')
})

test('parseHandleFromUrl: 非法返回 null', () => {
  assert.equal(parseHandleFromUrl(''), null)
  assert.equal(parseHandleFromUrl('   '), null)
})

test('assembleBoard: 每个竞品挑最新快照 + 历史升序', () => {
  const competitors: Competitor[] = [
    { id: 'c1', platform: 'tiktok', handle: 'a', profile_url: 'u', display_name: 'A', note: '', created_at: '2026-07-01T00:00:00Z' },
  ]
  const snap = (captured_on: string, followers: number): CompetitorSnapshot => ({
    id: 's-' + captured_on, competitor_id: 'c1', captured_on, followers,
    likes: null, videos: null, following: null, display_name: null, bio: null,
    region: null, verified: null, raw: null, captured_at: captured_on + 'T00:00:00Z',
  })
  const snapshots = [snap('2026-07-03', 30), snap('2026-07-01', 10), snap('2026-07-02', 20)]

  const board = assembleBoard(competitors, snapshots, true)

  assert.equal(board.canEdit, true)
  assert.equal(board.competitors.length, 1)
  assert.equal(board.competitors[0].latest?.captured_on, '2026-07-03')
  assert.deepEqual(board.competitors[0].history.map((h) => h.captured_on), ['2026-07-01', '2026-07-02', '2026-07-03'])
  assert.deepEqual(board.competitors[0].history.map((h) => h.followers), [10, 20, 30])
})

test('assembleBoard: 无快照的竞品 latest=null history=[]', () => {
  const competitors: Competitor[] = [
    { id: 'c9', platform: 'tiktok', handle: 'z', profile_url: 'u', display_name: null, note: '', created_at: '2026-07-01T00:00:00Z' },
  ]
  const board = assembleBoard(competitors, [], false)
  assert.equal(board.competitors[0].latest, null)
  assert.deepEqual(board.competitors[0].history, [])
})
