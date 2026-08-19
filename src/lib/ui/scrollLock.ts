/**
 * 视口滚动锁。弹窗/灯箱打开期间用它挡住底层页面滚动。
 *
 * ── 锁哪个元素 ────────────────────────────────────────────────────────────
 * 锁 documentElement（<html>），不锁 body。
 *
 * 这两种写法今天都有效，原因值得写下来，否则下一个人会照着错误的直觉改：
 * 按 CSS Overflow 的「overflow 向视口传播」规则，根元素的 overflow 作用于视口；
 * 但当 <html> 的 overflow 在**两个轴上都是 visible** 时，UA 改用第一个 <body>
 * 子元素的 overflow 作用于视口。本仓 <html> 上没有任何 overflow 规则，所以
 * `body { overflow: hidden }` 这个二十年的老写法确实锁得住 —— Sidebar 的移动端
 * 抽屉一直用它，实测（真实滚轮）确认有效。
 *
 * 选 documentElement 是因为它无条件成立：body 那条路依赖「html 两轴都 visible」
 * 这个前提，哪天有人为了兜住横向溢出加一句 `html { overflow-x: hidden }`，
 * 传播规则立刻失效、body 锁静默失灵，而没有任何测试会红。
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
 * 上锁对象声明成最小结构而不是 HTMLElement：本仓测试是 node --test 跑纯逻辑、
 * 没有 jsdom，喂一个假对象就能测完存/取/嵌套的全部行为。
 */
export interface ScrollLockTarget {
  style: { overflow: string; paddingRight: string }
  clientWidth: number
}

/**
 * 锁住视口滚动，返回解锁函数。
 *
 * 解锁读回上锁前的内联值，而不是写死成空串：嵌套弹窗时里层若清空，
 * 外层的锁会被里层的关闭顺手解掉。重复调用解锁函数是幂等的。
 */
export function lockViewportScroll(
  target: ScrollLockTarget = document.documentElement,
  viewportWidth: number = window.innerWidth,
): () => void {
  // 先量再锁：上锁后滚动条就没了，槽宽会变成 0。
  // 嵌套场景里层量到 0 是对的 —— 外层已经补过了，不该再补一次。
  const gutter = viewportWidth - target.clientWidth
  const prevOverflow = target.style.overflow
  const prevPaddingRight = target.style.paddingRight

  target.style.overflow = 'hidden'
  if (gutter > 0) target.style.paddingRight = `${gutter}px`

  let released = false
  return () => {
    if (released) return
    released = true
    target.style.overflow = prevOverflow
    target.style.paddingRight = prevPaddingRight
  }
}
