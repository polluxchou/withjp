/**
 * 视口滚动锁。弹窗/灯箱打开期间用它挡住底层页面滚动。
 *
 * ── 锁哪个元素 ────────────────────────────────────────────────────────────
 * 锁 documentElement（<html>），不锁 body。
 *
 * 锁 body 那种写法也是有效的，原因值得写下来，否则下一个人会照着错误的直觉改：
 * 按 CSS Overflow 的「overflow 向视口传播」规则，根元素的 overflow 作用于视口；
 * 但当 <html> 的 overflow 在**两个轴上都是 visible** 时，UA 改用第一个 <body>
 * 子元素的 overflow 作用于视口。本仓 <html> 上没有任何 overflow 规则，所以
 * `body { overflow: hidden }` 这个二十年的老写法确实锁得住（Sidebar 的移动端抽屉
 * 迁到本函数之前一直靠它，用真实滚轮实测过有效）。
 *
 * 选 documentElement 是因为它无条件成立：body 那条路依赖「html 两轴都 visible」
 * 这个前提，哪天有人为了兜住横向溢出加一句 `html { overflow-x: hidden }`，
 * 传播规则立刻失效、body 锁静默失灵，而症状（抽屉能开、页面照样能滚）不会有
 * 任何测试红给你看。全仓现已没有依赖那个前提的调用方，新增滚动锁请一律走本函数。
 *
 * ── 怎么验证锁生效（踩过的坑）────────────────────────────────────────────
 * 1. 别用 window.scrollTo / scrollTop 赋值来验证：程序化滚动本来就绕过
 *    overflow: hidden，锁得再好也会「滚」，读成锁失效。要用真实滚轮事件。
 * 2. 别靠计算样式判断锁落在谁身上：传播是视口的 used value，不体现在
 *    getComputedStyle(<html>) 上 —— 锁 body 时 html 的 overflowY 照旧读到
 *    visible。同理 document.scrollingElement 在标准模式下恒等于 <html>，
 *    它由 quirks mode 决定，说明不了哪个元素的 overflow 管着视口。
 *
 * ── padding-right ────────────────────────────────────────────────────────
 * 上锁会让实体滚动条消失，不补偿的话页面内容会横向跳一下（本机实测槽宽 15px）。
 * macOS 触摸设备是覆盖式滚动条、槽宽为 0，此时不补。
 * 注意补偿只作用于文档流内容：`position: fixed` 的元素以视口为基准，
 * 滚动条消失时仍会跟着视口变宽而右移，这是所有 overflow 锁的共同代价，已接受。
 *
 * ── 为什么要引用计数 ────────────────────────────────────────────────────
 * 多个持有者可能同时锁同一个元素（移动端抽屉开着时再打开个人信息弹窗——
 * ProfileEditor 就渲染在 Sidebar 里），而它们的**释放顺序不保证嵌套**：
 * 路由一变 Sidebar 会自动关抽屉，此时弹窗还开着，于是外层先释放。
 *
 * 若每个持有者各自存/取自己看到的旧值，这个顺序会把页面锁死：抽屉先释放、
 * 恢复成空（页面解锁），弹窗再释放时把它当初捕获到的 'hidden' 写回去，
 * 页面从此再也滚不动，而且没有任何人还持有锁能解开它。
 *
 * 所以按元素记引用计数：第一个持有者捕获原值并上锁，最后一个释放的才恢复，
 * 中间的进出只动计数。这样释放顺序不影响结果。
 *
 * 上锁对象声明成最小结构而不是 HTMLElement：本仓测试是 node --test 跑纯逻辑、
 * 没有 jsdom，喂一个假对象就能测完存/取/嵌套/乱序的全部行为。
 */
export interface ScrollLockTarget {
  style: { overflow: string; paddingRight: string }
  clientWidth: number
}

interface ActiveLock {
  holders: number
  prevOverflow: string
  prevPaddingRight: string
}

// 用 WeakMap 而不是 Map：万一某个持有者没调用解锁函数就被卸载，也不会把元素
// 连同这条记录一起钉在内存里。
const active = new WeakMap<ScrollLockTarget, ActiveLock>()

/**
 * 锁住视口滚动，返回解锁函数。
 *
 * 同一元素允许多个持有者：第一个上锁时捕获原有内联值，最后一个释放时读回它们
 * （而不是写死成空串，否则会盖掉样式表里的值）。释放顺序不影响结果。
 * 重复调用同一个解锁函数是幂等的。
 */
export function lockViewportScroll(
  target: ScrollLockTarget = document.documentElement,
  viewportWidth: number = window.innerWidth,
): () => void {
  const existing = active.get(target)
  if (existing) {
    existing.holders += 1
  } else {
    // 先量再锁：上锁后滚动条就没了，槽宽会变成 0。所以只有第一个持有者量得准，
    // 也只有它需要补 —— 后面进来的量到 0，本来就不该再补一次。
    const gutter = viewportWidth - target.clientWidth
    active.set(target, {
      holders: 1,
      prevOverflow: target.style.overflow,
      prevPaddingRight: target.style.paddingRight,
    })
    target.style.overflow = 'hidden'
    if (gutter > 0) target.style.paddingRight = `${gutter}px`
  }

  let released = false
  return () => {
    if (released) return
    released = true
    const entry = active.get(target)
    if (!entry) return
    entry.holders -= 1
    if (entry.holders > 0) return
    active.delete(target)
    target.style.overflow = entry.prevOverflow
    target.style.paddingRight = entry.prevPaddingRight
  }
}
