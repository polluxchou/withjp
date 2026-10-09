// src/lib/competitors/pageReader.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultProbeConfig } from './liveProbe.ts'
import { PAGE_READER_SRC, SIDEBAR_CHANNEL, extensionProbeConfig, renderReaderModule } from './pageReader.ts'

// ---- 假 DOM：只造读取函数会碰到的部分 ----------------------------------------
type Node = { textContent: string; nodeType?: number; querySelector?: (s: string) => Node | null; querySelectorAll?: (s: string) => Node[] }
const el = (t: string): Node => ({ textContent: t, nodeType: 1 })
function navItem(handle: string, count: string): Node {
  const inner: Record<string, Node> = { '[data-e2e="live-side-nav-name"]': el(handle), '[data-e2e="person-count"]': el(count) }
  return { textContent: `${handle} ${count}`, querySelector: (s) => inner[s] ?? null }
}
function channel(items: Node[]): Node {
  return { textContent: '', querySelectorAll: (s) => (s === '[data-e2e="live-side-nav-item"]' ? items : []) }
}

function makePage() {
  const video = { muted: false, volume: 1, videoWidth: 540, videoHeight: 960, readyState: 4, getBoundingClientRect: () => ({ x: 100, y: 0, width: 800, height: 900 }) }
  const roomKids = [el(''), el('Viewers· 99')]
  const room: Node = { textContent: 'Viewers· 99', querySelectorAll: (s) => (s === 'div' ? roomKids : []) }
  const following = channel([navItem('1mb.dear', '103'), navItem('uni.chuuu', '64')])
  const suggested = channel([navItem('stranger', '692')])
  const map: Record<string, unknown> = { video, '[data-e2e="live-chat-container"]': room }
  const all: Record<string, Node[]> = {
    '[data-e2e="live-side-nav-channel"]': [following, suggested],
    '[data-e2e="live-side-nav-item"]': [...following.querySelectorAll!('[data-e2e="live-side-nav-item"]'), ...suggested.querySelectorAll!('[data-e2e="live-side-nav-item"]')],
  }
  const doc = {
    location: { pathname: '/@1mb.dear/live', href: 'https://www.tiktok.com/@1mb.dear/live' },
    querySelector: (s: string) => (map[s] as Node) ?? null,
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

test('读一次：读完不在页面环境里留探针，observer 已断开', () => {
  const { win, doc, observers } = makePage()
  reader(win, doc, extensionProbeConfig())
  assert.equal(win.__lw, undefined)
  assert.ok(observers.length > 0, '探针应当挂过 observer，否则下一条断言是空转')
  assert.ok(observers.every((o) => o.disconnected), '弹幕 observer 必须断开，否则一直挂在页面上数弹幕')
})

test('连点两次：第二次是全新读数，不复用上一次的探针', () => {
  const { win, doc } = makePage()
  const a = reader(win, doc, extensionProbeConfig())
  const b = reader(win, doc, extensionProbeConfig())
  assert.deepEqual(b.coLive, a.coLive)
  assert.equal(b.viewer, '99')
})

test('extensionProbeConfig：在默认配置上只改 intervalMs 与 sidebarChannel', () => {
  const c = extensionProbeConfig()
  assert.equal(c.intervalMs, 0)
  assert.deepEqual(c.sidebarChannel, SIDEBAR_CHANNEL)
  const { intervalMs: _i, sidebarChannel: _s, ...rest } = c
  const { intervalMs: _d, ...defaults } = defaultProbeConfig()
  assert.deepEqual(rest, defaults)
})

test('renderReaderModule：产出可被扩展 import 的模块文本', () => {
  const src = renderReaderModule()
  assert.match(src, /^\/\/ 自动生成，禁止手改/)
  assert.match(src, /export const PROBE_CONFIG = /)
  assert.match(src, /export function readLivePage\(cfg\) \{/)
  // 去掉 export 关键字后整段是合法 JS，readLivePage 能被取出来
  const body = src.replace(/export /g, '')
  const fn = new Function(`${body}; return readLivePage`)()
  assert.equal(typeof fn, 'function')
})
