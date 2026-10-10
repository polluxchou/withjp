// src/lib/competitors/chunkLoader.test.ts
// 补取控制器的行为测试：假 fetchRows 由测试手动 resolve / reject，逐个钉住
// 去重、失败、重试、被取代、重叠在途这些组件里没法单测的异步状态。
import assert from 'node:assert/strict'
import test from 'node:test'

import { createChunkLoader, fetchShotRange } from './chunkLoader.ts'
import { shotRangePath } from './shotWindow.ts'
import type { ShotRange } from './shotWindow.ts'

type Row = { id: string }

const A: ShotRange = { from: '2026-09-01', before: '2026-09-11' }
const B: ShotRange = { from: '2026-08-22', before: '2026-09-01' }

interface Call {
  range: ShotRange
  resolve: (rows: Row[]) => void
  reject: (err: unknown) => void
}

function harness() {
  const calls: Call[] = []
  const merges: { rows: Row[]; range: ShotRange }[] = []
  const failedLog: boolean[] = []
  const loader = createChunkLoader<Row>({
    fetchRows: (range) => new Promise<Row[]>((resolve, reject) => { calls.push({ range, resolve, reject }) }),
    merge: (rows, range) => { merges.push({ rows, range }) },
    setFailed: (failed) => { failedLog.push(failed) },
  })
  return { loader, calls, merges, failedLog }
}

/** 让所有已排队的微任务与回调跑完：异步链里的 await / finally 都在这一拍内落地。 */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

const last = <T>(arr: T[]): T | undefined => arr[arr.length - 1]

test('want(range) 发一次请求；成功后把 (rows, range) 交给 merge，失败态最后为 false', async () => {
  const h = harness()
  h.loader.want(A)
  assert.equal(h.calls.length, 1)
  assert.deepEqual(h.calls[0].range, A)
  h.calls[0].resolve([{ id: 's1' }])
  await settle()
  assert.deepEqual(h.merges, [{ rows: [{ id: 's1' }], range: A }])
  assert.equal(last(h.failedLog), false)
})

test('同一段在途时再 want 同一段（不同对象、同 from/before）不重复请求', async () => {
  const h = harness()
  h.loader.want(A)
  h.loader.want({ ...A })
  h.loader.want({ from: A.from, before: A.before })
  assert.equal(h.calls.length, 1)
  h.calls[0].resolve([])
  await settle()
  assert.equal(h.merges.length, 1)
})

test('失败 → setFailed(true)；失败后 retry() 重发同一段（失败那段的在途标记已清）', async () => {
  const h = harness()
  h.loader.want(A)
  h.calls[0].reject(new Error('boom'))
  await settle()
  assert.equal(last(h.failedLog), true)
  assert.equal(h.merges.length, 0)

  h.loader.retry()
  assert.equal(h.calls.length, 2, 'retry 必须重发')
  assert.deepEqual(h.calls[1].range, A)
  assert.equal(last(h.failedLog), false, '重发时先清掉报错')
  h.calls[1].resolve([{ id: 's2' }])
  await settle()
  assert.deepEqual(h.merges, [{ rows: [{ id: 's2' }], range: A }])
  assert.equal(last(h.failedLog), false)
})

test('retry() 在没有缺口（wanted 为 null）时什么都不做：不发请求，也不碰失败态', async () => {
  const h = harness()
  h.loader.retry()
  assert.equal(h.calls.length, 0)
  assert.deepEqual(h.failedLog, [])
  h.loader.want(A)
  h.calls[0].resolve([])
  await settle()
  h.loader.want(null)
  h.loader.retry()
  assert.equal(h.calls.length, 1)
  const before = h.failedLog.length
  h.loader.retry()
  assert.equal(h.calls.length, 1)
  assert.equal(h.failedLog.length, before)
})

test('被取代：want(A) 在途 → want(null) → A 失败，不挂出报错', async () => {
  const h = harness()
  h.loader.want(A)
  h.loader.want(null)
  h.calls[0].reject(new Error('boom'))
  await settle()
  assert.equal(h.failedLog.includes(true), false)
  assert.equal(last(h.failedLog), false)
})

test('被取代：want(A) 在途 → want(B) → A 失败不报错，B 成功照常并入', async () => {
  const h = harness()
  h.loader.want(A)
  h.loader.want(B)
  assert.equal(h.calls.length, 2)
  h.calls[0].reject(new Error('boom'))
  await settle()
  assert.equal(h.failedLog.includes(true), false)
  h.calls[1].resolve([{ id: 'b1' }])
  await settle()
  assert.deepEqual(h.merges, [{ rows: [{ id: 'b1' }], range: B }])
  assert.equal(last(h.failedLog), false)
})

test('被取代的旧请求成功时照常交给 merge（过期与否由 merge 判断）', async () => {
  const h = harness()
  h.loader.want(A)
  h.loader.want(B)
  h.calls[0].resolve([{ id: 'a1' }])
  await settle()
  assert.deepEqual(h.merges, [{ rows: [{ id: 'a1' }], range: A }])
})

test('两段重叠在途：A 先完成时 finally 不清 B 的在途标记', async () => {
  const h = harness()
  h.loader.want(A)
  h.loader.want(B)
  assert.equal(h.calls.length, 2)
  h.calls[0].resolve([])
  await settle()
  h.loader.want(B) // B 仍在途：必须去重，不能因为 A 收尾而被清掉
  assert.equal(h.calls.length, 2)
  h.calls[1].resolve([])
  await settle()
  assert.equal(h.merges.length, 2)
})

test('want(null) 清掉报错', async () => {
  const h = harness()
  h.loader.want(A)
  h.calls[0].reject(new Error('boom'))
  await settle()
  assert.equal(last(h.failedLog), true)
  h.loader.want(null)
  assert.equal(last(h.failedLog), false)
})

test('同一段失败后回到 want(null) 再 want(同段)：会重新发请求', async () => {
  const h = harness()
  h.loader.want(A)
  h.calls[0].reject(new Error('boom'))
  await settle()
  h.loader.want(null)
  h.loader.want(A)
  assert.equal(h.calls.length, 2)
})

test('fetchRows 同步抛错也只是失败态，不会逃出控制器', async () => {
  const failedLog: boolean[] = []
  const loader = createChunkLoader<Row>({
    fetchRows: () => { throw new Error('sync boom') },
    merge: () => {},
    setFailed: (f) => { failedLog.push(f) },
  })
  loader.want(A)
  await settle()
  assert.equal(last(failedLog), true)
})

test('失败路径不产生未处理的 Promise 拒绝', async () => {
  let unhandled = 0
  const onUnhandled = () => { unhandled += 1 }
  process.on('unhandledRejection', onUnhandled)
  try {
    const h = harness()
    h.loader.want(A)
    h.calls[0].reject(new Error('boom'))
    await settle()
    h.loader.retry()
    h.calls[1].reject(new Error('boom again'))
    await settle()
    h.loader.want(B)
    h.loader.want(null)
    h.calls[2].reject(new Error('superseded boom'))
    await settle()
    await settle()
    assert.equal(unhandled, 0)
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

// —— fetchShotRange ——

function fakeFetch(res: { ok: boolean; status: number; json: () => Promise<unknown> }) {
  const seen: { url: string; init: RequestInit | undefined }[] = []
  const impl = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init })
    return res
  }) as unknown as typeof fetch
  return { impl, seen }
}

test('fetchShotRange: 2xx + { data: [...] } 返回数组，请求路径就是 shotRangePath(range)', async () => {
  const f = fakeFetch({ ok: true, status: 200, json: async () => ({ data: [{ id: 's1' }], error: null }) })
  const rows = await fetchShotRange<Row>(A, f.impl)
  assert.deepEqual(rows, [{ id: 's1' }])
  assert.equal(f.seen.length, 1)
  assert.equal(f.seen[0].url, shotRangePath(A))
  assert.equal(f.seen[0].init?.cache, 'no-store')
})

test('fetchShotRange: 空数组是合法的「这段没图」', async () => {
  const f = fakeFetch({ ok: true, status: 200, json: async () => ({ data: [], error: null }) })
  assert.deepEqual(await fetchShotRange<Row>(A, f.impl), [])
})

test('fetchShotRange: 非 2xx 抛错（4xx 不能被当成「空段已加载」），哪怕响应体长得像合法空段', async () => {
  for (const status of [400, 401, 404, 500]) {
    // 体里带着合法的空数组：只有状态码能把它拦下来，不能靠「体不合法」顺带拦住
    const f = fakeFetch({ ok: false, status, json: async () => ({ data: [], error: 'x' }) })
    await assert.rejects(fetchShotRange<Row>(A, f.impl), new RegExp(`shot range ${status}`))
  }
})

test('fetchShotRange: 2xx 但 data 缺失或不是数组也抛错（不能把「没取到」当成「没图」）', async () => {
  for (const body of [{}, { data: null }, { data: 'oops' }, { data: { a: 1 } }, null]) {
    const f = fakeFetch({ ok: true, status: 200, json: async () => body })
    await assert.rejects(fetchShotRange<Row>(A, f.impl), /bad payload/)
  }
})

test('fetchShotRange: 响应体解析失败时抛错；网络错误原样抛出', async () => {
  const bad = fakeFetch({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } })
  await assert.rejects(fetchShotRange<Row>(A, bad.impl), SyntaxError)
  const net = (async () => { throw new TypeError('network down') }) as unknown as typeof fetch
  await assert.rejects(fetchShotRange<Row>(A, net), TypeError)
})
