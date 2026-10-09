// src/lib/competitors/pageReader.ts
// 浏览器扩展 extensions/live-shot 在用户点击那一刻注入直播间页面的「读一次」函数。
// 与 liveProbe.ts 同一原则：产出的是源码字符串，字符串内部零 import、零 TS 语法；
// 在线人数与画面矩形的判据全部复用 PROBE_FACTORY_SRC / CLIP_FACTORY_SRC，扩展里不另写一份。
import { CLIP_FACTORY_SRC, PROBE_FACTORY_SRC, defaultProbeConfig, type ProbeConfig } from './liveProbe.ts'

/** 侧栏频道容器。2026-10-09 实测：每个区块一个，已登录时第一个是 Following。 */
export const SIDEBAR_CHANNEL = ['[data-e2e="live-side-nav-channel"]']

/**
 * 扩展用的探针配置：不起定时器（手动 tick 一次），同期横截面只读 Following。
 * 一次性读取用不着弹幕计数，chatHost 置空就不挂 MutationObserver。
 * sidebarChannel 返回副本，调用方改不到常量。
 */
export function extensionProbeConfig(): ProbeConfig {
  return { ...defaultProbeConfig(), intervalMs: 0, chatHost: [], sidebarChannel: [...SIDEBAR_CHANNEL] }
}

/**
 * 注入页面执行的读取函数：(win, doc, cfg) → 一次读数。
 * - 画面矩形用 CLIP_FACTORY_SRC，传 { mute: false }：人正在看，不动播放器。
 * - 人数用 PROBE_FACTORY_SRC：探针装在一个临时宿主对象上而不是 window，tick 一次、
 *   drain、断开 —— 读完 window 上不留任何状态，也碰不到页面里已有的 __lw。
 *   断开放在 finally 里，中途抛错也不留 observer / 定时器。
 * - 附带 visualScale（visualViewport.scale）：触控板双指缩放时截图与元素坐标对不上。
 */
export const PAGE_READER_SRC = `function (win, doc, cfg) {
  var probeFactory = ${PROBE_FACTORY_SRC}
  var clipFactory = ${CLIP_FACTORY_SRC}
  var clip = clipFactory(win, doc, { mute: false })
  // 探针装在一个临时宿主上而不是 window：读一次就扔，任何 window 上都不留 __lw——
  // 哪怕以后有人把注入改到 MAIN world，也碰不到分钟级采集器挂在页面上的那个 __lw
  var host = {
    JSON: win.JSON,
    Date: win.Date,
    MutationObserver: win.MutationObserver,
    location: win.location,
    setInterval: function (f, ms) { return win.setInterval(f, ms) },
    clearInterval: function (id) { return win.clearInterval(id) }
  }
  var sample = null
  try {
    probeFactory(host, doc, cfg)
    if (host.__lw) {
      host.__lw.tick()
      sample = host.__lw.drain()[0] || null
    }
  } finally {
    // 中途抛错也要断开（chatHost 非空时会挂 observer），不留尾巴
    if (host.__lw && typeof host.__lw.disconnect === 'function') host.__lw.disconnect()
  }
  var loc = (doc && doc.location) || win.location
  var vv = win.visualViewport
  return {
    href: loc && loc.href ? String(loc.href) : null,
    viewportWidth: win.innerWidth || 0,
    // 触控板双指缩放（visualViewport.scale≠1）时截图与元素坐标对不上，交给弹窗拒截
    visualScale: vv && vv.scale ? vv.scale : 1,
    capturedAt: win.Date.now(),
    clip: clip,
    viewer: sample ? sample.viewer : null,
    viewerSource: sample ? sample.viewer_source : null,
    coLive: sample ? sample.co_live : null
  }
}`

/** extensions/live-shot/generated/page-reader.js 的完整内容。 */
export function renderReaderModule(): string {
  return [
    '// 自动生成，禁止手改。来源：src/lib/competitors/pageReader.ts',
    '// 改了 liveProbe.ts / pageReader.ts 之后重跑：node --experimental-strip-types scripts/gen-extension-reader.mjs',
    '',
    `export const PROBE_CONFIG = ${JSON.stringify(extensionProbeConfig(), null, 2)}`,
    '',
    '// chrome.scripting.executeScript 会把这个函数序列化后注入页面，所以它必须自包含。',
    '// 必须在 ISOLATED world 执行（executeScript 默认即是），不要改成 MAIN。',
    'export function readLivePage(cfg) {',
    `  return (${PAGE_READER_SRC})(window, document, cfg)`,
    '}',
    '',
  ].join('\n')
}
