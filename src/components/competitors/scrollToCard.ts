// src/components/competitors/scrollToCard.ts
// 把某张竞品卡滚到吸顶块（导航条 + 日期轴）下方。导航条点芯片、从竞品公司页带
// #competitor-<id> 跳进来，两条入口共用这一个落点算法（见 navScroll.anchoredScrollTop）。
import { competitorAnchorId } from '@/lib/competitors/anchors'
import { anchoredScrollTop } from '@/lib/competitors/navScroll'

/** 找到卡片就滚过去并返回 true；卡片不在页面上返回 false。 */
export function scrollToCompetitorCard(id: string, smooth = true): boolean {
  const el = document.getElementById(competitorAnchorId(id))
  if (!el) return false
  const head = document.querySelector('[data-sticky-head]')
  const top = anchoredScrollTop({
    cardTop: el.getBoundingClientRect().top,
    scrollY: window.scrollY,
    headHeight: head?.getBoundingClientRect().height ?? 0,
  })
  if (!smooth) {
    window.scrollTo({ top })
    return true
  }
  // behavior:'smooth' 不是所有引擎都真的执行——实测有环境下它是彻底的空操作
  // （同一个元素换成 'auto' 立刻就位）。发起平滑滚动后下一拍看位置有没有动，没动就直接跳。
  const before = window.scrollY
  window.scrollTo({ top, behavior: 'smooth' })
  setTimeout(() => {
    if (window.scrollY === before) window.scrollTo({ top })
  }, 60)
  return true
}
