// src/lib/competitors/pageReader.ts
// 浏览器扩展 extensions/live-shot 在用户点击那一刻注入直播间页面的「读一次」函数。
// 与 liveProbe.ts 同一原则：产出的是源码字符串，字符串内部零 import、零 TS 语法；
// 在线人数与画面矩形的判据全部复用 PROBE_FACTORY_SRC / CLIP_FACTORY_SRC，扩展里不另写一份。
import { CLIP_FACTORY_SRC, PROBE_FACTORY_SRC, defaultProbeConfig, type ProbeConfig } from './liveProbe.ts'

/** 侧栏频道容器。2026-10-09 实测：每个区块一个，已登录时第一个是 Following。 */
export const SIDEBAR_CHANNEL = ['[data-e2e="live-side-nav-channel"]']

/** 扩展用的探针配置：不起定时器（手动 tick 一次），同期横截面只读 Following。 */
export function extensionProbeConfig(): ProbeConfig {
  return { ...defaultProbeConfig(), intervalMs: 0, sidebarChannel: SIDEBAR_CHANNEL }
}

/**
 * 注入页面执行的读取函数：(win, doc, cfg) → 一次读数。
 * - 画面矩形用 CLIP_FACTORY_SRC，传 { mute: false }：人正在看，不动播放器。
 * - 人数用 PROBE_FACTORY_SRC：先拆掉上一次可能残留的探针，建新探针、tick 一次、
 *   drain、断开、删掉 —— 读完不在页面环境里留任何状态。
 */
export const PAGE_READER_SRC = `function (win, doc, cfg) {
  var probeFactory = ${PROBE_FACTORY_SRC}
  var clipFactory = ${CLIP_FACTORY_SRC}
  var clip = clipFactory(win, doc, { mute: false })
  if (win.__lw && typeof win.__lw.disconnect === 'function') win.__lw.disconnect()
  win.__lw = undefined
  probeFactory(win, doc, cfg)
  var lw = win.__lw
  var sample = null
  if (lw) {
    lw.tick()
    sample = lw.drain()[0] || null
    lw.disconnect()
  }
  win.__lw = undefined
  var loc = (doc && doc.location) || win.location
  return {
    href: loc && loc.href ? String(loc.href) : null,
    viewportWidth: win.innerWidth || 0,
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
    'export function readLivePage(cfg) {',
    `  return (${PAGE_READER_SRC})(window, document, cfg)`,
    '}',
    '',
  ].join('\n')
}
