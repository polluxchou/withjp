// 页面内部用 useState 切换"列表/编辑"等子视图时，URL 不会变化——用户点击侧边栏
// 里当前已激活的那一项，Next.js Link 对同一路径是空操作，不会重新挂载页面组件，
// 子视图状态也就不会被重置。Sidebar 在这种点击时广播这个事件，页面自行监听并把
// 子视图状态收回默认值。
export const NAV_RESET_EVENT = 'nav:reset'

type NavResetEventTarget = Pick<Window, 'dispatchEvent'> | Pick<EventTarget, 'dispatchEvent'>

export function notifyNavReset(target?: NavResetEventTarget): boolean {
  const eventTarget = target ?? (typeof window === 'undefined' ? undefined : window)
  if (!eventTarget) return false

  eventTarget.dispatchEvent(new Event(NAV_RESET_EVENT))
  return true
}
