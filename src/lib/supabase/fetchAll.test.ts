import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchAllRows, MAX_PAGES, PAGE_SIZE } from './fetchAll.ts'
import type { PageResult } from './fetchAll.ts'

/** 模拟一张 total 行的表：page(from, to) 返回 [from, to] 闭区间（和 PostgREST 的 range 一致）。 */
function fakeTable(total: number) {
  const calls: Array<[number, number]> = []
  const page = async (from: number, to: number): Promise<PageResult<number>> => {
    calls.push([from, to])
    const data: number[] = []
    for (let i = from; i <= Math.min(to, total - 1); i++) data.push(i)
    return { data, error: null }
  }
  return { calls, page }
}

test('PAGE_SIZE 不超过 Supabase 的 1000 行上限', () => {
  assert.ok(PAGE_SIZE <= 1000)
})

test('空表：只请求一次，返回空数组', async () => {
  const t = fakeTable(0)
  const res = await fetchAllRows(t.page)
  assert.deepEqual(res, { data: [], error: null })
  assert.deepEqual(t.calls, [[0, 999]])
})

test('2500 行：分 3 页取全，按顺序，区间连续不重叠', async () => {
  const t = fakeTable(2500)
  const res = await fetchAllRows(t.page, 1000)
  assert.equal(res.error, null)
  assert.deepEqual(t.calls, [[0, 999], [1000, 1999], [2000, 2999]])
  assert.equal(res.data?.length, 2500)
  assert.deepEqual(res.data, Array.from({ length: 2500 }, (_, i) => i))
})

test('1054 行（生产现状）：默认页大小下取全 1054 行，不丢最后 54 行', async () => {
  const t = fakeTable(1054)
  const res = await fetchAllRows(t.page)
  assert.equal(res.data?.length, 1054)
  assert.equal(res.data?.[1053], 1053)
  assert.equal(t.calls.length, 2)
})

test('恰好 2000 行：第 3 页为空才收尾，共 3 次请求', async () => {
  const t = fakeTable(2000)
  const res = await fetchAllRows(t.page, 1000)
  assert.equal(res.error, null)
  assert.equal(t.calls.length, 3)
  assert.equal(res.data?.length, 2000)
})

test('第 2 页报错：返回 error、data 为 null，且不再继续翻页', async () => {
  const calls: Array<[number, number]> = []
  const boom = { message: 'connection reset' }
  const res = await fetchAllRows<number>(async (from, to) => {
    calls.push([from, to])
    if (calls.length === 2) return { data: null, error: boom }
    return { data: Array.from({ length: 1000 }, (_, i) => from + i), error: null }
  })
  assert.deepEqual(res, { data: null, error: boom })
  assert.equal(calls.length, 2)
})

test('data 为 null 且无 error 视作空页（收尾）', async () => {
  const res = await fetchAllRows<number>(async () => ({ data: null, error: null }))
  assert.deepEqual(res, { data: [], error: null })
})

test('永远返回满页：翻到 MAX_PAGES 页后报错而不是悄悄截断', async () => {
  let n = 0
  const res = await fetchAllRows<number>(async () => {
    n++
    return { data: [1, 2], error: null }
  }, 2)
  assert.equal(n, MAX_PAGES)
  assert.equal(res.data, null)
  assert.match(res.error?.message ?? '', /fetchAllRows/)
})

test('page 回调是 PromiseLike（Supabase 查询构造器是 thenable，不是真 Promise）', async () => {
  const thenable = (value: PageResult<number>): PromiseLike<PageResult<number>> => ({
    then: (onfulfilled, onrejected) => Promise.resolve(value).then(onfulfilled, onrejected),
  })
  const res = await fetchAllRows<number>(() => thenable({ data: [7], error: null }))
  assert.deepEqual(res, { data: [7], error: null })
})
