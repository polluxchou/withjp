// src/lib/competitors/liveProbe.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { CLIP_FACTORY_SRC, PROBE_FACTORY_SRC, PROBE_VERSION, clipRect, defaultProbeConfig, probeSource } from './liveProbe.ts'

// ---- 假 DOM ----------------------------------------------------------------
// Node 没有 MutationObserver / document，工厂只碰传进来的 win/doc，所以这里手搓够用的替身。

type FakeEl = { textContent: string; querySelector?: (s: string) => FakeEl | null }

function el(textContent: string): FakeEl {
  return { textContent }
}

function makeDoc(map: Record<string, FakeEl>) {
  return {
    querySelector: (s: string) => map[s] ?? null,
    contains: (node: unknown) => Object.values(map).includes(node as FakeEl),
    documentElement: { outerHTML: '' },
  }
}

function makeWin(nowMs = 1_000_000) {
  const observers: { target: unknown; cb: (recs: unknown[]) => void; active: boolean }[] = []
  const win = {
    observers,
    disconnects: 0,
    intervals: [] as { cb: () => void; ms: number; id: number; cleared: boolean }[],
    now: nowMs,
    Date: { now: () => nowMs },
    setInterval: (cb: () => void, ms: number) => {
      const id = win.intervals.length + 1
      win.intervals.push({ cb, ms, id, cleared: false })
      return id
    },
    clearInterval: (id: number) => {
      const found = win.intervals.find((i) => i.id === id)
      if (found) found.cleared = true
    },
    MutationObserver: class {
      cb: (recs: unknown[]) => void
      entry: { target: unknown; cb: (recs: unknown[]) => void; active: boolean } | null = null
      constructor(cb: (recs: unknown[]) => void) { this.cb = cb }
      observe(target: unknown) {
        this.entry = { target, cb: this.cb, active: true }
        observers.push(this.entry)
      }
      // 断开要真的失效，不能只记个数 —— 否则「旧 observer 还在数」这种 bug
      // 在假 DOM 里根本表现不出来，测试就成了摆设。
      disconnect() { win.disconnects += 1; if (this.entry) this.entry.active = false }
    },
  } as Record<string, unknown> & {
    observers: typeof observers
    disconnects: number
    intervals: { cb: () => void; ms: number; id: number; cleared: boolean }[]
  }
  return win
}

/** 投递一批变更给所有**还活着**的 observer，断开过的收不到。 */
function emit(win: { observers: { cb: (recs: unknown[]) => void; active: boolean }[] }, records: unknown[]) {
  for (const o of win.observers) if (o.active) o.cb(records)
}

/** 把源码文本变成可调用的工厂 —— 和注入页面时走的是同一份字符串。 */
const factory = new Function(`return (${PROBE_FACTORY_SRC})`)() as (
  win: unknown, doc: unknown, cfg: unknown,
) => { reused: boolean; attached: boolean }

/** 造一条弹幕节点：带 querySelector，能被 speaker 选择器命中。 */
function msgNode(speaker: string): FakeEl {
  return {
    textContent: speaker + ': hi',
    querySelector: (s: string) => (s === '.who' ? el(speaker) : null),
  } as FakeEl
}

const cfg = (over: Record<string, unknown> = {}) => ({
  ...defaultProbeConfig(),
  intervalMs: 0, // 测试里不起定时器，手动调 tick()
  ...over,
})

// ---- 测试 ------------------------------------------------------------------

test('探针：累计弹幕条数，tick 后清零', () => {
  const chat = el('')
  const doc = makeDoc({ '.chat': chat })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: [] }))
  const lw = (win as Record<string, any>).__lw

  emit(win, [{ addedNodes: [msgNode('a'), msgNode('b')] }])
  emit(win, [{ addedNodes: [msgNode('c')] }])
  lw.tick()
  assert.equal(lw.drain()[0].msgs, 3)

  lw.tick()
  assert.equal(lw.drain()[0].msgs, 0, 'tick 之后计数器必须归零，否则会累加成单调递增')
})

test('探针：发言人去重，按 tick 分桶', () => {
  const chat = el('')
  const doc = makeDoc({ '.chat': chat })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: ['.who'] }))
  const lw = (win as Record<string, any>).__lw

  emit(win, [{ addedNodes: [msgNode('ann'), msgNode('ann'), msgNode('bob')] }])
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.msgs, 3)
  assert.equal(s.speakers, 2, '同一个人刷三条只算一个发言人')
})

test('探针：没有发言人选择器命中时 speakers 报 null，不用冒号去猜', () => {
  const chat = el('')
  const doc = makeDoc({ '.chat': chat })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: ['.nope'] }))
  const lw = (win as Record<string, any>).__lw
  emit(win, [{ addedNodes: [msgNode('ann'), msgNode('bob')] }])
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.msgs, 2, '条数照数，这个不依赖发言人选择器')
  assert.equal(s.speakers, null, '编造的发言人数比没有更糟')
  assert.equal(s.selectorsOk.speaker, null)
})

test('探针：选择器候选表按顺序回退，并报回命中的那个', () => {
  const doc = makeDoc({ '.chat': el(''), '[data-e2e="live-people-count"]': el('1.2K') })
  const win = makeWin()
  factory(win, doc, cfg({
    chatHost: ['.chat'],
    viewer: ['.does-not-exist', '[data-e2e="live-people-count"]'],
    followers: [], likes: [], speaker: [],
  }))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, '1.2K')
  assert.equal(s.selectorsOk.viewer, '[data-e2e="live-people-count"]')
})

test('探针：一个候选都没命中时该字段为 null，selectorsOk 记 null', () => {
  const doc = makeDoc({ '.chat': el('') })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: ['.nope'], followers: [], likes: [], speaker: [] }))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, null)
  assert.equal(s.selectorsOk.viewer, null)
})

test('探针：同版本重复注入不重复挂 observer', () => {
  const doc = makeDoc({ '.chat': el('') })
  const win = makeWin()
  const c = cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: [] })
  factory(win, doc, c)
  const again = factory(win, doc, c)
  assert.equal(again.reused, true)
  assert.equal(win.observers.length, 1, '重复注入挂两个 observer 会让弹幕double count')
})

test('探针：reattach 不会让弹幕被两个 observer 各数一次', () => {
  const chat = el('')
  const doc = makeDoc({ '.chat': chat })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: ['.who'] }))
  const lw = (win as Record<string, any>).__lw
  lw.reattach()
  emit(win, [{ addedNodes: [msgNode('ann')] }])
  lw.tick()
  assert.equal(lw.drain()[0].msgs, 1, 'reattach 之后还是 2 就说明旧 observer 没断开')
})

test('探针：换版本重注入会断开上一版的 observer', () => {
  const chat = el('')
  const doc = makeDoc({ '.chat': chat })
  const win = makeWin()
  const base = { chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: ['.who'] }
  factory(win, doc, cfg({ ...base, version: 1 }))
  factory(win, doc, cfg({ ...base, version: 2 }))
  assert.equal(win.disconnects, 1, '上一版的 observer 必须断开，否则它会一直对着没人读的计数器烧 CPU')
})

test('探针：intervalMs>0 时按该间隔挂定时器，回调等价于 tick', () => {
  const doc = makeDoc({ '.chat': el(''), '.v': el('88') })
  const win = makeWin()
  factory(win, doc, cfg({ intervalMs: 60_000, chatHost: ['.chat'], viewer: ['.v'], followers: [], likes: [], speaker: [] }))
  const lw = (win as Record<string, any>).__lw
  assert.equal(win.intervals.length, 1)
  assert.equal(win.intervals[0].ms, 60_000, '间隔传错会让整场采样节奏错乱')
  win.intervals[0].cb() // 定时器到点
  const s = lw.drain()
  assert.equal(s.length, 1, '定时器回调必须真的产出一个采样点')
  assert.equal(s[0].viewer, '88')
})

test('探针：换版本重注入会清掉上一版的定时器，不只是断 observer', () => {
  const doc = makeDoc({ '.chat': el('') })
  const win = makeWin()
  const base = { intervalMs: 60_000, chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: [] }
  factory(win, doc, cfg({ ...base, version: 1 }))
  factory(win, doc, cfg({ ...base, version: 2 }))
  assert.equal(win.intervals.length, 2)
  assert.equal(win.intervals[0].cleared, true, '旧定时器不清掉会一直往没人读的 buf 里 push')
  assert.equal(win.intervals[1].cleared, false)
})

test('探针：找不到弹幕容器时仍然安装、仍能采数字，只是 attached=false', () => {
  const doc = makeDoc({ '[data-e2e="live-people-count"]': el('88') })
  const win = makeWin()
  const r = factory(win, doc, cfg({
    chatHost: ['.chat-not-here'],
    viewer: ['[data-e2e="live-people-count"]'],
    followers: [], likes: [], speaker: [],
  }))
  assert.equal(r.attached, false)
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, '88', '弹幕挂不上不该拖累核心指标')
  assert.equal(s.observerAlive, false)
})

test('探针：drain 取走后缓冲区清空', () => {
  const doc = makeDoc({ '.chat': el('') })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], viewer: [], followers: [], likes: [], speaker: [] }))
  const lw = (win as Record<string, any>).__lw
  lw.tick(); lw.tick()
  assert.equal(lw.drain().length, 2)
  assert.equal(lw.drain().length, 0)
})

test('PROBE_VERSION 是正整数（重注入幂等靠它）', () => {
  assert.ok(Number.isInteger(PROBE_VERSION) && PROBE_VERSION > 0)
})

test('probeSource: 组装出的表达式能被解析成可调用的工厂', () => {
  const src = probeSource({ ...defaultProbeConfig(), intervalMs: 60_000 })
  assert.match(src, /^\(function \(win, doc, cfg\)/)
  assert.doesNotThrow(() => new Function(`return ${src.replace(/\(window, document, /, '(arguments[0], arguments[1], ')}`))
})

test('probeSource: intervalMs 非正数直接抛错，不产出永不打点的探针', () => {
  assert.throws(() => probeSource({ ...defaultProbeConfig(), intervalMs: 0 }), /intervalMs/)
})

test('clipRect: contain 且画面比盒子更宽 → 左右满、上下留黑边', () => {
  // 盒子 800x600（比例 1.333），画面 1920x1080（比例 1.778）→ 宽度吃满，高度 800/1.778=450
  const r = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'contain', '50% 50%')
  assert.deepEqual(r, { x: 0, y: 75, width: 800, height: 450 })
})

test('clipRect: contain 且画面更高 → 上下满、左右留黑边', () => {
  // 盒子 800x600，画面 1080x1920（比例 0.5625）→ 高度吃满 600，宽度 600*0.5625=337.5→338
  const r = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1080, 1920, 'contain', '50% 50%')
  assert.deepEqual(r, { x: 231, y: 0, width: 338, height: 600 })
})

test('clipRect: cover 会溢出盒子（裁掉两侧），矩形比盒子大是预期行为', () => {
  const r = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'cover', '50% 50%')
  assert.equal(r.height, 600)
  assert.ok(r.width > 800, 'cover 下宽度应溢出')
})

test('clipRect: fill 直接等于盒子', () => {
  const r = clipRect({ x: 10, y: 20, width: 800, height: 600 }, 1920, 1080, 'fill', '50% 50%')
  assert.deepEqual(r, { x: 10, y: 20, width: 800, height: 600 })
})

test('clipRect: object-position 靠上时黑边全落在下方', () => {
  const r = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'contain', '50% 0%')
  assert.equal(r.y, 0)
})

test('clipRect: object-position 解析不出来才退回居中（显式 0% 不能被当成假值）', () => {
  // 'center' 解析不出数字 → 两轴都退回 50%,等同居中
  const fallback = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'contain', 'center')
  assert.equal(fallback.y, 75)
  // 显式 0% 必须真的贴顶,不能被 `|| 50` 改判成居中
  const top = clipRect({ x: 0, y: 0, width: 800, height: 600 }, 1920, 1080, 'contain', '50% 0%')
  assert.equal(top.y, 0)
})

test('clipRect: 带上元素在页面里的偏移', () => {
  const r = clipRect({ x: 100, y: 50, width: 800, height: 600 }, 1920, 1080, 'contain', '50% 50%')
  assert.deepEqual(r, { x: 100, y: 125, width: 800, height: 450 })
})

test('CLIP_FACTORY_SRC 是可解析的 JS', () => {
  assert.doesNotThrow(() => new Function(`return (${CLIP_FACTORY_SRC})`))
})
