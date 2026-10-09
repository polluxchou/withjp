// src/lib/competitors/pageReader.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'

import { PROBE_VERSION, defaultProbeConfig } from './liveProbe.ts'
import { PAGE_READER_SRC, SIDEBAR_CHANNEL, extensionProbeConfig, renderReaderModule } from './pageReader.ts'

// ---- 假 DOM：只造读取函数会碰到的部分 ----------------------------------------
// 不叫 Node：会遮住 DOM 的全局类型。
type FakeNode = { textContent: string; nodeType?: number; querySelector?: (s: string) => FakeNode | null; querySelectorAll?: (s: string) => FakeNode[] }
const el = (t: string): FakeNode => ({ textContent: t, nodeType: 1 })
function navItem(handle: string, count: string): FakeNode {
  const inner: Record<string, FakeNode> = { '[data-e2e="live-side-nav-name"]': el(handle), '[data-e2e="person-count"]': el(count) }
  return { textContent: `${handle} ${count}`, querySelector: (s) => inner[s] ?? null }
}
function channel(items: FakeNode[]): FakeNode {
  return { textContent: '', querySelectorAll: (s) => (s === '[data-e2e="live-side-nav-item"]' ? items : []) }
}

const CHAT_BOX = '[data-e2e="live-chat-container"]'

function makePage() {
  const video = { muted: false, volume: 1, videoWidth: 540, videoHeight: 960, readyState: 4, getBoundingClientRect: () => ({ x: 100, y: 0, width: 800, height: 900 }) }
  const roomKids = [el(''), el('Viewers· 99')]
  const room: FakeNode = { textContent: 'Viewers· 99', querySelectorAll: (s) => (s === 'div' ? roomKids : []) }
  const following = channel([navItem('1mb.dear', '103'), navItem('uni.chuuu', '64')])
  const suggested = channel([navItem('stranger', '692')])
  const map: Record<string, unknown> = { video, [CHAT_BOX]: room }
  const all: Record<string, FakeNode[]> = {
    '[data-e2e="live-side-nav-channel"]': [following, suggested],
    '[data-e2e="live-side-nav-item"]': [...following.querySelectorAll!('[data-e2e="live-side-nav-item"]'), ...suggested.querySelectorAll!('[data-e2e="live-side-nav-item"]')],
  }
  const doc = {
    location: { pathname: '/@1mb.dear/live', href: 'https://www.tiktok.com/@1mb.dear/live' },
    querySelector: (s: string) => (map[s] as FakeNode) ?? null,
    querySelectorAll: (s: string) => all[s] ?? [],
    contains: () => true,
  }
  const observers: { disconnected: boolean }[] = []
  const win: Record<string, unknown> = {
    innerWidth: 1600,
    Date: { now: () => 1_760_000_000_000 },
    JSON,
    setInterval: () => 1,
    clearInterval: () => {},
    getComputedStyle: () => ({ objectFit: 'contain', objectPosition: '50% 50%' }),
    MutationObserver: class {
      entry = { disconnected: false }
      constructor() { observers.push(this.entry) }
      observe() {}
      disconnect() { this.entry.disconnected = true }
    },
  }
  return { win, doc, video, observers }
}

const reader = new Function(`return (${PAGE_READER_SRC})`)() as (win: unknown, doc: unknown, cfg: unknown) => Record<string, any>

test('读一次：画面矩形、房间面板人数、只含 Following 的同期横截面', () => {
  const { win, doc } = makePage()
  const r = reader(win, doc, extensionProbeConfig())
  assert.equal(r.href, 'https://www.tiktok.com/@1mb.dear/live')
  assert.equal(r.viewportWidth, 1600)
  assert.equal(r.capturedAt, 1_760_000_000_000)
  assert.equal(r.clip.ready, true)
  assert.deepEqual(r.clip.clip, { x: 247, y: 0, width: 506, height: 900 })
  assert.equal(r.viewer, '99')
  assert.equal(r.viewerSource, 'room')
  assert.deepEqual(r.coLive, [
    { handle: '1mb.dear', viewer: '103' },
    { handle: 'uni.chuuu', viewer: '64' },
  ])
})

test('读一次：不动播放器', () => {
  const { win, doc, video } = makePage()
  reader(win, doc, extensionProbeConfig())
  assert.equal(video.muted, false)
  assert.equal(video.volume, 1)
})

test('读一次：不碰 window 上已有的 __lw（分钟级采集器那个），也不挂弹幕 observer', () => {
  const { win, doc, observers } = makePage()
  // 哨兵：长得和「同版本同配置的探针」一模一样。读取函数要是把探针装在 window 上，
  // 就会命中复用分支去调它的 tick（抛错）；要是读完顺手清理 window.__lw，哨兵就会被拆掉。
  const sentinel = {
    version: PROBE_VERSION,
    cfgKey: JSON.stringify(extensionProbeConfig()),
    disconnectCalls: 0,
    disconnect() { this.disconnectCalls++ },
    tick() { throw new Error('must not reuse') },
    drain() { return [] },
  }
  win.__lw = sentinel
  const r = reader(win, doc, extensionProbeConfig())
  assert.equal(win.__lw, sentinel)
  assert.equal(sentinel.disconnectCalls, 0)
  assert.equal(r.viewer, '99', '读数必须来自新建的探针')
  assert.equal(observers.length, 0, '一次性读取不数弹幕，chatHost 置空就不该有 MutationObserver')
})

test('读一次：读完 window 上不留 __lw', () => {
  const { win, doc } = makePage()
  reader(win, doc, extensionProbeConfig())
  assert.equal(win.__lw, undefined)
})

test('读一次：中途抛错也要断开 observer', () => {
  const { win, doc, observers } = makePage()
  // 让探针挂上 observer（chatHost 非空），再让第二次查弹幕容器时炸 —— 那发生在 tick 里
  const realQuery = doc.querySelector
  let hits = 0
  doc.querySelector = (s: string) => {
    if (s === CHAT_BOX && ++hits >= 2) throw new Error('boom')
    return realQuery(s)
  }
  const cfg = { ...extensionProbeConfig(), chatHost: [CHAT_BOX] }
  assert.throws(() => reader(win, doc, cfg), /boom/)
  assert.ok(observers.length > 0, '探针应当挂过 observer，否则下一条断言是空转')
  assert.ok(observers.every((o) => o.disconnected), '抛错路径上 observer 也必须断开，否则一直挂在页面上数弹幕')
})

test('连点两次：第二次是全新读数', () => {
  const { win, doc } = makePage()
  const a = reader(win, doc, extensionProbeConfig())
  const b = reader(win, doc, extensionProbeConfig())
  assert.deepEqual(b.coLive, a.coLive)
  assert.equal(b.viewer, '99')
})

test('visualScale：触控板双指缩放时如实报出，平时是 1', () => {
  const zoomed = makePage()
  zoomed.win.visualViewport = { scale: 1.5 }
  assert.equal(reader(zoomed.win, zoomed.doc, extensionProbeConfig()).visualScale, 1.5)

  const plain = makePage()
  assert.equal(reader(plain.win, plain.doc, extensionProbeConfig()).visualScale, 1)
})

test('extensionProbeConfig：在默认配置上只改 intervalMs / chatHost / sidebarChannel', () => {
  const c = extensionProbeConfig()
  assert.equal(c.intervalMs, 0)
  assert.deepEqual(c.chatHost, [])
  assert.deepEqual(c.sidebarChannel, SIDEBAR_CHANNEL)
  const { intervalMs: _i, chatHost: _c, sidebarChannel: _s, ...rest } = c
  const { intervalMs: _di, chatHost: _dc, ...defaults } = defaultProbeConfig()
  assert.deepEqual(rest, defaults)
})

test('extensionProbeConfig：sidebarChannel 是副本，改它不影响常量', () => {
  const before = [...SIDEBAR_CHANNEL]
  const c = extensionProbeConfig()
  c.sidebarChannel!.push('x')
  assert.deepEqual(SIDEBAR_CHANNEL, before)
  assert.deepEqual(extensionProbeConfig().sidebarChannel, before)
})

test('renderReaderModule：产出可被扩展 import 的模块文本', () => {
  const src = renderReaderModule()
  assert.match(src, /^\/\/ 自动生成，禁止手改/)
  assert.match(src, /export const PROBE_CONFIG = /)
  assert.match(src, /export function readLivePage\(cfg\) \{/)
  assert.match(src, /ISOLATED world/)
  // 去掉 export 关键字后整段是合法 JS，readLivePage 能被取出来
  const body = src.replace(/export /g, '')
  const fn = new Function(`${body}; return readLivePage`)()
  assert.equal(typeof fn, 'function')
})

test('renderReaderModule：模拟 executeScript 的序列化注入，结果与直接调用一致', () => {
  const body = renderReaderModule().replace(/export /g, '')
  const { PROBE_CONFIG, readLivePage } = new Function(`${body}; return { PROBE_CONFIG, readLivePage }`)()
  const roundTrip = (v: unknown) => JSON.parse(JSON.stringify(v))
  assert.deepEqual(roundTrip(PROBE_CONFIG), roundTrip(extensionProbeConfig()))

  // chrome.scripting.executeScript({ func, args }) 只把 func.toString() 和 JSON 化的 args 送进页面，
  // 闭包与模块作用域全都不带过去。这里同样只送这两样，在一个干净的 vm 上下文里跑。
  const injected = makePage()
  const out = vm.runInNewContext(`(${readLivePage.toString()})(${JSON.stringify(PROBE_CONFIG)})`, { window: injected.win, document: injected.doc })
  const direct = makePage()
  const expected = reader(direct.win, direct.doc, extensionProbeConfig())
  assert.equal(expected.viewer, '99', '对照组本身要读得到数，否则下面是拿空对空')
  assert.deepEqual(roundTrip(out), roundTrip(expected))
})
