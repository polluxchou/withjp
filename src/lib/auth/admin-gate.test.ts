import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createAdminGate,
  FORBIDDEN_BODY,
  isAdmin,
  salaryReadScope,
  writeFailureMessage,
  type AdminActor,
} from './admin-gate.ts'

// 用真实的 createAdminGate 跑一遍，只把查库和造响应换成记录调用的假依赖。
function gateWith(actor: AdminActor | null) {
  const lookups: string[] = []
  const responses: { body: unknown; init: { status: number } }[] = []
  const forbidUnlessAdmin = createAdminGate({
    getActorProfile: async (userId) => {
      lookups.push(userId)
      return actor
    },
    respond: (body, init) => {
      responses.push({ body, init })
      return { kind: 'response' as const, status: init.status }
    },
  })
  return { forbidUnlessAdmin, lookups, responses }
}

test('管理员放行：返回 null，不造响应，按当前用户 id 查 profile', async () => {
  const g = gateWith({ is_admin: true })
  assert.equal(await g.forbidUnlessAdmin('user-1'), null)
  assert.deepEqual(g.lookups, ['user-1'])
  assert.deepEqual(g.responses, [])
})

test('非管理员 403，body 与其余接口的 { data, error } 形状一致', async () => {
  const g = gateWith({ is_admin: false })
  assert.deepEqual(await g.forbidUnlessAdmin('user-2'), { kind: 'response', status: 403 })
  assert.deepEqual(g.responses, [{ body: { data: null, error: 'Forbidden' }, init: { status: 403 } }])
})

test('查不到 profile 行按拒绝处理（403），不放行', async () => {
  const g = gateWith(null)
  assert.deepEqual(await g.forbidUnlessAdmin('user-3'), { kind: 'response', status: 403 })
  assert.equal(g.responses.length, 1)
})

test('查 profile 出错时向上抛，不吞成放行', async () => {
  const forbidUnlessAdmin = createAdminGate({
    getActorProfile: async () => { throw new Error('db down') },
    respond: () => 'response',
  })
  await assert.rejects(forbidUnlessAdmin('user-4'), /db down/)
})

// role 不参与判定：ops 是每个新建档用户的默认角色（见 site-content.ts）。
test('isAdmin 只认 is_admin === true', () => {
  assert.equal(isAdmin({ is_admin: true }), true)
  assert.equal(isAdmin({ is_admin: false }), false)
  assert.equal(isAdmin({ is_admin: false, role: 'ops' } as AdminActor), false)
  assert.equal(isAdmin(null), false)
  assert.equal(isAdmin(undefined), false)
  // 防御：库里若出现非布尔的真值，也不当管理员。
  assert.equal(isAdmin({ is_admin: 'true' } as unknown as AdminActor), false)
  assert.equal(isAdmin({ is_admin: 1 } as unknown as AdminActor), false)
})

test('FORBIDDEN_BODY 固定为 { data: null, error: "Forbidden" }', () => {
  assert.deepEqual(FORBIDDEN_BODY, { data: null, error: 'Forbidden' })
})

const MSGS = { forbidden: '仅管理员可以执行此操作', fallback: '保存失败' }

test('writeFailureMessage：403 一律给友好提示，不露出服务端的 Forbidden', () => {
  assert.equal(writeFailureMessage(403, 'Forbidden', MSGS), MSGS.forbidden)
  assert.equal(writeFailureMessage(403, undefined, MSGS), MSGS.forbidden)
})

test('writeFailureMessage：其余失败优先用服务端错误信息，没有就用兜底文案', () => {
  assert.equal(writeFailureMessage(400, 'key and value are required', MSGS), 'key and value are required')
  assert.equal(writeFailureMessage(500, '', MSGS), MSGS.fallback)
  assert.equal(writeFailureMessage(500, '   ', MSGS), MSGS.fallback)
  assert.equal(writeFailureMessage(502, null, MSGS), MSGS.fallback)
  assert.equal(writeFailureMessage(500, { message: 'x' }, MSGS), MSGS.fallback)
})

const ADMIN = { is_admin: true }
const MEMBER = { is_admin: false }

test('薪资读取：管理员不带 user_id 看全部，带了就按人筛', () => {
  assert.deepEqual(salaryReadScope(ADMIN, 'admin-1', null), { ok: true, userId: null })
  assert.deepEqual(salaryReadScope(ADMIN, 'admin-1', 'user-9'), { ok: true, userId: 'user-9' })
  assert.deepEqual(salaryReadScope(ADMIN, 'admin-1', ''), { ok: true, userId: null })
})

test('薪资读取：非管理员不带 user_id 时收窄到本人（工时页拉 ?current=true 走这条）', () => {
  assert.deepEqual(salaryReadScope(MEMBER, 'user-2', null), { ok: true, userId: 'user-2' })
  assert.deepEqual(salaryReadScope(MEMBER, 'user-2', ''), { ok: true, userId: 'user-2' })
  assert.deepEqual(salaryReadScope(MEMBER, 'user-2', 'user-2'), { ok: true, userId: 'user-2' })
})

test('薪资读取：非管理员指名要别人的记录 → 拒绝', () => {
  assert.deepEqual(salaryReadScope(MEMBER, 'user-2', 'user-3'), { ok: false })
})

test('薪资读取：查不到 profile 的人按非管理员处理，只能读自己', () => {
  assert.deepEqual(salaryReadScope(null, 'user-4', null), { ok: true, userId: 'user-4' })
  assert.deepEqual(salaryReadScope(null, 'user-4', 'user-5'), { ok: false })
})
