import assert from 'node:assert/strict'
import test from 'node:test'

import {
  validatePersonRef, ownerNameOf, sortByOrder,
  applyAddTask, applyDeleteTask, applyAddItem, applyDeleteItem,
  applySetBusinessOwner, applySetItemOwner,
  applyAddMember, applyRemoveMember, applySetTaskPositions,
} from './tree.ts'
import type { OrgSnapshot, PersonOption } from '../types/index.ts'

const people: PersonOption[] = [
  { member_type: 'user',    id: 'u1', name: '张三' },
  { member_type: 'creator', id: 'c1', name: '主播A' },
]

// 就地更新用的基础快照工厂（每次全新，便于断言不可变性）
const baseSnapshot = (): OrgSnapshot => ({
  people,
  positions: [
    { id: 'p1', key: 'ops', name: '运营', description: '', sort_order: 1, members: [] },
  ],
  businesses: [
    {
      id: 'b1', key: 'biz1', name: '业务1', sort_order: 1,
      owner_member_type: null, owner_user_id: null, owner_creator_id: null, owner_name: null,
      tasks: [
        {
          id: 't1', business_id: 'b1', name: '任务1', sort_order: 1, position_ids: [],
          items: [
            { id: 'i1', task_id: 't1', name: '事项1', sort_order: 1, owner_member_type: null, owner_user_id: null, owner_creator_id: null, owner_name: null },
          ],
        },
      ],
    },
  ],
  canEdit: true,
})

test('validatePersonRef: user 型必须只有 user_id', () => {
  assert.equal(validatePersonRef({ member_type: 'user', user_id: 'u1', creator_id: null }), true)
  assert.equal(validatePersonRef({ member_type: 'user', user_id: null, creator_id: null }), false)
  assert.equal(validatePersonRef({ member_type: 'user', user_id: 'u1', creator_id: 'c1' }), false)
})

test('validatePersonRef: creator 型必须只有 creator_id', () => {
  assert.equal(validatePersonRef({ member_type: 'creator', user_id: null, creator_id: 'c1' }), true)
  assert.equal(validatePersonRef({ member_type: 'creator', user_id: 'u1', creator_id: null }), false)
})

test('ownerNameOf: 按 member_type 从候选人里查名字，查不到返回 null', () => {
  assert.equal(ownerNameOf({ member_type: 'user', user_id: 'u1', creator_id: null }, people), '张三')
  assert.equal(ownerNameOf({ member_type: 'creator', user_id: null, creator_id: 'c1' }, people), '主播A')
  assert.equal(ownerNameOf({ member_type: 'user', user_id: 'uX', creator_id: null }, people), null)
  assert.equal(ownerNameOf({ member_type: 'user', user_id: null, creator_id: null }, people), null)
})

test('sortByOrder: 按 sort_order 升序（稳定）', () => {
  const input = [{ sort_order: 2, name: 'b' }, { sort_order: 1, name: 'a' }, { sort_order: 2, name: 'c' }]
  assert.deepEqual(sortByOrder(input).map((x) => x.name), ['a', 'b', 'c'])
})

test('applyAddTask: 在对应业务末尾追加空任务，sort_order 递增', () => {
  const s = baseSnapshot()
  const next = applyAddTask(s, 'b1', 't2', '任务2')
  const tasks = next.businesses[0].tasks
  assert.equal(tasks.length, 2)
  assert.deepEqual({ id: tasks[1].id, name: tasks[1].name, position_ids: tasks[1].position_ids, items: tasks[1].items }, { id: 't2', name: '任务2', position_ids: [], items: [] })
  assert.equal(tasks[1].sort_order, 2)
  // 不可变：原快照未被修改
  assert.equal(s.businesses[0].tasks.length, 1)
})

test('applyDeleteTask: 移除指定任务，其余不动', () => {
  const s = applyAddTask(baseSnapshot(), 'b1', 't2', '任务2')
  const next = applyDeleteTask(s, 't1')
  assert.deepEqual(next.businesses[0].tasks.map((t) => t.id), ['t2'])
  assert.equal(s.businesses[0].tasks.length, 2) // 原快照不变
})

test('applyAddItem: 在对应任务末尾追加事项（无负责人）', () => {
  const next = applyAddItem(baseSnapshot(), 't1', 'i2', '事项2')
  const items = next.businesses[0].tasks[0].items
  assert.equal(items.length, 2)
  assert.equal(items[1].id, 'i2')
  assert.equal(items[1].name, '事项2')
  assert.equal(items[1].owner_name ?? null, null)
})

test('applyDeleteItem: 移除指定事项', () => {
  const next = applyDeleteItem(baseSnapshot(), 'i1')
  assert.equal(next.businesses[0].tasks[0].items.length, 0)
})

test('applySetBusinessOwner: 设置负责人写入 ref 与显示名；传 null 清除', () => {
  const set = applySetBusinessOwner(baseSnapshot(), 'b1', { member_type: 'user', id: 'u1', name: '张三' })
  const b = set.businesses[0]
  assert.equal(b.owner_name, '张三')
  assert.equal(b.owner_member_type, 'user')
  assert.equal(b.owner_user_id, 'u1')
  assert.equal(b.owner_creator_id, null)

  const cleared = applySetBusinessOwner(set, 'b1', null)
  const cb = cleared.businesses[0]
  assert.equal(cb.owner_name ?? null, null)
  assert.equal(cb.owner_member_type, null)
  assert.equal(cb.owner_user_id, null)
})

test('applySetItemOwner: 主播负责人写入 creator_id 与显示名', () => {
  const next = applySetItemOwner(baseSnapshot(), 'i1', { member_type: 'creator', id: 'c1', name: '主播A' })
  const it = next.businesses[0].tasks[0].items[0]
  assert.equal(it.owner_name, '主播A')
  assert.equal(it.owner_member_type, 'creator')
  assert.equal(it.owner_creator_id, 'c1')
  assert.equal(it.owner_user_id, null)
})

test('applyAddMember: 岗位追加成员，带 display_name 与正确的 id 字段', () => {
  const next = applyAddMember(baseSnapshot(), 'p1', 'm1', { member_type: 'user', id: 'u1', name: '张三' })
  const members = next.positions[0].members
  assert.equal(members.length, 1)
  assert.equal(members[0].id, 'm1')
  assert.equal(members[0].position_id, 'p1')
  assert.equal(members[0].member_type, 'user')
  assert.equal(members[0].user_id, 'u1')
  assert.equal(members[0].display_name, '张三')
})

test('applyRemoveMember: 从岗位移除指定成员', () => {
  const withMember = applyAddMember(baseSnapshot(), 'p1', 'm1', { member_type: 'user', id: 'u1', name: '张三' })
  const next = applyRemoveMember(withMember, 'p1', 'm1')
  assert.equal(next.positions[0].members.length, 0)
})

test('applySetTaskPositions: 更新任务关联岗位并去重', () => {
  const next = applySetTaskPositions(baseSnapshot(), 't1', ['p1', 'p1', 'p2'])
  assert.deepEqual(next.businesses[0].tasks[0].position_ids, ['p1', 'p2'])
})
