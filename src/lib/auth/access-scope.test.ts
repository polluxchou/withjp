import test from 'node:test'
import assert from 'node:assert/strict'

import {
  accessScopeOf, pageAllowedForScope, scopeAllows, scopedHomePath, scopedWriteAllowed,
} from './access-scope.ts'

test('accessScopeOf：只认 app_metadata.access_scope，空值 = 普通成员', () => {
  assert.equal(accessScopeOf({ provider: 'email', access_scope: 'competitors' }), 'competitors')
  assert.equal(accessScopeOf({ provider: 'email' }), null)
  assert.equal(accessScopeOf({ access_scope: '' }), null)
  assert.equal(accessScopeOf({ access_scope: null }), null)
  assert.equal(accessScopeOf(undefined), null)
  assert.equal(accessScopeOf('competitors'), null)
})

test('accessScopeOf：非字符串的值也算受限（失败从严）', () => {
  assert.equal(accessScopeOf({ access_scope: true }), 'true')
  assert.equal(accessScopeOf({ access_scope: 1 }), '1')
})

test('scopeAllows：普通成员处处放行；受限帐号只在范围对上时放行', () => {
  assert.equal(scopeAllows(null, undefined), true)
  assert.equal(scopeAllows(null, 'competitors'), true)
  assert.equal(scopeAllows('competitors', undefined), false)
  assert.equal(scopeAllows('competitors', 'competitors'), true)
  assert.equal(scopeAllows('finance', 'competitors'), false)
})

test('pageAllowedForScope：受限帐号只能进 /competitors 及其子页', () => {
  for (const p of ['/competitors', '/competitors/live', '/competitors/companies']) {
    assert.equal(pageAllowedForScope('competitors', p), true, p)
  }
  for (const p of ['/', '/creators', '/expenses', '/competitorsx', '/config', '/team/org']) {
    assert.equal(pageAllowedForScope('competitors', p), false, p)
  }
  assert.equal(pageAllowedForScope('finance', '/competitors'), false)
  assert.equal(pageAllowedForScope(null, '/expenses'), true)
})

test('scopedHomePath 带语言前缀', () => {
  assert.equal(scopedHomePath('ja'), '/ja/competitors')
})

test('scopedWriteAllowed：受限帐号不能删，只能改自己建的', () => {
  const me = { id: 'u1', access_scope: 'competitors' }
  assert.equal(scopedWriteAllowed(me, 'delete', 'u1'), false)
  assert.equal(scopedWriteAllowed(me, 'delete', 'u1', 'competitors'), false)
  assert.equal(scopedWriteAllowed(me, 'delete', 'u1', 'competitor_descriptions'), false)
  assert.equal(scopedWriteAllowed(me, 'update', 'u1'), true)
  assert.equal(scopedWriteAllowed(me, 'update', 'u2'), false)
  assert.equal(scopedWriteAllowed(me, 'update', null), false)
})

test('scopedWriteAllowed：受限帐号只能删自己上传的截图，别人的与自动巡检的不行', () => {
  const me = { id: 'u1', access_scope: 'competitors' }
  assert.equal(scopedWriteAllowed(me, 'delete', 'u1', 'competitor_shots'), true)
  assert.equal(scopedWriteAllowed(me, 'delete', 'u2', 'competitor_shots'), false)
  assert.equal(scopedWriteAllowed(me, 'delete', null, 'competitor_shots'), false)
})

test('scopedWriteAllowed：普通成员不受这层限制', () => {
  const member = { id: 'u1', access_scope: null }
  assert.equal(scopedWriteAllowed(member, 'delete', 'u2'), true)
  assert.equal(scopedWriteAllowed(member, 'update', null), true)
})
