// src/lib/competitors/chunkLoader.test.ts
// 补取控制器的行为测试：假 fetchRows 由测试手动 resolve / reject，逐个钉住
// 去重、同右端排队、失败、重试、被取代、重叠在途这些组件里没法单测的异步状态；
// 末尾的回放用例把真的 nextChunk / mergeShotRange 接上，模拟组件循环看整体发了哪些请求。
import assert from 'node:assert/strict'
import test from 'node:test'

import { createChunkLoader, fetchShotRange } from './chunkLoader.ts'
import { SHOT_WINDOW_SIZE, windowOf } from './shotGrid.ts'
import { isShotDateLoaded, mergeShotRange, nextChunk, shotRangePath } from './shotWindow.ts'
import type { ShotRange } from './shotWindow.ts'
import type { BoardShot, CompetitorBoard, CompetitorWithHistory } from './types.ts'

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

// —— 同右端排队：在途那段收尾前，右端相同的新缺口不另发请求 ——
// 连点「更早」时窗口每变一次，nextChunk 的 from 就更早、before（已加载起点）不变。

const R1: ShotRange = { from: '2026-08-20', before: '2026-09-03' }
const R2: ShotRange = { from: '2026-08-15', before: '2026-09-03' }
const R3: ShotRange = { from: '2026-08-10', before: '2026-09-03' }

test('同右端已有一段在途时，want 更早的段只记下、不发请求', async () => {
  const h = harness()
  h.loader.want(R1)
  h.loader.want(R2)
  h.loader.want(R3)
  assert.deepEqual(h.calls.map((c) => c.range), [R1])
})

test('在途段成功后不按排队的旧缺口补发：等调用方按合并后的新起点重新 want', async () => {
  const h = harness()
  h.loader.want(R1)
  h.loader.want(R3)
  h.calls[0].resolve([{ id: 'r1' }])
  await settle()
  // 合并后起点推进到 08-20，旧缺口 [08-10, 09-03) 与刚并入的那段重叠，发出去就是重复请求
  assert.equal(h.calls.length, 1)
  assert.deepEqual(h.merges, [{ rows: [{ id: 'r1' }], range: R1 }])
  const rest: ShotRange = { from: '2026-08-10', before: '2026-08-20' }
  h.loader.want(rest)
  assert.deepEqual(h.calls.map((c) => c.range), [R1, rest])
})

test('在途段失败、同右端有更早的缺口在排队：不报错，立刻按最新缺口补发一次；它再失败才报错，重试重发它', async () => {
  const h = harness()
  h.loader.want(R1)
  h.loader.want(R2)
  h.loader.want(R3)
  h.calls[0].reject(new Error('boom'))
  await settle()
  assert.equal(h.failedLog.includes(true), false, '失败的那段已被取代，不能挂报错行')
  assert.deepEqual(h.calls.map((c) => c.range), [R1, R3], '补发的是最新缺口，不是中间那段')

  h.calls[1].reject(new Error('boom again'))
  await settle()
  assert.equal(last(h.failedLog), true)
  assert.equal(h.calls.length, 2, '最新缺口自己失败了就报错，不再自动重发')
  h.loader.retry()
  assert.deepEqual(h.calls.map((c) => c.range), [R1, R3, R3])
})

test('最新缺口就是在途那段（R1→R2→R1）：全程只发一次，失败如实报出', async () => {
  const h = harness()
  h.loader.want(R1)
  h.loader.want(R2)
  h.loader.want({ ...R1 })
  assert.equal(h.calls.length, 1)
  h.calls[0].reject(new Error('boom'))
  await settle()
  assert.equal(last(h.failedLog), true)
  assert.equal(h.calls.length, 1)
})

test('右端不同的 A→B→A：A 只发一次（不因中间换过缺口而重发在途的 A），A 失败如实报出', async () => {
  const h = harness()
  h.loader.want(A)
  h.loader.want(B)
  h.loader.want({ ...A })
  assert.deepEqual(h.calls.map((c) => c.range), [A, B])
  h.calls[0].reject(new Error('boom'))
  await settle()
  assert.equal(last(h.failedLog), true)
  assert.equal(h.calls.length, 2)
})

test('排队期间缺口被清空（want(null)）：在途段失败既不报错、也不补发', async () => {
  const h = harness()
  h.loader.want(R1)
  h.loader.want(R2)
  h.loader.want(null)
  h.calls[0].reject(new Error('boom'))
  await settle()
  assert.equal(h.failedLog.includes(true), false)
  assert.equal(h.calls.length, 1)
})

test('排队期间起点变了（新缺口右端不同，看板被刷新换掉）：新缺口立即单独发出，旧段失败既不报错也不重发', async () => {
  const h = harness()
  const moved: ShotRange = { from: '2026-08-10', before: '2026-08-25' }
  h.loader.want(R1)
  h.loader.want(R2)
  h.loader.want(moved)
  assert.deepEqual(h.calls.map((c) => c.range), [R1, moved])
  h.calls[0].reject(new Error('boom'))
  await settle()
  assert.equal(h.failedLog.includes(true), false)
  assert.equal(h.calls.length, 2)
  h.calls[1].resolve([{ id: 'm1' }])
  await settle()
  assert.deepEqual(h.merges, [{ rows: [{ id: 'm1' }], range: moved }])
})

test('排队中按重试不多发请求', async () => {
  const h = harness()
  h.loader.want(R1)
  h.loader.want(R2)
  h.loader.retry()
  assert.equal(h.calls.length, 1)
})

// —— 回放：真的 nextChunk / mergeShotRange + loader，模拟组件「状态一变就重新 want」的循环 ——

type SimShot = BoardShot & { id: string }

/** 2026-08-01 … 2026-09-12 连续 43 天；首屏起点是倒数第 10 天 09-03。 */
const SIM_AXIS = Array.from({ length: 43 }, (_, i) => new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10))

const simShot = (day: string, tag = ''): SimShot => ({
  id: `${day}${tag}`, competitor_id: 'c1', shot_on: day, sort_order: 0, stream_started_at: null, captured_at: null,
})

/** 一个账号、每天一张图；tag 用来分辨看板是不是被刷新换过。 */
function simBoard(shotsLoadedFrom: string, tag = ''): CompetitorBoard<SimShot> {
  const shots = SIM_AXIS.filter((d) => d >= shotsLoadedFrom).map((d) => simShot(d, tag))
  // mergeShotRange 只读写账号的 id / shots / related，其余字段与这里无关
  const c = { id: 'c1', shots, related: [] } as unknown as CompetitorWithHistory<SimShot>
  return { competitors: [c], canEdit: true, shotAxis: SIM_AXIS, shotsLoadedFrom }
}

/**
 * 相册的最小模型。组件里 pendingChunk 是 useMemo、want 在 effect 里调：状态变了要等下一次渲染
 * 才重判，所以这里的「渲染」也是异步的；mergeShotRange 判过期原样返回时 setBoard 不触发渲染，这里同样不触发。
 */
function album(initial: CompetitorBoard<SimShot>) {
  let board = initial
  let anchor = SIM_AXIS[SIM_AXIS.length - 1]
  const calls: { range: ShotRange; resolve: (rows: SimShot[]) => void; reject: (err: unknown) => void }[] = []
  const failedLog: boolean[] = []
  let renderQueued = false
  const windowNow = () => windowOf(board.shotAxis, board.shotAxis.indexOf(anchor), SHOT_WINDOW_SIZE)
  const loader = createChunkLoader<SimShot>({
    fetchRows: (range) => new Promise<SimShot[]>((resolve, reject) => { calls.push({ range, resolve, reject }) }),
    merge: (rows, range) => {
      const next = mergeShotRange(board, rows, range)
      if (next !== board) { board = next; render() }
    },
    setFailed: (f) => { failedLog.push(f) },
  })
  function render() {
    if (renderQueued) return
    renderQueued = true
    setImmediate(() => {
      renderQueued = false
      loader.want(nextChunk(board.shotAxis, windowNow(), board.shotsLoadedFrom))
    })
  }
  render()
  return {
    calls,
    failedLog,
    board: () => board,
    window: windowNow,
    /** 「更早」：整屏往前翻，同 ShotDateStrip 的 step(-1)。 */
    earlier() {
      anchor = board.shotAxis[Math.max(board.shotAxis.indexOf(anchor) - SHOT_WINDOW_SIZE, 0)]
      render()
    },
    refresh(next: CompetitorBoard<SimShot>) { board = next; render() },
    /** 服务端照实回这一段：区间内每天一张。 */
    respond(i: number) {
      const { from, before } = calls[i].range
      calls[i].resolve(SIM_AXIS.filter((d) => d >= from && d < before).map((d) => simShot(d)))
    },
  }
}

const flush = async () => { for (let i = 0; i < 5; i++) await settle() }

/** 当前屏每一天都在已加载范围里，而且真有图并进来了（不是只挪了起点）。 */
function assertWindowFilled(a: ReturnType<typeof album>) {
  const days = new Set(a.board().competitors[0].shots.map((s) => s.shot_on))
  for (const d of a.window()) {
    assert.ok(isShotDateLoaded(d, a.board().shotsLoadedFrom), `${d} 未加载`)
    assert.ok(days.has(d), `${d} 没有图`)
  }
}

const FIRST: ShotRange = { from: '2026-08-24', before: '2026-09-03' }

test('回放（10-11 线上实测）：首段在途时连点 4 次「更早」，总共只发 2 段、互不重叠，最后盖住当前屏', async () => {
  const a = album(simBoard('2026-09-03'))
  await flush()
  assert.equal(a.calls.length, 0, '首屏不缺')
  for (let i = 0; i < 4; i++) { a.earlier(); await flush() }
  assert.deepEqual(a.calls.map((c) => c.range), [FIRST])
  a.respond(0)
  await flush()
  // 首段并入后起点到 08-24，屏是 08-21..08-25：只差 08-24 之前那段
  assert.deepEqual(a.calls.map((c) => c.range), [FIRST, { from: '2026-08-14', before: '2026-08-24' }])
  a.respond(1)
  await flush()
  assert.equal(a.calls.length, 2)
  assert.equal(a.board().shotsLoadedFrom, '2026-08-14')
  assertWindowFilled(a)
  assert.equal(a.failedLog.includes(true), false)
})

test('回放：首段失败时正有更早的缺口在排队——不报错，按最新缺口补发一次，补齐后不再请求', async () => {
  const a = album(simBoard('2026-09-03'))
  for (let i = 0; i < 4; i++) { a.earlier(); await flush() }
  a.calls[0].reject(new Error('timeout'))
  await flush()
  assert.deepEqual(a.calls.map((c) => c.range), [FIRST, { from: '2026-08-16', before: '2026-09-03' }])
  a.respond(1)
  await flush()
  assert.equal(a.calls.length, 2)
  assert.equal(a.board().shotsLoadedFrom, '2026-08-16')
  assertWindowFilled(a)
  assert.equal(a.failedLog.includes(true), false)
})

test('回放：首段在途时看板被刷新换掉（起点不变）——首段并进新看板，再按新起点补一段，不卡住', async () => {
  const a = album(simBoard('2026-09-03'))
  for (let i = 0; i < 4; i++) { a.earlier(); await flush() }
  a.refresh(simBoard('2026-09-03', '-v2'))
  await flush()
  assert.equal(a.calls.length, 1)
  a.respond(0)
  await flush()
  assert.deepEqual(a.calls.map((c) => c.range), [FIRST, { from: '2026-08-14', before: '2026-08-24' }])
  a.respond(1)
  await flush()
  assert.equal(a.calls.length, 2)
  assertWindowFilled(a)
  assert.ok(a.board().competitors[0].shots.some((s) => s.id === '2026-09-03-v2'), '并进的是刷新后的新看板')
})

test('回放：首段在途时看板刷新换了起点——新起点的缺口立即单独发出，旧段结果作废，最终补齐', async () => {
  const a = album(simBoard('2026-09-03'))
  for (let i = 0; i < 4; i++) { a.earlier(); await flush() }
  a.refresh(simBoard('2026-09-01', '-v2'))
  await flush()
  assert.deepEqual(a.calls.map((c) => c.range), [FIRST, { from: '2026-08-16', before: '2026-09-01' }])
  a.respond(0)
  await flush()
  assert.equal(a.board().shotsLoadedFrom, '2026-09-01', '右端已不是起点的旧结果丢弃')
  a.respond(1)
  await flush()
  assert.equal(a.calls.length, 2)
  assert.equal(a.board().shotsLoadedFrom, '2026-08-16')
  assertWindowFilled(a)
  assert.equal(a.failedLog.includes(true), false)
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
