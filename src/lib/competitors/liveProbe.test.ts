// src/lib/competitors/liveProbe.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { CLIP_FACTORY_SRC, PROBE_FACTORY_SRC, PROBE_VERSION, type Rect, clipRect, clipSource, defaultProbeConfig, probeSource } from './liveProbe.ts'

// ---- 假 DOM ----------------------------------------------------------------
// Node 没有 MutationObserver / document，工厂只碰传进来的 win/doc，所以这里手搓够用的替身。

type FakeEl = {
  textContent: string
  querySelector?: (s: string) => FakeEl | null
  querySelectorAll?: (s: string) => FakeEl[]
}

function el(textContent: string): FakeEl {
  return { textContent }
}

/** 造一条侧栏条目：内部能按选择器取到 handle 名与人数。 */
function navItem(handle: string, count: string): FakeEl {
  const inner: Record<string, FakeEl> = {
    '[data-e2e="live-side-nav-name"]': el(handle),
    '[data-e2e="person-count"]': el(count),
  }
  return { textContent: `${handle} ${count}`, querySelector: (s) => inner[s] ?? null }
}

/** `all` 是选择器 → 元素列表，给 querySelectorAll 用；`path` 是 location.pathname。 */
function makeDoc(map: Record<string, FakeEl>, all: Record<string, FakeEl[]> = {}, path?: string) {
  return {
    querySelector: (s: string) => map[s] ?? null,
    querySelectorAll: (s: string) => all[s] ?? (map[s] ? [map[s]] : []),
    contains: (node: unknown) => Object.values(map).includes(node as FakeEl),
    documentElement: { outerHTML: '' },
    ...(path ? { location: { pathname: path } } : {}),
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
  // 用 followers 验这条语义。viewer 不再走"候选表回退"——它改成了三档判据
  // （房间面板 / 侧栏按 handle 锚定 / 全页唯一），而房间面板那档是按形态匹配、
  // 根本没有"命中的选择器"可报，所以 selectorsOk.viewer 改报来源而不是选择器。
  const doc = makeDoc({ '.chat': el(''), '[data-e2e="followers-count"]': el('1.2K') })
  const win = makeWin()
  factory(win, doc, cfg({
    chatHost: ['.chat'],
    viewer: [],
    followers: ['.does-not-exist', '[data-e2e="followers-count"]'],
    likes: [], speaker: [],
  }))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.followers, '1.2K')
  assert.equal(s.selectorsOk.followers, '[data-e2e="followers-count"]')
})

test('探针：viewer 的 selectorsOk 报的是来源，不是选择器', () => {
  // 三档各有各的来源标记，事后查一个数是怎么来的就靠它
  const doc = makeDoc({ '.chat': el(''), '[data-e2e="person-count"]': el('1.2K') },
    { '[data-e2e="person-count"]': [el('1.2K')] })
  const win = makeWin()
  factory(win, doc, cfg({ chatHost: ['.chat'], followers: [], likes: [], speaker: [],
    viewer: ['[data-e2e="person-count"]'], viewerRoomBox: [], viewerItem: [], viewerName: [] }))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, '1.2K')
  assert.equal(s.selectorsOk.viewer, 'sole')
  assert.equal(s.viewer_source, 'sole')
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

test('探针：弹幕容器选择器没命中时 msgs 报 null，不是 0（跟 speakers 同一个道理）', () => {
  const doc = makeDoc({ '[data-e2e="live-people-count"]': el('88') })
  const win = makeWin()
  factory(win, doc, cfg({
    chatHost: ['.chat-not-here'],
    viewer: ['[data-e2e="live-people-count"]'],
    followers: [], likes: [], speaker: [],
  }))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.msgs, null, '选择器没命中过，编造一个 0 会和"房间很安静"混为一谈')
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

test('clipRect: 两条边各自取整，不把黑边多裁进来一列', () => {
  // 真实画面横跨 x 229.701 → 370.299。分别 round 位置和尺寸会得到 x=230,width=141
  // （右边缘 371，多吃一列 70% 是黑边的像素）；按边取整得 x=230,width=140。
  // 第二期要拿 dHash 给截图去重，多一列黑边会扰动哈希。
  const r = clipRect({ x: 0, y: 0, width: 600, height: 400 }, 200, 569, 'contain', '50% 50%')
  assert.deepEqual(r, { x: 230, y: 0, width: 140, height: 400 })
})

test('CLIP_FACTORY_SRC 是可解析的 JS', () => {
  assert.doesNotThrow(() => new Function(`return (${CLIP_FACTORY_SRC})`))
})

/** 假的 <video> + getComputedStyle，用来驱动 CLIP_FACTORY_SRC 本尊。 */
function makeVideoDoc(
  box: { x: number; y: number; width: number; height: number },
  vw: number, vh: number, fit: string, pos: string, readyState = 2,
) {
  const video = {
    muted: false, volume: 1,
    videoWidth: vw, videoHeight: vh, readyState,
    getBoundingClientRect: () => box,
  }
  return {
    video,
    doc: { querySelector: (s: string) => (s === 'video' ? video : null) },
    win: { getComputedStyle: () => ({ objectFit: fit, objectPosition: pos }) },
  }
}

const clipFactory = new Function(`return (${CLIP_FACTORY_SRC})`)() as (
  win: unknown, doc: unknown,
) => { hasVideo: boolean; ready: boolean; muted?: boolean; fit?: string; clip: Rect | null }

test('CLIP_FACTORY_SRC 与 clipRect 对每个分支算出同一个矩形（两份算式必须同步改）', () => {
  const box = { x: 100, y: 50, width: 800, height: 600 }
  const cases: [string, string, number, number][] = [
    ['contain', '50% 50%', 1920, 1080],
    ['contain', '50% 0%', 1080, 1920],
    ['cover', '50% 50%', 1920, 1080],
    // cover 且视频比盒子更「窄高」——之前所有 cover 用例都是 1920x1080，
    // else 分支(视频比盒子更窄)在两份算式里都没被走到过，漂了也测不出来。
    ['cover', '50% 50%', 1080, 1920],
    ['fill', '50% 50%', 1920, 1080],
  ]
  for (const [fit, pos, vw, vh] of cases) {
    const { doc, win, video } = makeVideoDoc(box, vw, vh, fit, pos)
    assert.deepEqual(
      clipFactory(win, doc).clip,
      clipRect(box, vw, vh, fit, pos),
      `${fit} / ${pos}：页内算式和纯函数漂了，改一处没改另一处`,
    )
    // 静音只在「未就绪」那条路径上测过，就绪路径的回归查不出来 —— 这里补上。
    assert.equal(video.muted, true, `${fit} / ${pos}：就绪路径也必须静音`)
  }
})

test('CLIP_FACTORY_SRC: 静音，且 readyState<2 时不给 clip', () => {
  const box = { x: 0, y: 0, width: 800, height: 600 }
  const { doc, win, video } = makeVideoDoc(box, 1920, 1080, 'contain', '50% 50%', 1)
  const r = clipFactory(win, doc)
  assert.equal(video.muted, true, '挂一整场不能出声')
  assert.equal(r.ready, false)
  assert.equal(r.clip, null, 'ready=false 还给 clip，调用方拿它去截就是一张黑帧')
})

test('CLIP_FACTORY_SRC: 页面上没有 <video> 时如实报告，不编造矩形', () => {
  const r = clipFactory({ getComputedStyle: () => ({}) }, { querySelector: () => null })
  assert.equal(r.hasVideo, false)
  assert.equal(r.ready, false)
  assert.equal(r.clip, null)
})

test('CLIP_FACTORY_SRC: video 在但还没拿到尺寸时不给 clip，且照样静音', () => {
  const box = { x: 0, y: 0, width: 800, height: 600 }
  const { doc, win, video } = makeVideoDoc(box, 0, 0, 'contain', '50% 50%')
  const r = clipFactory(win, doc)
  assert.equal(r.hasVideo, true)
  assert.equal(r.ready, false)
  assert.equal(r.clip, null)
  assert.equal(video.muted, true, '还没出画面也要先静音，别让它出声')
})

test('clipSource: 组装出的表达式能被解析', () => {
  assert.match(clipSource(), /^\(function \(win, doc\)/)
  assert.doesNotThrow(() => new Function(`return ${clipSource().replace('(window, document)', '(arguments[0], arguments[1])')}`))
})

// ---- 在线人数的 handle 锚定 -------------------------------------------------
// 实测背景（1tb.boiz 房间，登录态）：person-count 在页面上有 5 份，全部来自左侧
// 「已关注」侧栏，每个在播的关注对象一份；房间头部只有显示名和已播时长，没有人数。
// 所以裸 querySelector 取的是侧栏第一条 —— 排序一变读到的就是别人的房间。

const VIEWER_CFG = {
  chatHost: ['.chat'], followers: [], likes: [], speaker: [],
  viewer: ['[data-e2e="person-count"]'],
  viewerRoomBox: ['[data-e2e="live-chat-container"]'],
  viewerItem: ['[data-e2e="live-side-nav-item"]'],
  viewerName: ['[data-e2e="live-side-nav-name"]'],
}
/** 造房间面板容器：内部若干 div，其中一个是 "Viewers· N" 那一块。 */
function roomBox(divTexts: string[]): FakeEl {
  const kids = divTexts.map(el)
  return { textContent: divTexts.join(' '), querySelectorAll: (s) => (s === 'div' ? kids : []) }
}
function viewerRead(
  path: string | undefined, items: FakeEl[], soleCount?: FakeEl, box?: FakeEl,
) {
  const map: Record<string, FakeEl> = { '.chat': el('') }
  if (soleCount) map['[data-e2e="person-count"]'] = soleCount
  if (box) map['[data-e2e="live-chat-container"]'] = box
  const all: Record<string, FakeEl[]> = { '[data-e2e="live-side-nav-item"]': items }
  if (soleCount) all['[data-e2e="person-count"]'] = [soleCount]
  const doc = makeDoc(map, all, path)
  const win = makeWin()
  factory(win, doc, cfg(VIEWER_CFG))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  return { viewer: s.viewer, source: s.viewer_source }
}

test('在线人数：按 URL handle 锚定侧栏那一条，不是 DOM 里第一条', () => {
  // 当前房间排第三 —— 裸 querySelector 会读成 luckintoy 的 90
  const items = [navItem('luckintoy', '90'), navItem('new.world.015', '1.3K'), navItem('1tb.boiz', '105')]
  assert.deepEqual(viewerRead('/@1tb.boiz/live', items), { viewer: '105', source: 'anchored' })
})

test('在线人数：handle 比对不分大小写', () => {
  const items = [navItem('1TB.Boiz', '105')]
  assert.deepEqual(viewerRead('/@1tb.boiz/live', items), { viewer: '105', source: 'anchored' })
})

test('在线人数：侧栏没有当前房间但全页只有一条 → 无歧义，采信', () => {
  // 游客态没有 Following 侧栏，房间自己那条就是唯一的一条
  assert.deepEqual(viewerRead('/@1tb.boiz/live', [], el('105')), { viewer: '105', source: 'sole' })
})

test('在线人数：对不上号且有多条 → 报 null，绝不退回去乱取一个', () => {
  // 这是整条链路最要紧的一条：宁可没有，也不要把别人的在线人数写进对方档案。
  // 旧写法在这里会稳稳返回 90，而且 selectorsOk 看起来完全正常。
  const items = [navItem('luckintoy', '90'), navItem('new.world.015', '1.3K')]
  assert.deepEqual(viewerRead('/@1tb.boiz/live', items), { viewer: null, source: null })
})

test('在线人数：拿不到 URL handle 时不敢猜', () => {
  const items = [navItem('luckintoy', '90'), navItem('1tb.boiz', '105')]
  assert.deepEqual(viewerRead(undefined, items), { viewer: null, source: null })
})

test('在线人数：侧栏条目里没有人数节点就跳过，继续找下一条', () => {
  const broken: FakeEl = { textContent: '1tb.boiz', querySelector: (s) =>
    s === '[data-e2e="live-side-nav-name"]' ? el('1tb.boiz') : null }
  // 唯一匹配的那条读不出人数 → 不能假装成功，报 null
  assert.deepEqual(viewerRead('/@1tb.boiz/live', [broken]), { viewer: null, source: null })
})

test('在线人数：房间面板优先于侧栏 —— 两者不一致时以房间自己那份为准', () => {
  // 实测右侧面板 93、左侧栏同一个号 105，两处采样时刻不同。房间面板那份才是权威。
  const box = roomBox(['', 'Viewers· 93', '其它'])
  const items = [navItem('1tb.boiz', '105')]
  assert.deepEqual(viewerRead('/@1tb.boiz/live', items, undefined, box), { viewer: '93', source: 'room' })
})

test('在线人数：房间面板判据不认「Viewers」这个词，换语言照样过', () => {
  // 只认「少量非数字字符 + 中点 + 数字」。日文界面是 視聴者· 93
  assert.deepEqual(viewerRead('/@x/live', [], undefined, roomBox(['視聴者· 93'])), { viewer: '93', source: 'room' })
  assert.deepEqual(viewerRead('/@x/live', [], undefined, roomBox(['观众· 1.3K'])), { viewer: '1.3K', source: 'room' })
})

test('在线人数：房间面板里的纯数字/纯文字块不会被误当成人数', () => {
  // 没有中点分隔符的块（比如已播时长 2:24:59、或一个孤零零的数字）一律不算
  assert.deepEqual(viewerRead('/@x/live', [], undefined, roomBox(['2:24:59', '105', 'Viewers'])),
    { viewer: null, source: null })
})

test('同期横截面：侧栏整条抄下来，含当前房间自己那条', () => {
  // 待在 A 房间时，侧栏白送 B/C/D 同一时刻的在线人数 —— 单房间曲线说不了
  // "是它涨了还是大盘涨了"，这份同期数据能。
  const items = [navItem('1tb.boiz', '105'), navItem('luckintoy', '90'), navItem('new.world.015', '1.3K')]
  const box = roomBox(['Viewers· 93'])
  const map: Record<string, FakeEl> = { '.chat': el(''), '[data-e2e="live-chat-container"]': box }
  const doc = makeDoc(map, { '[data-e2e="live-side-nav-item"]': items }, '/@1tb.boiz/live')
  const win = makeWin()
  factory(win, doc, cfg(VIEWER_CFG))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, '93', '自己那份仍以房间面板为准')
  assert.deepEqual(s.co_live, [
    { handle: '1tb.boiz', viewer: '105' },
    { handle: 'luckintoy', viewer: '90' },
    { handle: 'new.world.015', viewer: '1.3K' },
  ])
})

test('同期横截面：没有侧栏（游客态）时报 null，不是空数组', () => {
  // null 表示"这一分钟没有这份数据"，空数组会被读成"侧栏里一个在播的都没有"
  const box = roomBox(['Viewers· 93'])
  const map: Record<string, FakeEl> = { '.chat': el(''), '[data-e2e="live-chat-container"]': box }
  const doc = makeDoc(map, {}, '/@1tb.boiz/live')
  const win = makeWin()
  factory(win, doc, cfg(VIEWER_CFG))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  assert.equal(lw.drain()[0].co_live, null)
})

test('在线人数：锚定到了本房间那条却没人数 —— 不许再退到"全页唯一"那一档', () => {
  // 这一档最容易写错：既然已经认出"这条就是本房间"，它没数就是没数；
  // 此时页面上那个唯一的 person-count 属于**别人**，退过去就是张冠李戴。
  const broken: FakeEl = { textContent: '1tb.boiz', querySelector: (s) =>
    s === '[data-e2e="live-side-nav-name"]' ? el('1tb.boiz') : null }
  const map: Record<string, FakeEl> = { '.chat': el(''), '[data-e2e="person-count"]': el('90') }
  const doc = makeDoc(map, {
    '[data-e2e="live-side-nav-item"]': [broken],
    '[data-e2e="person-count"]': [el('90')],   // 全页恰好只有一条，属于 luckintoy
  }, '/@1tb.boiz/live')
  const win = makeWin()
  factory(win, doc, cfg(VIEWER_CFG))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, null, '宁可没有，也不要把 90 当成本房间的人数')
  assert.equal(s.viewer_source, null)
})

test('在线人数：全页有多条 person-count 时，"唯一"那一档必须不成立', () => {
  // 只有确实唯一才无歧义。多条却采信第一条，就退回成改之前那个 bug。
  const map: Record<string, FakeEl> = { '.chat': el(''), '[data-e2e="person-count"]': el('90') }
  const doc = makeDoc(map, { '[data-e2e="person-count"]': [el('90'), el('1.3K'), el('11')] }, '/@nobody/live')
  const win = makeWin()
  factory(win, doc, cfg(VIEWER_CFG))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  const s = lw.drain()[0]
  assert.equal(s.viewer, null)
  assert.equal(s.viewer_source, null)
})

test('在线人数：房间面板必须有中点分隔符才算，纯「标签 数字」不算', () => {
  // 去掉中点要求的话，面板里任何「若干字 + 数字」的块都会被当成人数
  assert.deepEqual(viewerRead('/@x/live', [], undefined, roomBox(['Viewers 93'])), { viewer: null, source: null })
  assert.deepEqual(viewerRead('/@x/live', [], undefined, roomBox(['Viewers· 93'])), { viewer: '93', source: 'room' })
})

test('同期横截面：有名字没人数的条目也要留，记成 viewer:null', () => {
  // 实测侧栏里 servauto.my 出现过「有名字、数字还没渲染」的状态。
  // 整条丢掉的话，这一分钟的记录会显得它根本没在播 —— 而"在播但没读到人数"
  // 和"没在播"是两回事，后面做同期对比时会把它算成掉线。
  const noCount: FakeEl = { textContent: 'servauto.my', querySelector: (s) =>
    s === '[data-e2e="live-side-nav-name"]' ? el('servauto.my') : null }
  const items = [navItem('1tb.boiz', '98'), noCount]
  const box = roomBox(['Viewers· 98'])
  const map: Record<string, FakeEl> = { '.chat': el(''), '[data-e2e="live-chat-container"]': box }
  const doc = makeDoc(map, { '[data-e2e="live-side-nav-item"]': items }, '/@1tb.boiz/live')
  const win = makeWin()
  factory(win, doc, cfg(VIEWER_CFG))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  assert.deepEqual(lw.drain()[0].co_live, [
    { handle: '1tb.boiz', viewer: '98' },
    { handle: 'servauto.my', viewer: null },
  ])
})
