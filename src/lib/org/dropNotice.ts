// src/lib/org/dropNotice.ts — 拖放提示条（spec 4.2）的计时与撤销快捷键。
//
// 提示条 5 秒后自动收起；鼠标悬停、焦点在条内、或又开始拖动时暂停，离开后按剩余时间继续（WCAG 2.2.1）。
// 计时写成纯数据 + 纯函数，组件只负责在「暂停 / 继续」切换时调用它们并重设定时器。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。

export const NOTICE_MS = 5000

/** 暂停后继续时至少再显示这么久：拖动取消后提示条重新出现，不能只闪一下就没了。 */
export const RESUME_MIN_MS = 1500

/** left = 还剩多少毫秒；since = 本轮开始走的时刻，null 表示暂停中。 */
export interface NoticeClock {
  left: number
  since: number | null
}

/** 新提示条的计时：满 5 秒、尚未开始走（挂载后由组件 resume）。 */
export const NEW_NOTICE_CLOCK: NoticeClock = { left: NOTICE_MS, since: null }

/** 到 now 为止还剩多少毫秒。 */
export function clockLeft(clock: NoticeClock, now: number): number {
  return clock.since === null ? clock.left : Math.max(0, clock.left - (now - clock.since))
}

/** 暂停：把已走掉的时间扣掉并停表。已暂停的原样返回。 */
export function pauseClock(clock: NoticeClock, now: number): NoticeClock {
  return clock.since === null ? clock : { left: clockLeft(clock, now), since: null }
}

/** 继续：从 now 开始走，剩余时间不少于 RESUME_MIN_MS。正在走的原样返回（不重置）。 */
export function resumeClock(clock: NoticeClock, now: number): NoticeClock {
  return clock.since === null ? { left: Math.max(clock.left, RESUME_MIN_MS), since: now } : clock
}

/**
 * 撤销快捷键：Ctrl+Z 或 ⌘Z（两种平台都认，Windows 上 Win+Z 被系统占用、不会传到页面）。
 * 带 Shift / Alt 的是「重做」等别的组合，不算；输入法组字中不算。
 */
export function isUndoShortcut(e: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !e.isComposing && e.key.toLowerCase() === 'z'
}

/** 焦点在可编辑控件里时，Ctrl+Z 是撤销输入，不能拿来撤销拖放。 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as { tagName?: unknown; isContentEditable?: unknown }
  if (el.isContentEditable === true) return true
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

/** 提示条上显示哪种按键写法：苹果设备 ⌘Z，其余 Ctrl+Z。platform 取 navigator.userAgentData.platform 或 navigator.platform。 */
export function undoShortcutLabel(platform: string): string {
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘Z' : 'Ctrl+Z'
}
