import assert from 'node:assert/strict'
import test from 'node:test'
import { canEditSiteContent } from './site-content.ts'

test('admin 可编辑', () => {
  assert.equal(canEditSiteContent({ id: 'a', is_admin: true, role: 'bd' }), true)
})
// 下面这条是本函数存在的全部意义，不要因为「看起来 ops 该能管内容」就改掉它：
// auth.users 上的建档触发器给每个新帐号建资料行时写死 role: 'ops'。
// ops 是默认角色，不是被授予的权限。
test('ops 不可编辑 —— 它是每个新用户的默认角色', () => {
  assert.equal(canEditSiteContent({ id: 'b', is_admin: false, role: 'ops' }), false)
})
test('其他角色不可编辑', () => {
  assert.equal(canEditSiteContent({ id: 'c', is_admin: false, role: 'bd' }), false)
})
test('未登录不可编辑', () => {
  assert.equal(canEditSiteContent(null), false)
})
