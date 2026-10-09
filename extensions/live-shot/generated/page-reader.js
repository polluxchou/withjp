// 自动生成，禁止手改。来源：src/lib/competitors/pageReader.ts
// 改了 liveProbe.ts / pageReader.ts 之后重跑：node --experimental-strip-types scripts/gen-extension-reader.mjs

export const PROBE_CONFIG = {
  "version": 1,
  "intervalMs": 0,
  "viewerRoomBox": [
    "[data-e2e=\"live-chat-container\"]"
  ],
  "viewerItem": [
    "[data-e2e=\"live-side-nav-item\"]"
  ],
  "viewerName": [
    "[data-e2e=\"live-side-nav-name\"]"
  ],
  "viewer": [
    "[data-e2e=\"person-count\"]",
    "[data-e2e=\"live-people-count\"]"
  ],
  "followers": [
    "[data-e2e=\"live-anchor-follower-count\"]",
    "[data-e2e=\"followers-count\"]"
  ],
  "likes": [
    "[data-e2e=\"live-like-count\"]",
    "[data-e2e=\"like-count\"]"
  ],
  "chatHost": [],
  "message": [
    "[data-e2e=\"chat-message\"]"
  ],
  "speaker": [
    "[data-e2e=\"message-owner-name\"]"
  ],
  "chatSubtree": true,
  "sidebarChannel": [
    "[data-e2e=\"live-side-nav-channel\"]"
  ]
}

// chrome.scripting.executeScript 会把这个函数序列化后注入页面，所以它必须自包含。
// 必须在 ISOLATED world 执行（executeScript 默认即是），不要改成 MAIN。
export function readLivePage(cfg) {
  return (function (win, doc, cfg) {
  var probeFactory = function (win, doc, cfg) {
  // 复用判据带上配置本身，不只看 version。改了选择器却忘了改版本号的话，页面里
  // 那个旧探针会被"复用"、静默沿用旧配置 —— 2026-09-16 真机运行就栽在这：
  // chatHost 候选已经修好了，但第一轮注入的旧探针还在，attached 一直 false，
  // 而日志和样本看起来一切正常。把配置纳入判据之后，这件事不可能再忘。
  var cfgKey = ''
  try { cfgKey = win.JSON.stringify(cfg) } catch (e) { cfgKey = String(cfg.version) }
  if (win.__lw) {
    if (win.__lw.version === cfg.version && win.__lw.cfgKey === cfgKey) {
      // 复用 = 不重建状态，**不等于**放弃挂载。首次注入时弹幕容器往往还没渲染出来
      // （SPA 进房后要等一会儿），attach 失败；如果这里直接返回，后续每次重注入都
      // 命中复用分支，attach() 再也不会被调用一次 —— observer_alive 会从头到尾是
      // false，而日志只会说"探针已复用"。2026-09-16 真机运行栽的就是这一层：
      // 配置改对了、容器也在页面上了，就是没人再试一次。
      if (!win.__lw.attached && typeof win.__lw.reattach === 'function') {
        win.__lw.attached = !!win.__lw.reattach()
      }
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
  // 「标签· 数字」：房间面板顶部就是这个形态（实测 "Viewers· 93"）。刻意不去匹配
  // "Viewers" 这个词 —— 那是界面语言，日文界面下会变。只认「少量非数字字符 +
  // 中点分隔符 + 数字」，语言换了照样过。
  var VIEWER_LABELED = /^[^0-9]{1,16}[\u00b7\u30fb\u2027]\s*([0-9][0-9.,]*\s*[KMkm]?)$/

  /**
   * 在线人数读哪一个 —— 2026-09-16 在 1tb.boiz 房间实测定下的三档。
   *
   * 背景：person-count 这个 data-e2e 在登录态下**全部来自左侧「已关注」侧栏**，
   * 每个在播的关注对象各一份（当时页面上有 5 份：105/90/6/1.3K/11）。裸
   * querySelector 取的是 DOM 顺序里第一条 —— 侧栏排序一变，读到的就是别人房间的
   * 人数，而且数据形态和真命中一模一样，看不出问题。
   *
   * 当前房间自己那份在右侧面板顶部（"Viewers· 93"），那一块**没有任何 data-e2e**，
   * 只能以 live-chat-container 为锚往里找形态。
   *
   * ① room   —— 房间面板。无条件属于当前房间，游客态也在，首选。
   * ② anchored —— 侧栏里 handle 等于 URL 里那个的那条。只有关注了对方才有。
   * ③ sole   —— 全页只有一个 person-count，无歧义。
   * 都不成立就报 null：宁可这一分钟没有人数，也不要把别人的写进对方档案。
   * 读到的来源记进 viewer_source，事后能查这个数是怎么来的。
   */
  function handleFromPath() {
    var loc = (doc && doc.location) || (win && win.location)
    var p = loc && loc.pathname
    if (!p) return null
    var m = String(p).match(/^\/@([^/]+)/)
    return m ? m[1].toLowerCase() : null
  }
  /**
   * 侧栏从哪儿读。不设 sidebarChannel = 整页（分钟级采集器，一条不漏）；
   * sidebarChannel 为空数组等同未设。
   * 设了 = 只读 Following：侧栏每个区块是一个频道容器，已登录时第一个是 Following、
   * 后面是 Suggested；游客态或关注的人都没在播时只剩 Suggested 一个
   * （2026-10-09 游客态与登录态都实测过）。
   * 所以频道数不足 2 就是「没有 Following 区」，报 null，绝不拿 Suggested 顶替。
   * 候选选择器按顺序试，第一个有匹配的就定案（哪怕只匹配到 1 个频道也直接报 null，
   * 不再试后面的候选）。
   */
  function sidebarRoot() {
    if (!cfg.sidebarChannel || !cfg.sidebarChannel.length) return doc
    for (var k = 0; k < cfg.sidebarChannel.length; k++) {
      var chans = doc.querySelectorAll(cfg.sidebarChannel[k]) || []
      if (chans.length) return chans.length >= 2 ? chans[0] : null
    }
    return null
  }
  /**
   * 顺手把左侧「已关注」侧栏整条抄下来 —— 那是**同一时刻**其它在播直播间的在线人数。
   *
   * 本来是当噪音要丢掉的（它正是 viewer 读错号的根源），但换个角度看：待在 A 房间
   * 的每一分钟，侧栏都白送一份 B/C/D/E 的同期横截面，零额外请求、零额外暴露面。
   * 单个房间的曲线只能说"它涨了"，配上同期别家的数就能说"是它涨了还是大盘涨了"。
   *
   * 只记 handle 与人数原文，不做解析也不做过滤（谁在竞品库里是入库时的事，
   * 这里多记几个非竞品账号的成本是零，漏记了却补不回来）。
   */
  function sidebarReading() {
    if (!doc.querySelectorAll) return null
    var root = sidebarRoot()
    if (!root || !root.querySelectorAll) return null
    var out = []
    for (var a = 0; a < cfg.viewerItem.length && !out.length; a++) {
      var items = root.querySelectorAll(cfg.viewerItem[a]) || []
      for (var i = 0; i < items.length; i++) {
        var nm = null
        for (var b = 0; b < cfg.viewerName.length && !nm; b++) {
          nm = textOf(items[i].querySelector && items[i].querySelector(cfg.viewerName[b])) || null
        }
        var pc = null
        for (var c = 0; c < cfg.viewer.length && !pc; c++) {
          pc = textOf(items[i].querySelector && items[i].querySelector(cfg.viewer[c])) || null
        }
        if (nm) out.push({ handle: nm, viewer: pc })
      }
    }
    return out.length ? out : null
  }
  function viewerReading() {
    // ① 房间自己的面板
    var box = firstEl(cfg.viewerRoomBox).el
    if (box && box.querySelectorAll) {
      var nodes = box.querySelectorAll('div')
      for (var i = 0; i < nodes.length && i < 300; i++) {
        var t = textOf(nodes[i]).replace(/\s+/g, ' ')
        var m = t.match(VIEWER_LABELED)
        if (m) return { text: m[1].replace(/\s+/g, ''), source: 'room' }
      }
    }
    // ② 侧栏按 handle 锚定
    var handle = handleFromPath()
    if (handle && doc.querySelectorAll) {
      for (var a = 0; a < cfg.viewerItem.length; a++) {
        var items = doc.querySelectorAll(cfg.viewerItem[a]) || []
        for (var j = 0; j < items.length; j++) {
          var nm = null
          for (var b = 0; b < cfg.viewerName.length && !nm; b++) {
            nm = textOf(items[j].querySelector && items[j].querySelector(cfg.viewerName[b])) || null
          }
          if (!nm || nm.toLowerCase() !== handle) continue
          for (var c = 0; c < cfg.viewer.length; c++) {
            var pc = textOf(items[j].querySelector && items[j].querySelector(cfg.viewer[c]))
            if (pc) return { text: pc, source: 'anchored' }
          }
          // 对上了号却没读到人数 —— 不能继续往下找别的条目，那就是别人的
          return { text: null, source: null }
        }
      }
    }
    // ③ 全页唯一
    if (doc.querySelectorAll) {
      for (var d = 0; d < cfg.viewer.length; d++) {
        var all = doc.querySelectorAll(cfg.viewer[d]) || []
        if (all.length === 1) {
          var only = textOf(all[0])
          if (only) return { text: only, source: 'sole' }
        }
      }
    }
    return { text: null, source: null }
  }
  function firstEl(cands) {
    for (var i = 0; i < cands.length; i++) {
      var e = doc.querySelector(cands[i])
      if (e) return { sel: cands[i], el: e }
    }
    return { sel: null, el: null }
  }
  var st = { msgs: 0, seen: Object.create(null), nSpeakers: 0, buf: [],
             host: null, hostSel: null, obs: null, speakerSel: null, timer: null }
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
  // 是不是一条真弹幕：节点自己命中、或它内部含一条。没配 message 判据时退回旧行为
  // （全都算），老配置的语义不被这次改动改变。
  function isMessage(node) {
    if (!cfg.message || !cfg.message.length) return true
    if (!node || node.nodeType !== 1) return false
    for (var i = 0; i < cfg.message.length; i++) {
      if (node.matches && node.matches(cfg.message[i])) return true
      if (node.querySelector && node.querySelector(cfg.message[i])) return true
    }
    return false
  }
  function count(node) {
    if (!isMessage(node)) return
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
    var v = viewerReading()
    var side = sidebarReading()
    var f = firstText(cfg.followers)
    var l = firstText(cfg.likes)
    st.buf.push({
      t: win.Date.now(),
      viewer: v.text,
      viewer_source: v.source,
      // 同期其它在播房间的人数（来自左侧「已关注」侧栏），没有就是 null
      co_live: side,
      followers: f.text,
      likes: l.text,
      // 弹幕容器选择器没命中过就报 null，别把 0 当成"房间很安静"——跟下面 speakers 同一个道理
      msgs: st.hostSel ? st.msgs : null,
      // 没有可靠的发言人选择器就报 null，别把 0 当成「没人说话」
      speakers: st.speakerSel ? st.nSpeakers : null,
      observerAlive: alive(),
      selectorsOk: {
        viewer: v.source, followers: f.sel, likes: l.sel,
        chatHost: st.hostSel, speaker: st.speakerSel
      }
    })
    st.msgs = 0
    st.seen = Object.create(null)
    st.nSpeakers = 0
    // speakerSel 每分钟归零重猜：这分钟一条弹幕都没有时，它和真「选择器一直没
    // 命中过」长得一模一样，都是 speakers:null + selectorsOk.speaker:null。
    // 这是预期行为、不是缺陷 —— 靠同一行的 chat_msgs:0 才能分清是"没人说话"
    // 还是"选择器失配"，selectorsOk.speaker 本身不能当成逐分钟的选择器健康信号读。
    st.speakerSel = null
  }
  var ok = attach()
  win.__lw = {
    cfgKey: cfgKey,
    version: cfg.version,
    attached: ok,
    tick: tick,
    // 包一层而不是直接暴露 attach：attach() 只改内部 st，不回写 __lw.attached。
    // 2026-09-16 真机实测 reattach() 返回 true、__lw.attached 却还是 false ——
    // 看门狗和注入方都读这个标志位，于是"已经挂上了"这件事没人知道，
    // observer_alive 一路报 false。挂载成败必须落在同一个地方。
    reattach: function () {
      var ok2 = attach()
      if (win.__lw) win.__lw.attached = ok2
      return ok2
    },
    alive: alive,
    drain: function () { var out = st.buf; st.buf = []; return out },
    disconnect: function () {
      if (st.obs) { st.obs.disconnect(); st.obs = null }
      // 定时器和 observer 是同一族的泄漏：不清掉，旧版本的 tick 会永远往一个
      // 再也没人 drain 的 buf 里 push，直到 tab 关掉。上一轮只修了 observer 那半。
      if (st.timer !== null) { win.clearInterval(st.timer); st.timer = null }
    }
  }
  if (cfg.intervalMs > 0) st.timer = win.setInterval(tick, cfg.intervalMs)
  return { reused: false, attached: ok, version: cfg.version }
}
  var clipFactory = function (win, doc, opts) {
  function pct(s) { var n = parseFloat(s); return isFinite(n) ? n : 50 }
  // 无人值守采集要静音（挂一整场不能出声）；扩展是人正在看的时候点的，不能动播放器。
  // 不传 opts = 原行为（静音），scripts/live-watch 的调用方不受影响。
  var mute = !opts || opts.mute !== false
  var v = doc.querySelector('video')
  if (!v) return { hasVideo: false, ready: false, clip: null }
  if (mute) {
    v.muted = true
    v.volume = 0
  }
  var r = v.getBoundingClientRect()
  var cs = win.getComputedStyle(v)
  var iw = v.videoWidth, ih = v.videoHeight
  if (!iw || !ih) return { hasVideo: true, ready: false, muted: !!v.muted, clip: null }
  // readyState<2 = 有尺寸但还没画出第一帧。这时给出 clip 会诱使调用方拿它去截 ——
  // 截到的是黑帧。未就绪一律不给 clip，让「能不能截」只有 ready 一个判据。
  if (v.readyState < 2) return { hasVideo: true, ready: false, muted: !!v.muted, clip: null }
  var boxRatio = r.width / r.height, imgRatio = iw / ih
  var fit = cs.objectFit || 'contain'
  var w, h
  // fit 只认 cover/fill，其余（含 contain）一律按「按比例撑满盒子」处理。
  // none/scale-down 没实现 —— 它们要用视频原始尺寸而不是按比例适配，
  // 直播播放器几乎不会用这两个值，所以先不为没见过的分支加代码；
  // 把 fit 原样报回去（见下面 return 里的 fit 字段），Task 10 第一次真实
  // 运行核对页面计算出的 object-fit 究竟是什么，能证实这个假设或者推翻它。
  if (fit === 'cover') {
    if (imgRatio > boxRatio) { h = r.height; w = r.height * imgRatio }
    else { w = r.width; h = r.width / imgRatio }
  } else if (fit === 'fill') {
    w = r.width; h = r.height
  } else {
    if (imgRatio > boxRatio) { w = r.width; h = r.width / imgRatio }
    else { h = r.height; w = r.height * imgRatio }
  }
  var p = (cs.objectPosition || '50% 50%').split(' ')
  var fx = pct(p[0]) / 100
  var fy = pct(p[1]) / 100
  // 分别 round 位置和尺寸，误差会在远边叠加，最多把一整列黑边裁进画面
  // （实测：box 600x400、视频 200x569、contain 居中，真实右边缘 370.3，
  // 独立 round 会给出 371）。改成两条边各自 round、尺寸取差值。
  var x0 = Math.round(r.x + (r.width - w) * fx)
  var y0 = Math.round(r.y + (r.height - h) * fy)
  var x1 = Math.round(r.x + (r.width - w) * fx + w)
  var y1 = Math.round(r.y + (r.height - h) * fy + h)
  // fit/pos 原样报回去：这套算式建立在「fit 是 cover/contain/fill 之一、
  // pos 是 getComputedStyle 归一化过的百分比」两个假设上，报回去是为了让
  // 第一次真实运行能证实或推翻它们 —— 而不是继续靠猜。
  return {
    hasVideo: true,
    ready: true,
    muted: !!v.muted,
    fit: fit,
    pos: cs.objectPosition || '50% 50%',
    clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  }
}
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
})(window, document, cfg)
}
