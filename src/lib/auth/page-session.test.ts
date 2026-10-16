import test from 'node:test'
import assert from 'node:assert/strict'

import { createPageSessionGuard, loginPathForLocale } from './page-session.ts'

type User = { id: string }

// next/navigation 的 redirect() 会抛错中断渲染、永不返回。假依赖照样抛，
// 同时记下跳转地址。
class Redirected extends Error {
  path: string
  constructor(path: string) {
    super(`redirect ${path}`)
    this.path = path
  }
}

function guardWith(getUser: () => Promise<User | null>) {
  const redirects: string[] = []
  const requirePageUser = createPageSessionGuard<User>({
    getUser,
    redirect: (path) => {
      redirects.push(path)
      throw new Redirected(path)
    },
  })
  return { requirePageUser, redirects }
}

test('登录页地址跟随路由语言', () => {
  assert.equal(loginPathForLocale('zh'), '/zh/login')
  assert.equal(loginPathForLocale('en'), '/en/login')
  assert.equal(loginPathForLocale('ja'), '/ja/login')
})

test('不认识的语言一律回默认语言，不把原样字符串拼进跳转地址', () => {
  assert.equal(loginPathForLocale(undefined), '/zh/login')
  assert.equal(loginPathForLocale(''), '/zh/login')
  assert.equal(loginPathForLocale('fr'), '/zh/login')
  assert.equal(loginPathForLocale('//evil.example'), '/zh/login')
  assert.equal(loginPathForLocale('en/../../x'), '/zh/login')
})

test('已登录：原样返回当前用户，不跳转', async () => {
  const { requirePageUser, redirects } = guardWith(async () => ({ id: 'u1' }))
  assert.deepEqual(await requirePageUser('en'), { id: 'u1' })
  assert.deepEqual(redirects, [])
})

test('未登录：跳到同语言的登录页，且不往下渲染', async () => {
  const { requirePageUser, redirects } = guardWith(async () => null)
  await assert.rejects(requirePageUser('ja'), (e) => e instanceof Redirected && e.path === '/ja/login')
  assert.deepEqual(redirects, ['/ja/login'])
})

test('取会话出错按未登录处理（不放行，也不把错误抛成 500）', async () => {
  const { requirePageUser, redirects } = guardWith(async () => {
    throw new Error('jwks fetch failed')
  })
  await assert.rejects(requirePageUser('en'), (e) => e instanceof Redirected && e.path === '/en/login')
  assert.deepEqual(redirects, ['/en/login'])
})

test('路由语言异常时跳默认语言的登录页', async () => {
  const { requirePageUser, redirects } = guardWith(async () => null)
  await assert.rejects(requirePageUser('xx'), Redirected)
  assert.deepEqual(redirects, ['/zh/login'])
})
