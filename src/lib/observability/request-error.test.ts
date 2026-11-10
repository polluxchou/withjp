import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRequestErrorRecord, pathnameOnly } from './request-error.ts'
import { buildClientErrorRecord, reportError } from './report.ts'

const NOW = new Date('2026-11-10T01:02:03.000Z')

test('记录路由、方法、digest、错误名与消息', () => {
  const error = Object.assign(new TypeError('boom'), { digest: '1234567890' })
  const record = buildRequestErrorRecord({
    error,
    request: { path: '/zh/creators/abc', method: 'get' },
    context: { routePath: '/[locale]/creators/[id]', routeType: 'render' },
    now: NOW,
  })
  assert.deepEqual(record, {
    event: 'request_error',
    level: 'error',
    ts: '2026-11-10T01:02:03.000Z',
    path: '/zh/creators/abc',
    method: 'GET',
    route: '/[locale]/creators/[id]',
    routeType: 'render',
    digest: '1234567890',
    name: 'TypeError',
    message: 'boom',
  })
})

test('查询串与 hash 不进日志（里面会有一次性凭据）', () => {
  assert.equal(pathnameOnly('/zh/reset-password?proof=SECRET&code=abc#frag'), '/zh/reset-password')
  assert.equal(pathnameOnly('/api/health'), '/api/health')
  assert.equal(pathnameOnly('?x=1'), '/')
  const record = buildRequestErrorRecord({
    error: new Error('x'),
    request: { path: '/auth/callback?code=SECRET', method: 'GET' },
    now: NOW,
  })
  assert.doesNotMatch(JSON.stringify(record), /SECRET/)
})

test('请求头、cookie、请求体即使被传进来也不会出现在记录里', () => {
  const request = {
    path: '/api/finance',
    method: 'POST',
    headers: { cookie: 'sb-token=COOKIE_SECRET', authorization: 'Bearer AUTH_SECRET' },
    body: 'BODY_SECRET',
  }
  const line = JSON.stringify(buildRequestErrorRecord({ error: new Error('x'), request, now: NOW }))
  assert.doesNotMatch(line, /COOKIE_SECRET|AUTH_SECRET|BODY_SECRET|headers|cookie/)
  assert.deepEqual(Object.keys(JSON.parse(line)).sort(), [
    'digest', 'event', 'level', 'message', 'method', 'name', 'path', 'route', 'routeType', 'ts',
  ])
})

test('抛出来的不是 Error 也能成一条记录', () => {
  for (const thrown of ['plain string', null, undefined, 42, { message: 7 }]) {
    const record = buildRequestErrorRecord({ error: thrown, request: {}, now: NOW })
    assert.equal(record.name, 'Error')
    assert.equal(record.path, '/')
    assert.equal(record.method, 'GET')
    assert.equal(record.digest, null)
    assert.equal(record.route, null)
    assert.equal(record.message, thrown === 'plain string' ? 'plain string' : '')
  }
})

test('超长消息与路径截断', () => {
  const record = buildRequestErrorRecord({
    error: new Error('m'.repeat(5000)),
    request: { path: `/${'p'.repeat(5000)}`, method: 'GET' },
    now: NOW,
  })
  assert.equal(record.message.length, 501)
  assert.equal(record.path.length, 301)
})

test('reportError 输出一行可解析的 JSON', () => {
  const lines: string[] = []
  const record = buildRequestErrorRecord({ error: new Error('line1\nline2'), request: { path: '/x', method: 'GET' }, now: NOW })
  reportError(record, (line) => lines.push(line))
  assert.equal(lines.length, 1)
  assert.doesNotMatch(lines[0], /\n/)
  assert.deepEqual(JSON.parse(lines[0]), record)
})

test('浏览器端边界的记录：只有边界名、digest、错误名与消息', () => {
  const error = Object.assign(new Error('client boom'), { digest: 'd1', stack: 'STACK' })
  assert.deepEqual(buildClientErrorRecord('admin', error), {
    event: 'client_error',
    level: 'error',
    boundary: 'admin',
    digest: 'd1',
    name: 'Error',
    message: 'client boom',
  })
  assert.equal(buildClientErrorRecord('site', null).message, '')
})
