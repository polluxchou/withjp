// 纯字符串产出，零 import：这里的东西是要注入直播间页面执行的源码，
// 不在 Node 里跑，所以不能有任何 import / TS 语法进入字符串内部。
// 测试用假 DOM 调用同一份源码，保证「测的就是注入的」。

export const PROBE_VERSION = 1

export type ProbeConfig = {
  version: number
  /** 探针自己打点的间隔；<=0 表示不起定时器（测试用，由外部手动 tick） */
  intervalMs: number
  /** 在线人数的候选选择器，按顺序试 */
  viewer: string[]
  /** 主播粉丝数 */
  followers: string[]
  /** 累计点赞 */
  likes: string[]
  /** 弹幕列表容器 */
  chatHost: string[]
  /** 弹幕节点内的发言人元素；一个都没命中就不猜，speakers 报 null */
  speaker: string[]
  /** 弹幕容器是否需要监听子树（容器频繁重建时打开） */
  chatSubtree: boolean
}

/**
 * 候选选择器的初始猜测。这些值 spec 第 11 节验证项①还没定论 ——
 * 迁移注释记的是 room-header 的 person-count，sweep-live.mjs 的注释说右侧面板不稳、
 * 要走左侧已关注侧栏。所以这里给候选表按顺序试，第一次真实运行会把命中的那个
 * 通过 selectorsOk 报回来，那就是验证结论。
 */
export function defaultProbeConfig(): ProbeConfig {
  return {
    version: PROBE_VERSION,
    intervalMs: 60_000,
    viewer: [
      '[data-e2e="live-people-count"]',
      '[data-e2e="person-count"]',
      '[data-e2e="live-room-people-count"]',
    ],
    followers: [
      '[data-e2e="live-anchor-follower-count"]',
      '[data-e2e="followers-count"]',
    ],
    likes: [
      '[data-e2e="live-like-count"]',
      '[data-e2e="like-count"]',
    ],
    chatHost: [
      '[data-e2e="chat-room"]',
      '[data-e2e="live-chat-list"]',
    ],
    speaker: [
      '[data-e2e="message-owner-name"]',
    ],
    chatSubtree: false,
  }
}

/**
 * 页内探针的工厂函数源码。
 * 只接触 win / doc / cfg 三个参数，不引用任何全局 —— 既保证可测，
 * 也保证注入后除了 win.__lw 之外不碰页面上的任何东西。
 */
export const PROBE_FACTORY_SRC = `function (win, doc, cfg) {
  if (win.__lw) {
    if (win.__lw.version === cfg.version) {
      return { reused: true, attached: !!win.__lw.attached, version: cfg.version }
    }
    // 版本变了要整个重建。先断开上一版的 observer —— 否则它会永远挂在旧节点上，
    // 对着一个再也没人读的计数器烧 CPU，每条弹幕烧一次，直到这个 tab 关掉。
    if (typeof win.__lw.disconnect === 'function') win.__lw.disconnect()
  }
  function textOf(node) {
    return node && node.textContent ? String(node.textContent).trim() : ''
  }
  function firstText(cands) {
    for (var i = 0; i < cands.length; i++) {
      var t = textOf(doc.querySelector(cands[i]))
      if (t) return { sel: cands[i], text: t }
    }
    return { sel: null, text: null }
  }
  function firstEl(cands) {
    for (var i = 0; i < cands.length; i++) {
      var e = doc.querySelector(cands[i])
      if (e) return { sel: cands[i], el: e }
    }
    return { sel: null, el: null }
  }
  var st = { msgs: 0, seen: Object.create(null), nSpeakers: 0, buf: [],
             host: null, hostSel: null, obs: null, speakerSel: null }
  // 只认真正的发言人选择器。以前这里有个「取首个冒号之前」的兜底，已经去掉：
  // 系统消息、礼物提示、正文里带 http:// 或时间比分的普通弹幕，都会被它编造成
  // 一个假发言人；不同真人发的相似内容又会被并成同一个。engagement 指标宁可为空
  // 也不能是编的 —— 没命中就让 speakers 报 null，selectorsOk.speaker 也报 null。
  function speakerOf(node) {
    if (!node || !node.querySelector) return null
    for (var i = 0; i < cfg.speaker.length; i++) {
      var w = textOf(node.querySelector(cfg.speaker[i]))
      if (w) { st.speakerSel = cfg.speaker[i]; return w }
    }
    return null
  }
  function count(node) {
    st.msgs += 1
    var who = speakerOf(node)
    if (who && !st.seen[who]) { st.seen[who] = 1; st.nSpeakers += 1 }
  }
  function attach() {
    // 重挂之前先断开旧的，否则 reattach 之后每条弹幕会被两个 observer 各数一次
    if (st.obs) { st.obs.disconnect(); st.obs = null }
    var f = firstEl(cfg.chatHost)
    if (!f.el) return false
    st.host = f.el
    st.hostSel = f.sel
    var obs = new win.MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var added = recs[i].addedNodes || []
        for (var j = 0; j < added.length; j++) count(added[j])
      }
    })
    obs.observe(f.el, { childList: true, subtree: !!cfg.chatSubtree })
    st.obs = obs
    return true
  }
  function alive() {
    if (!st.host) return false
    return doc.contains ? !!doc.contains(st.host) : true
  }
  function tick() {
    var v = firstText(cfg.viewer)
    var f = firstText(cfg.followers)
    var l = firstText(cfg.likes)
    st.buf.push({
      t: win.Date.now(),
      viewer: v.text,
      followers: f.text,
      likes: l.text,
      msgs: st.msgs,
      // 没有可靠的发言人选择器就报 null，别把 0 当成「没人说话」
      speakers: st.speakerSel ? st.nSpeakers : null,
      observerAlive: alive(),
      selectorsOk: {
        viewer: v.sel, followers: f.sel, likes: l.sel,
        chatHost: st.hostSel, speaker: st.speakerSel
      }
    })
    st.msgs = 0
    st.seen = Object.create(null)
    st.nSpeakers = 0
    st.speakerSel = null
  }
  var ok = attach()
  win.__lw = {
    version: cfg.version,
    attached: ok,
    tick: tick,
    reattach: attach,
    alive: alive,
    drain: function () { var out = st.buf; st.buf = []; return out },
    disconnect: function () { if (st.obs) { st.obs.disconnect(); st.obs = null } }
  }
  if (cfg.intervalMs > 0) win.setInterval(tick, cfg.intervalMs)
  return { reused: false, attached: ok, version: cfg.version }
}`

/** 拼出注入用的完整表达式。 */
export function probeSource(cfg: ProbeConfig): string {
  return `(${PROBE_FACTORY_SRC})(window, document, ${JSON.stringify(cfg)})`
}
