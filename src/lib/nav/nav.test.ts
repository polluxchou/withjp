// src/lib/nav/nav.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { hrefWithQuery, isNavActive, resolveNavQuery } from './nav.ts'

// 无 query 的 leaf —— 现有行为一条都不能变
test('leaf without query: exact 精确匹配，非 exact 匹配自身与子路径', () => {
  const params = new URLSearchParams()
  assert.equal(isNavActive('/creators', params, { href: '/creators', exact: true }), true)
  assert.equal(isNavActive('/creators/abc', params, { href: '/creators', exact: true }), false)
  assert.equal(isNavActive('/expenses', params, { href: '/expenses' }), true)
  assert.equal(isNavActive('/expenses/2026', params, { href: '/expenses' }), true)
  assert.equal(isNavActive('/timeline', params, { href: '/expenses' }), false)
})

test('根路径只在自己身上亮，不做前缀匹配', () => {
  const params = new URLSearchParams()
  assert.equal(isNavActive('/', params, { href: '/' }), true)
  assert.equal(isNavActive('/creators', params, { href: '/' }), false)
})

test('兄弟路径共享前缀时不互相串亮', () => {
  const params = new URLSearchParams()
  // /team 是 exact，/team/assignments 不该把它点亮
  assert.equal(isNavActive('/team/assignments', params, { href: '/team', exact: true }), false)
  // 裸前缀延长（/teamfoo）不该匹配 /team —— 旧的 startsWith 实现会误亮
  assert.equal(isNavActive('/teamfoo', params, { href: '/team' }), false)
})

// query 深链 —— 本轮新增能力
test('?view=ai 只点亮 AI 任务那一条', () => {
  const params = new URLSearchParams('view=ai')
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'ai' } }), true)
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'workload' } }), false)
})

test('?view=workload 只点亮人员任务那一条', () => {
  const params = new URLSearchParams('view=workload')
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'workload' } }), true)
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'ai' } }), false)
})

test('裸 /tasks 走页面默认 tab，不出现两条都不亮', () => {
  const params = new URLSearchParams()
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'workload' } }), true)
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'ai' } }), false)
})

test('非法 view 值回落到默认 tab，同样不会两条都不亮', () => {
  const params = new URLSearchParams('view=bogus')
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'workload' } }), true)
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'ai' } }), false)
})

test('pathname 不匹配时，query 对得上也不亮', () => {
  const params = new URLSearchParams('view=ai')
  assert.equal(isNavActive('/timeline', params, { href: '/tasks', query: { view: 'ai' } }), false)
})

test('searchParams 为 null（SSR 首帧）时按默认值判定', () => {
  assert.equal(isNavActive('/tasks', null, { href: '/tasks', query: { view: 'workload' } }), true)
  assert.equal(isNavActive('/tasks', null, { href: '/tasks', query: { view: 'ai' } }), false)
})

// resolveNavQuery —— 导航和 /tasks 页面共用的兜底口径
test('resolveNavQuery 把缺失和非法值都收敛到默认值', () => {
  assert.equal(resolveNavQuery('/tasks', 'view', null), 'workload')
  assert.equal(resolveNavQuery('/tasks', 'view', 'bogus'), 'workload')
  assert.equal(resolveNavQuery('/tasks', 'view', 'ai'), 'ai')
  assert.equal(resolveNavQuery('/tasks', 'view', 'workload'), 'workload')
})

test('resolveNavQuery 对未登记的路径/参数原样返回', () => {
  assert.equal(resolveNavQuery('/expenses', 'view', null), null)
  assert.equal(resolveNavQuery('/expenses', 'view', 'x'), 'x')
  assert.equal(resolveNavQuery('/tasks', 'unknown', null), null)
})

// hrefWithQuery
test('hrefWithQuery 无 query 时原样返回，有 query 时拼上问号', () => {
  assert.equal(hrefWithQuery({ href: '/expenses' }), '/expenses')
  assert.equal(hrefWithQuery({ href: '/tasks', query: { view: 'ai' } }), '/tasks?view=ai')
  assert.equal(hrefWithQuery({ href: '/tasks', query: {} }), '/tasks')
})
