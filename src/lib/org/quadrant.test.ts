import assert from 'node:assert/strict'
import test from 'node:test'

import {
  QUADRANTS, URGENT_WITHIN_DAYS, bucketOf, daysUntil, dueBadge, flattenItems, groupItems,
  ownerKeyOf, ownerOptions, ownerToCarry, pageStop, parseLevel, parseOwnerFilter, quadrantStats, tokyoToday,
  dueInputToPatch, isCalendarDate, validateItemPatch,
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

test('QUADRANTS: 顺序固定 q1→q4，手机端 2×2 方块按它铺在「紧急 | 不紧急」表头下', () => {
  assert.deepEqual(QUADRANTS, ['q1', 'q2', 'q3', 'q4'])
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

test('quadrantStats: 当天到期不算逾期，前一天才算', () => {
  const rows = [
    row({ id: 'today', due_date: TODAY }),
    row({ id: 'yesterday', due_date: '2026-10-14' }),
  ]
  assert.equal(quadrantStats(groupItems(rows, TODAY, 'all'), TODAY).overdue, 1)
  assert.equal(quadrantStats(groupItems(rows.slice(0, 1), TODAY, 'all'), TODAY).overdue, 0)
})

test('quadrantStats: 已评估（重要/不重要）的未完成事项也计入「未指派」，已完成的不计', () => {
  const rows = [
    row({ id: 'imp', is_important: true, ownerKey: 'none' }),
    row({ id: 'notimp', is_important: false, ownerKey: 'none' }),
    row({ id: 'unrated', is_important: null, ownerKey: 'none' }),
    row({ id: 'done', status: 'done', ownerKey: 'none' }),
    row({ id: 'owned', ownerKey: 'user:1' }),
  ]
  assert.equal(quadrantStats(groupItems(rows, TODAY, 'all'), TODAY).unassigned, 3)
})

test('ownerOptions: 负责人排序按 UTF-16 码元，不随运行环境的语言变化（SSR 与浏览器须一致）', () => {
  const rows = [
    row({ id: '1', ownerKey: 'user:1', ownerName: '王五' }),
    row({ id: '2', ownerKey: 'user:2', ownerName: 'Lee' }),
    row({ id: '3', ownerKey: 'user:3', ownerName: '佐藤' }),
    row({ id: '4', ownerKey: 'user:4', ownerName: 'Ann' }),
    row({ id: '5', ownerKey: 'user:5', ownerName: 'bob' }),
    row({ id: '6', ownerKey: 'user:6', ownerName: 'Zed' }),
  ]
  // 大写 Z(0x5A) 先于小写 b(0x62)；CJK 按码点：佐(U+4F50) 先于 王(U+738B)。localeCompare 在常见语言下都不是这个顺序。
  assert.deepEqual(ownerOptions(rows, TODAY, 'open'), [
    { key: 'all', name: null, count: 6 },
    { key: 'user:4', name: 'Ann', count: 1 },
    { key: 'user:2', name: 'Lee', count: 1 },
    { key: 'user:6', name: 'Zed', count: 1 },
    { key: 'user:5', name: 'bob', count: 1 },
    { key: 'user:3', name: '佐藤', count: 1 },
    { key: 'user:1', name: '王五', count: 1 },
  ])
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

test('parseOwnerFilter: 有未指派事项时 none 有效', () => {
  const rows = [row({ ownerKey: 'user:1' }), row({ ownerKey: 'none' })]
  assert.equal(parseOwnerFilter('none', rows), 'none')
})

test('parseLevel: 只认六个桶，其余回首层', () => {
  assert.equal(parseLevel('q3'), 'q3')
  assert.equal(parseLevel('unrated'), 'unrated')
  assert.equal(parseLevel('done'), 'done')
  assert.equal(parseLevel(null), null)
  assert.equal(parseLevel(''), null)
  assert.equal(parseLevel('q9'), null)
})

test('isCalendarDate: 只认真实存在的 2000–2099 年日历日', () => {
  assert.equal(isCalendarDate('2026-10-20'), true)
  assert.equal(isCalendarDate('2028-02-29'), true)
  assert.equal(isCalendarDate('2026-02-29'), false)
  assert.equal(isCalendarDate('2026-02-30'), false)
  assert.equal(isCalendarDate('0002-10-20'), false)
  assert.equal(isCalendarDate('2026-1-5'), false)
  assert.equal(isCalendarDate(''), false)
})

test('isCalendarDate: 年份边界 2000–2099 两端都在内，外侧一格就拒；能通过往返校验的荒谬年份也拒', () => {
  assert.equal(isCalendarDate('1999-12-31'), false)
  assert.equal(isCalendarDate('2000-01-01'), true)
  assert.equal(isCalendarDate('2099-12-31'), true)
  assert.equal(isCalendarDate('2100-01-01'), false)
  // 0202-10-30 是真实存在的日历日（往返校验过得去），只有年份范围能挡住它
  assert.equal(isCalendarDate('0202-10-30'), false)
  assert.equal(dueInputToPatch('0202-10-30'), null)
})

test('pageStop: 层 = 视图 + 手机层级；非法 q 当首层，结构视图不看 q', () => {
  const at = (qs: string) => pageStop(new URLSearchParams(qs))
  assert.deepEqual(at(''), { layer: 'quadrant', owner: null })
  assert.deepEqual(at('q=q1&owner=user:1'), { layer: 'quadrant:q1', owner: 'user:1' })
  assert.deepEqual(at('q=unrated'), { layer: 'quadrant:unrated', owner: null })
  assert.equal(at('q=bogus').layer, 'quadrant')
  assert.equal(at('view=structure&q=q1').layer, 'structure')
  assert.equal(at('view=other').layer, 'quadrant')
})

test('pageStop: owner 缺省与 all 都记成 null（同一个「全部」）', () => {
  assert.equal(pageStop(new URLSearchParams('owner=all')).owner, null)
  assert.equal(pageStop(new URLSearchParams('owner=')).owner, null)
  assert.equal(pageStop(new URLSearchParams('owner=none')).owner, 'none')
})

test('ownerToCarry: 列表层改了筛选再返回首层 → 把列表层的筛选带回首层', () => {
  // 首层 owner=X → 进 q1（push 复制 X）→ 列表层改成 Y（replace）→ 返回落到首层那条还是 X 的历史
  assert.equal(ownerToCarry({ layer: 'quadrant:q1', owner: 'user:2' }, { layer: 'quadrant', owner: 'user:1' }), 'user:2')
  // 首层原本没筛选，列表层选了人
  assert.equal(ownerToCarry({ layer: 'quadrant:q1', owner: 'user:2' }, { layer: 'quadrant', owner: null }), 'user:2')
})

test('ownerToCarry: 列表层改回「全部」再返回 → 回写 null（清掉首层旧筛选）', () => {
  assert.equal(ownerToCarry({ layer: 'quadrant:q1', owner: null }, { layer: 'quadrant', owner: 'user:1' }), null)
})

test('ownerToCarry: 前进手势回到列表层同样带上当前筛选', () => {
  assert.equal(ownerToCarry({ layer: 'quadrant', owner: 'user:3' }, { layer: 'quadrant:q1', owner: 'user:2' }), 'user:3')
})

test('ownerToCarry: 从结构视图返回四象限也带上筛选（切视图不卸载页面根）', () => {
  assert.equal(ownerToCarry({ layer: 'structure', owner: 'user:2' }, { layer: 'quadrant', owner: 'user:1' }), 'user:2')
})

test('ownerToCarry: 不换层或筛选一致 → 不回写', () => {
  // 同层改筛选：就是用户本人刚点的，不能被改回去
  assert.equal(ownerToCarry({ layer: 'quadrant:q1', owner: 'user:1' }, { layer: 'quadrant:q1', owner: 'user:2' }), undefined)
  // push 进层：URL 复制了当前筛选
  assert.equal(ownerToCarry({ layer: 'quadrant', owner: 'user:1' }, { layer: 'quadrant:q1', owner: 'user:1' }), undefined)
  assert.equal(ownerToCarry({ layer: 'quadrant:q1', owner: null }, { layer: 'quadrant', owner: null }), undefined)
})

test('validateItemPatch: 合法输入原样带出，其余键忽略', () => {
  assert.deepEqual(
    validateItemPatch({ is_important: false, due_date: '2026-10-20', status: 'blocked', name: 'x', owner: null }),
    { ok: true, value: { is_important: false, due_date: '2026-10-20', status: 'blocked' } },
  )
  assert.deepEqual(validateItemPatch({ is_important: null, due_date: null }), { ok: true, value: { is_important: null, due_date: null } })
  assert.deepEqual(validateItemPatch({ name: 'only name' }), { ok: true, value: {} })
})

test('validateItemPatch: 拒绝非法值', () => {
  const bad: unknown[] = [
    { is_important: 'yes' }, { is_important: 1 },
    { due_date: '2026-02-30' }, { due_date: '2026/10/20' }, { due_date: '2026-10-20T00:00:00Z' }, { due_date: 20261020 },
    { status: null }, { status: 'cancelled' },
    null, 'x', 42,
  ]
  for (const input of bad) assert.equal(validateItemPatch(input).ok, false, JSON.stringify(input))
})

test('dueInputToPatch: 空串、半截值、荒谬年份都不提交', () => {
  assert.equal(dueInputToPatch(''), null)
  assert.equal(dueInputToPatch('2026-10'), null)
  assert.equal(dueInputToPatch('0002-10-20'), null)
  assert.deepEqual(dueInputToPatch('2026-10-20'), { due_date: '2026-10-20' })
})
