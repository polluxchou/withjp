import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCoLiveView, type CoLiveReading } from './coLive.ts'

const SELF = 'self-id'

function r(over: Partial<CoLiveReading> & { competitorId: string }): CoLiveReading {
  return {
    handle: over.competitorId,
    displayName: null,
    source: 'sidebar',
    viewerCount: null,
    viewerText: null,
    ...over,
  }
}

test('按人数降序，并列同名次、下一名次跳过（212/117/117/67 → 1/2/2/4）', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'c', viewerCount: 117, viewerText: '117' }),
    r({ competitorId: SELF, viewerCount: 67, viewerText: '67' }),
    r({ competitorId: 'a', viewerCount: 212, viewerText: '212' }),
    r({ competitorId: 'b', viewerCount: 117, viewerText: '117' }),
  ], SELF)
  assert.ok(v)
  assert.deepEqual(v.rows.map((x) => [x.competitorId, x.rank]), [['a', 1], ['b', 2], ['c', 2], [SELF, 4]])
  assert.equal(v.total, 4)
  assert.equal(v.selfRank, 4)
  assert.equal(v.selfFromCurrent, false)
})

test('本号同时有 sidebar 行与 current 行：只出现一次，用 sidebar 行的数', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 100 }),
    r({ competitorId: SELF, source: 'current', viewerCount: 999 }),
    r({ competitorId: SELF, viewerCount: 50 }),
  ], SELF)
  assert.ok(v)
  const self = v.rows.filter((x) => x.isSelf)
  assert.equal(self.length, 1)
  assert.equal(self[0].viewerCount, 50)
  assert.equal(v.selfFromCurrent, false)
})

test('本号不在 Following 里：退回 current 行，selfFromCurrent 为 true', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 100 }),
    r({ competitorId: SELF, source: 'current', viewerCount: 80 }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.selfFromCurrent, true)
  assert.equal(v.selfRank, 2)
  assert.equal(v.rows.find((x) => x.isSelf)?.viewerCount, 80)
})

test('别家的 current 行不参与（只有本号才能用 current 回退）', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', source: 'current', viewerCount: 100 }),
    r({ competitorId: 'b', viewerCount: 60 }),
    r({ competitorId: SELF, viewerCount: 40 }),
  ], SELF)
  assert.ok(v)
  assert.deepEqual(v.rows.map((x) => x.competitorId), ['b', SELF])
})

test('解析失败的行排末尾、rank 为 null、barRatio 为 0、保留原文', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: null, viewerText: '1.2K' }),
    r({ competitorId: SELF, viewerCount: 40, viewerText: '40' }),
    r({ competitorId: 'b', viewerCount: 60, viewerText: '60' }),
  ], SELF)
  assert.ok(v)
  const last = v.rows[v.rows.length - 1]
  assert.equal(last.competitorId, 'a')
  assert.equal(last.rank, null)
  assert.equal(last.barRatio, 0)
  assert.equal(last.viewerText, '1.2K')
  assert.equal(v.selfRank, 2)
})

test('全部解析失败：不除零、全员 rank null、selfRank null、名单仍在', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerText: '1.2K' }),
    r({ competitorId: SELF, viewerText: '?' }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.total, 2)
  assert.equal(v.selfRank, null)
  assert.ok(v.rows.every((x) => x.rank === null && x.barRatio === 0))
})

test('barRatio 以本批最大值为分母', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 200 }),
    r({ competitorId: SELF, viewerCount: 50 }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.rows[0].barRatio, 1)
  assert.equal(v.rows[1].barRatio, 0.25)
})

test('最大值为 0：全员 barRatio 为 0，不出 NaN', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 0 }),
    r({ competitorId: SELF, viewerCount: 0 }),
  ], SELF)
  assert.ok(v)
  assert.ok(v.rows.every((x) => x.barRatio === 0))
})

test('label 取 displayName，空则 handle', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', handle: 'a_handle', displayName: 'A 社', viewerCount: 10 }),
    r({ competitorId: SELF, handle: 'self_handle', displayName: '', viewerCount: 5 }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.rows[0].label, 'A 社')
  assert.equal(v.rows[1].label, 'self_handle')
})

test('空输入返回 null', () => {
  assert.equal(buildCoLiveView([], SELF), null)
})

test('只有本号一行返回 null（没有可比对象）', () => {
  assert.equal(buildCoLiveView([r({ competitorId: SELF, viewerCount: 10 })], SELF), null)
  assert.equal(buildCoLiveView([r({ competitorId: SELF, source: 'current', viewerCount: 10 })], SELF), null)
})

test('只有别家、本号一行都没有：名单照出，selfRank null', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', viewerCount: 10 }),
    r({ competitorId: 'b', viewerCount: 20 }),
  ], SELF)
  assert.ok(v)
  assert.equal(v.total, 2)
  assert.equal(v.selfRank, null)
  assert.ok(v.rows.every((x) => !x.isSelf))
})

test('同人数按界面 label 定序：label 顺序与 competitorId 顺序相反时以 label 为准', () => {
  const v = buildCoLiveView([
    r({ competitorId: 'a', displayName: 'Z 社', viewerCount: 50 }),
    r({ competitorId: 'b', displayName: 'A 社', viewerCount: 50 }),
    r({ competitorId: SELF, viewerCount: 10 }),
  ], SELF)
  assert.ok(v)
  assert.deepEqual(v.rows.map((x) => [x.competitorId, x.label, x.rank]), [
    ['b', 'A 社', 1],
    ['a', 'Z 社', 1],
    [SELF, 'self-id', 3],
  ])
})
