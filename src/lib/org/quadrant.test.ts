import assert from 'node:assert/strict'
import test from 'node:test'

import {
  URGENT_WITHIN_DAYS, bucketOf, daysUntil, dueBadge, flattenItems, groupItems,
  ownerKeyOf, ownerOptions, parseLevel, parseOwnerFilter, quadrantStats, tokyoToday,
} from './quadrant.ts'
import type { QuadrantItemInput, QuadrantRow } from './quadrant.ts'
import type { OrgSnapshot, TaskItem } from '../types/index.ts'

const TODAY = '2026-10-15'
const item = (over: Partial<QuadrantItemInput> = {}): QuadrantItemInput => ({
  is_important: true, due_date: null, status: 'todo', ...over,
})

test('tokyoToday: UTC 14:59 仍是东京当天，UTC 15:00 已是东京次日', () => {
  assert.equal(tokyoToday(new Date('2026-10-15T14:59:59Z')), '2026-10-15')
  assert.equal(tokyoToday(new Date('2026-10-15T15:00:00Z')), '2026-10-16')
})

test('daysUntil: 跨月、跨年、当天、负数', () => {
  assert.equal(daysUntil('2026-11-01', '2026-10-31'), 1)
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1)
  assert.equal(daysUntil('2026-10-15', '2026-10-15'), 0)
  assert.equal(daysUntil('2026-10-14', '2026-10-15'), -1)
})

test('bucketOf: 已完成优先于一切', () => {
  assert.equal(bucketOf(item({ status: 'done', is_important: null }), TODAY), 'done')
  assert.equal(bucketOf(item({ status: 'done', due_date: '2026-10-01' }), TODAY), 'done')
})

test('bucketOf: is_important 为空 → 待评估，哪怕已逾期', () => {
  assert.equal(bucketOf(item({ is_important: null, due_date: '2026-10-01' }), TODAY), 'unrated')
})

test('bucketOf: 迁移未跑时新列是 undefined → 待评估，不抛错', () => {
  assert.equal(bucketOf({ is_important: undefined, due_date: undefined, status: undefined }, TODAY), 'unrated')
})

test('bucketOf: 四个象限各一例', () => {
  assert.equal(bucketOf(item({ is_important: true, due_date: '2026-10-18' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ is_important: true, due_date: '2026-11-30' }), TODAY), 'q2')
  assert.equal(bucketOf(item({ is_important: false, due_date: '2026-10-18' }), TODAY), 'q3')
  assert.equal(bucketOf(item({ is_important: false, due_date: '2026-11-30' }), TODAY), 'q4')
})

test('bucketOf: 紧急边界 — 差 7 天算紧急，差 8 天不算', () => {
  assert.equal(URGENT_WITHIN_DAYS, 7)
  assert.equal(bucketOf(item({ due_date: '2026-10-22' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ due_date: '2026-10-23' }), TODAY), 'q2')
})

test('bucketOf: 当天到期、已逾期算紧急；没有截止日永远不紧急', () => {
  assert.equal(bucketOf(item({ due_date: TODAY }), TODAY), 'q1')
  assert.equal(bucketOf(item({ due_date: '2026-09-01' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ due_date: null }), TODAY), 'q2')
  assert.equal(bucketOf(item({ is_important: false, due_date: null }), TODAY), 'q4')
})

test('bucketOf: 进行中、卡住不影响象限', () => {
  assert.equal(bucketOf(item({ status: 'doing', due_date: '2026-10-16' }), TODAY), 'q1')
  assert.equal(bucketOf(item({ status: 'blocked', due_date: null }), TODAY), 'q2')
})

test('dueBadge: spec 2.3 每一行', () => {
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-13' }), TODAY), { kind: 'overdue', days: 2, tone: 'danger' })
  assert.deepEqual(dueBadge(item({ due_date: TODAY }), TODAY), { kind: 'today', tone: 'warning' })
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-16' }), TODAY), { kind: 'soon', days: 1, date: '10-16', tone: 'warning' })
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-18' }), TODAY), { kind: 'soon', days: 3, date: '10-18', tone: 'warning' })
  assert.deepEqual(dueBadge(item({ due_date: '2026-10-19' }), TODAY), { kind: 'date', date: '10-19', tone: 'muted' })
  assert.equal(dueBadge(item({ due_date: null }), TODAY), null)
  assert.equal(dueBadge(item({ due_date: '2026-10-01', status: 'done' }), TODAY), null)
})

const row = (over: Partial<QuadrantRow> = {}): QuadrantRow => ({
  id: 'r', name: 'r', status: 'todo', is_important: true, due_date: null,
  ownerKey: 'none', ownerName: null, businessName: 'B', taskName: 'T', positionIds: [], order: [1, 1, 1],
  ...over,
})

test('ownerKeyOf: 员工/主播带类型前缀，缺 id 视为未指派', () => {
  assert.equal(ownerKeyOf({ owner_member_type: 'user', owner_user_id: 'u1', owner_creator_id: null }), 'user:u1')
  assert.equal(ownerKeyOf({ owner_member_type: 'creator', owner_user_id: null, owner_creator_id: 'c1' }), 'creator:c1')
  assert.equal(ownerKeyOf({ owner_member_type: 'user', owner_user_id: null, owner_creator_id: null }), 'none')
  assert.equal(ownerKeyOf({ owner_member_type: null, owner_user_id: null, owner_creator_id: null }), 'none')
})

test('flattenItems: 带出业务/任务名、岗位、排序键；旧数据缺新列时兜底为 待评估/未开始/无截止日', () => {
  const legacyItem = {
    id: 'i1', task_id: 't1', name: '事项1', sort_order: 2,
    owner_member_type: 'creator', owner_user_id: null, owner_creator_id: 'c9', owner_name: '主播甲',
  } as unknown as TaskItem
  const snap: OrgSnapshot = {
    people: [], positions: [], canEdit: true,
    businesses: [{
      id: 'b1', key: 'k', name: '业务1', sort_order: 3,
      owner_member_type: null, owner_user_id: null, owner_creator_id: null, owner_name: null,
      tasks: [{ id: 't1', business_id: 'b1', name: '任务1', sort_order: 4, position_ids: ['p1'], items: [legacyItem] }],
    }],
  }
  assert.deepEqual(flattenItems(snap), [{
    id: 'i1', name: '事项1', status: 'todo', is_important: null, due_date: null,
    ownerKey: 'creator:c9', ownerName: '主播甲', businessName: '业务1', taskName: '任务1',
    positionIds: ['p1'], order: [3, 4, 2],
  }])
})

test('groupItems: 同格按截止日升序，无截止日排最后，同日按 业务/任务/事项 顺序', () => {
  const rows = [
    row({ id: 'a', due_date: null, order: [1, 1, 1] }),
    row({ id: 'b', due_date: '2026-11-20', order: [2, 1, 1] }),
    row({ id: 'c', due_date: '2026-11-20', order: [1, 2, 1] }),
    row({ id: 'd', due_date: '2026-11-01', order: [9, 9, 9] }),
  ]
  assert.deepEqual(groupItems(rows, TODAY, 'all').q2.map((r) => r.id), ['d', 'c', 'b', 'a'])
})

test('groupItems: 按负责人筛选，含「未指派」，员工与主播同 id 互不混', () => {
  const rows = [row({ id: 'u', ownerKey: 'user:1' }), row({ id: 'n', ownerKey: 'none' }), row({ id: 'c', ownerKey: 'creator:1' })]
  assert.deepEqual(groupItems(rows, TODAY, 'user:1').q2.map((r) => r.id), ['u'])
  assert.deepEqual(groupItems(rows, TODAY, 'none').q2.map((r) => r.id), ['n'])
  assert.deepEqual(groupItems(rows, TODAY, 'creator:1').q2.map((r) => r.id), ['c'])
  assert.equal(groupItems(rows, TODAY, 'all').q2.length, 3)
})

test('quadrantStats: 未完成/逾期/卡住/待评估/未指派；已完成不计；筛选后重算', () => {
  const rows = [
    row({ id: '1', due_date: '2026-10-10', ownerKey: 'user:1' }),               // q1，逾期
    row({ id: '2', status: 'blocked', ownerKey: 'user:1' }),                    // q2，卡住
    row({ id: '3', is_important: null, ownerKey: 'none' }),                     // 待评估 + 未指派
    row({ id: '4', status: 'done', due_date: '2026-10-01', ownerKey: 'none' }), // 已完成：都不计
  ]
  assert.deepEqual(quadrantStats(groupItems(rows, TODAY, 'all'), TODAY), { open: 3, overdue: 1, blocked: 1, unrated: 1, unassigned: 1 })
  assert.deepEqual(quadrantStats(groupItems(rows, TODAY, 'user:1'), TODAY), { open: 2, overdue: 1, blocked: 1, unrated: 0, unassigned: 0 })
})

test('ownerOptions: 全部在前，人按姓名，未指派在后；同名或同 id 的员工/主播是两个选项', () => {
  const rows = [
    row({ id: '1', ownerKey: 'user:x', ownerName: 'Lee' }),
    row({ id: '2', ownerKey: 'creator:x', ownerName: 'Lee' }),
    row({ id: '3', ownerKey: 'user:y', ownerName: 'Ann', status: 'done' }),
    row({ id: '4', ownerKey: 'none' }),
  ]
  assert.deepEqual(ownerOptions(rows, TODAY, 'open'), [
    { key: 'all', name: null, count: 3 },
    { key: 'user:y', name: 'Ann', count: 0 },
    { key: 'creator:x', name: 'Lee', count: 1 },
    { key: 'user:x', name: 'Lee', count: 1 },
    { key: 'none', name: null, count: 1 },
  ])
})

test('ownerOptions: 列表层按当前格计数；没有未指派事项时不出现「未指派」', () => {
  const rows = [
    row({ id: '1', ownerKey: 'user:x', ownerName: 'Lee', due_date: '2026-10-16' }), // q1
    row({ id: '2', ownerKey: 'user:x', ownerName: 'Lee' }),                         // q2
  ]
  assert.deepEqual(ownerOptions(rows, TODAY, 'q1').map((o) => [o.key, o.count]), [['all', 1], ['user:x', 1]])
})

test('parseOwnerFilter: 失效或乱填的值回落到「全部」', () => {
  const rows = [row({ ownerKey: 'user:1' })]
  assert.equal(parseOwnerFilter(null, rows), 'all')
  assert.equal(parseOwnerFilter('all', rows), 'all')
  assert.equal(parseOwnerFilter('user:1', rows), 'user:1')
  assert.equal(parseOwnerFilter('user:999', rows), 'all')
  assert.equal(parseOwnerFilter('none', rows), 'all')
  assert.equal(parseOwnerFilter('<script>', rows), 'all')
})

test('parseLevel: 只认六个桶，其余回首层', () => {
  assert.equal(parseLevel('q3'), 'q3')
  assert.equal(parseLevel('unrated'), 'unrated')
  assert.equal(parseLevel('done'), 'done')
  assert.equal(parseLevel(null), null)
  assert.equal(parseLevel(''), null)
  assert.equal(parseLevel('q9'), null)
})
