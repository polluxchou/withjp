import assert from 'node:assert/strict'
import test from 'node:test'

import {
  REQUIRED_ENV,
  checkRequiredEnv,
  createHealthCache,
  httpStatusForHealth,
  runHealthChecks,
  summarizeHealth,
} from './health.ts'

const FULL_ENV = Object.fromEntries(REQUIRED_ENV.map((key) => [key, `value-of-${key}`]))

test('必要环境变量：齐了才 ok，空串与纯空白算缺', () => {
  assert.equal(checkRequiredEnv(FULL_ENV), 'ok')
  for (const key of REQUIRED_ENV) {
    assert.equal(checkRequiredEnv({ ...FULL_ENV, [key]: undefined }), 'fail', key)
    assert.equal(checkRequiredEnv({ ...FULL_ENV, [key]: '   ' }), 'fail', key)
  }
})

test('全部通过是 ok / 200，任何一项失败是 degraded / 503', () => {
  const ok = summarizeHealth({ env: 'ok', database: 'ok' })
  assert.deepEqual(ok, { status: 'ok', checks: { env: 'ok', database: 'ok' } })
  assert.equal(httpStatusForHealth(ok), 200)
  const degraded = summarizeHealth({ env: 'ok', database: 'fail' })
  assert.equal(degraded.status, 'degraded')
  assert.equal(httpStatusForHealth(degraded), 503)
})

test('数据库检查：通、不通、抛错', async () => {
  assert.equal((await runHealthChecks({ env: FULL_ENV, pingDatabase: async () => true })).status, 'ok')
  assert.deepEqual(await runHealthChecks({ env: FULL_ENV, pingDatabase: async () => false }), {
    status: 'degraded',
    checks: { env: 'ok', database: 'fail' },
  })
  const thrown = await runHealthChecks({
    env: FULL_ENV,
    pingDatabase: async () => {
      throw new Error('relation "secret_table" does not exist')
    },
  })
  assert.deepEqual(thrown, { status: 'degraded', checks: { env: 'ok', database: 'fail' } })
})

test('环境变量不齐时不去连库', async () => {
  let pinged = 0
  const report = await runHealthChecks({
    env: {},
    pingDatabase: async () => {
      pinged++
      return true
    },
  })
  assert.deepEqual(report, { status: 'degraded', checks: { env: 'fail', database: 'fail' } })
  assert.equal(pinged, 0)
})

test('响应里只有状态与检查项名：没有变量名、变量值、报错原文', async () => {
  const report = await runHealthChecks({
    env: { ...FULL_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined },
    pingDatabase: async () => true,
  })
  const body = JSON.stringify(report)
  assert.equal(body, '{"status":"degraded","checks":{"env":"fail","database":"fail"}}')
  assert.doesNotMatch(body, /SUPABASE|value-of/)
})

test('缓存：ttl 内复用结果，过期重查，并发共用一次检查', async () => {
  let runs = 0
  let clock = 1000
  const cached = createHealthCache(
    async () => {
      runs++
      return summarizeHealth({ env: 'ok', database: 'ok' })
    },
    10_000,
    () => clock,
  )
  await Promise.all([cached(), cached(), cached()])
  assert.equal(runs, 1)
  clock += 9_999
  await cached()
  assert.equal(runs, 1)
  clock += 1
  await cached()
  assert.equal(runs, 2)
})

test('缓存：检查本身抛错不会卡死后续请求', async () => {
  let runs = 0
  const cached = createHealthCache(async () => {
    runs++
    if (runs === 1) throw new Error('first')
    return summarizeHealth({ env: 'ok', database: 'ok' })
  }, 10_000)
  await assert.rejects(cached())
  assert.equal((await cached()).status, 'ok')
})
