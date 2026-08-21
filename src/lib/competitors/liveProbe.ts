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
    // person-count 有歧义：sweep-live.mjs 的 extractLiveMeta 记录过，登录态下
    // 这个 data-e2e 在左侧"已关注"侧栏里每个正在直播的关注对象各出现一份，
    // 不是页面唯一节点 —— 该脚本因此没有直接选它，而是正则匹配相邻的
    // live-side-nav-name 把 handle 对上号才取数。这里用的是裸 querySelector，
    // 命中的是 DOM 顺序里第一个，同时有两个关注对象在播时可能拿到别人的人数，
    // 而 selectorsOk.viewer 照样显示命中、看不出问题。
    // 第一次真实运行必须用肉眼核对页面上显示的在线人数与探针读到的是否一致，
    // 不能只看 selectorsOk.viewer 非空就当验证通过。
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
    // 未经验证的猜测：如果弹幕列表是在容器下再深一层重渲染，而不是直接
    // 往这层 append 子节点，childList 观察不到、msgs 会整场停在 0 —— 现象上
    // 和"房间很安静没人发弹幕"完全一样，得留意第一次真实运行的 msgs 是否合理。
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
    // speakerSel 每分钟归零重猜：这分钟一条弹幕都没有时，它和真「选择器一直没
    // 命中过」长得一模一样，都是 speakers:null + selectorsOk.speaker:null。
    // 这是预期行为、不是缺陷 —— 靠同一行的 chat_msgs:0 才能分清是"没人说话"
    // 还是"选择器失配"，selectorsOk.speaker 本身不能当成逐分钟的选择器健康信号读。
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
    disconnect: function () {
      if (st.obs) { st.obs.disconnect(); st.obs = null }
      // 定时器和 observer 是同一族的泄漏：不清掉，旧版本的 tick 会永远往一个
      // 再也没人 drain 的 buf 里 push，直到 tab 关掉。上一轮只修了 observer 那半。
      if (st.timer !== null) { win.clearInterval(st.timer); st.timer = null }
    }
  }
  if (cfg.intervalMs > 0) st.timer = win.setInterval(tick, cfg.intervalMs)
  return { reused: false, attached: ok, version: cfg.version }
}`

/** 拼出注入用的完整表达式。 */
export function probeSource(cfg: ProbeConfig): string {
  // intervalMs<=0 是测试专用（外部手动 tick）。真注进页面就是一个「挂载成功、
  // observerAlive 为真、却永远不自动打点」的探针 —— drain 永远空，看门狗两轮之后
  // 误判下播。静默失败比直接炸难查得多，所以在注入前就拦住。
  if (!(cfg.intervalMs > 0)) {
    throw new Error(`probeSource: intervalMs 必须为正数（收到 ${cfg.intervalMs}）—— 0 只用于测试里手动 tick`)
  }
  return `(${PROBE_FACTORY_SRC})(window, document, ${JSON.stringify(cfg)})`
}

export type Rect = { x: number; y: number; width: number; height: number }

/** object-position 的一个分量，解析不出来退回 50（CSS 默认居中）。 */
function pct(s: string | undefined): number {
  const n = parseFloat(s ?? '')
  return Number.isFinite(n) ? n : 50
}

/**
 * 由 <video> 的盒子矩形 + 视频原始尺寸 + object-fit/object-position，
 * 算出画面在页面坐标系里的真实矩形。截图 clip 用它，避免把播放器的黑边也截进去。
 * 抽成纯函数是为了能测 —— 页面里那份（CLIP_FACTORY_SRC）走同样的算式。
 * 契约：objectPosition 要传 getComputedStyle 读出来的形式 —— 一对百分比/长度，
 * 不是 `top` 这种 CSS 关键字。页内调用方就是这么传的；关键字不在支持范围内。
 */
export function clipRect(
  box: Rect,
  videoWidth: number,
  videoHeight: number,
  objectFit: string,
  objectPosition: string,
): Rect {
  const boxRatio = box.width / box.height
  const imgRatio = videoWidth / videoHeight
  let w: number
  let h: number
  if (objectFit === 'cover') {
    if (imgRatio > boxRatio) { h = box.height; w = box.height * imgRatio }
    else { w = box.width; h = box.width / imgRatio }
  } else if (objectFit === 'fill') {
    w = box.width; h = box.height
  } else {
    if (imgRatio > boxRatio) { w = box.width; h = box.width / imgRatio }
    else { h = box.height; w = box.height * imgRatio }
  }
  // 解析不出来才退回 50%（CSS 默认居中）。不能写 `parseFloat(x) || 50` ——
  // 那会把显式的 0%（画面靠上/靠左）当成假值改判成居中。
  const p = objectPosition.split(' ')
  const fx = pct(p[0]) / 100
  const fy = pct(p[1]) / 100
  return {
    x: Math.round(box.x + (box.width - w) * fx),
    y: Math.round(box.y + (box.height - h) * fy),
    width: Math.round(w),
    height: Math.round(h),
  }
}

/**
 * 页面里执行的版本：顺手把播放器静音（挂一整场不能出声），
 * 并回报 video 是否就绪。videoWidth>0 且 readyState>=2 才算能截。
 * 算式与 clipRect 保持一致 —— 改一处必须改两处。
 */
export const CLIP_FACTORY_SRC = `function (win, doc) {
  function pct(s) { var n = parseFloat(s); return isFinite(n) ? n : 50 }
  var v = doc.querySelector('video')
  if (!v) return { hasVideo: false, ready: false, clip: null }
  v.muted = true
  v.volume = 0
  var r = v.getBoundingClientRect()
  var cs = win.getComputedStyle(v)
  var iw = v.videoWidth, ih = v.videoHeight
  if (!iw || !ih) return { hasVideo: true, ready: false, clip: null }
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
  return {
    hasVideo: true,
    ready: true,
    muted: !!v.muted,
    fit: fit,
    clip: {
      x: Math.round(r.x + (r.width - w) * fx),
      y: Math.round(r.y + (r.height - h) * fy),
      width: Math.round(w),
      height: Math.round(h)
    }
  }
}`

/** 拼出注入用的完整表达式。 */
export function clipSource(): string {
  return `(${CLIP_FACTORY_SRC})(window, document)`
}
