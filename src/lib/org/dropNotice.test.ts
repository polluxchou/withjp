import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NEW_NOTICE_CLOCK, NOTICE_MS, RESUME_MIN_MS, clockLeft, isEditableTarget, isUndoShortcut, pauseClock, resumeClock,
  undoShortcutLabel,
} from './dropNotice.ts'

test('计时：新提示条满 5 秒、尚未开始走', () => {
  assert.equal(NOTICE_MS, 5000)
  assert.deepEqual(NEW_NOTICE_CLOCK, { left: 5000, since: null })
  assert.equal(clockLeft(NEW_NOTICE_CLOCK, 99_999), 5000)
})

test('计时：走 2 秒后暂停，停住的这段不扣时间，继续后从剩余 3 秒接着走', () => {
  const running = resumeClock(NEW_NOTICE_CLOCK, 1000)
  assert.deepEqual(running, { left: 5000, since: 1000 })
  assert.equal(clockLeft(running, 3000), 3000)

  const paused = pauseClock(running, 3000)
  assert.deepEqual(paused, { left: 3000, since: null })
  // 悬停了 10 秒：剩余不变
  assert.equal(clockLeft(paused, 13_000), 3000)

  const resumed = resumeClock(paused, 13_000)
  assert.deepEqual(resumed, { left: 3000, since: 13_000 })
  assert.equal(clockLeft(resumed, 14_000), 2000)
  // 走过头不出现负数
  assert.equal(clockLeft(resumed, 99_000), 0)
})

test('计时：只剩一点时暂停再继续，至少再显示 RESUME_MIN_MS（拖动取消后不闪一下就没）', () => {
  assert.equal(RESUME_MIN_MS, 1500)
  const nearlyGone = pauseClock(resumeClock(NEW_NOTICE_CLOCK, 0), 4800)
  assert.equal(nearlyGone.left, 200)
  assert.deepEqual(resumeClock(nearlyGone, 6000), { left: 1500, since: 6000 })
  // 剩余本来就多于下限：按剩余走，不抬高也不重置成 5 秒
  const plenty = pauseClock(resumeClock(NEW_NOTICE_CLOCK, 0), 1000)
  assert.deepEqual(resumeClock(plenty, 2000), { left: 4000, since: 2000 })
})

test('计时：重复暂停 / 重复继续是幂等的（悬停与聚焦同时成立时不会扣两次、不会重置）', () => {
  const running = resumeClock(NEW_NOTICE_CLOCK, 0)
  assert.equal(resumeClock(running, 4000), running)
  const paused = pauseClock(running, 1000)
  assert.equal(pauseClock(paused, 3000), paused)
})

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean }> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

test('isUndoShortcut: Ctrl+Z 与 ⌘Z 算撤销；单按 Z、带 Shift/Alt、组字中都不算', () => {
  assert.equal(isUndoShortcut(key('z', { ctrlKey: true })), true)
  assert.equal(isUndoShortcut(key('z', { metaKey: true })), true)
  // Caps Lock 开着
  assert.equal(isUndoShortcut(key('Z', { ctrlKey: true })), true)
  assert.equal(isUndoShortcut(key('z')), false)
  assert.equal(isUndoShortcut(key('z', { metaKey: true, shiftKey: true })), false)
  assert.equal(isUndoShortcut(key('z', { ctrlKey: true, altKey: true })), false)
  assert.equal(isUndoShortcut(key('z', { ctrlKey: true, isComposing: true })), false)
  assert.equal(isUndoShortcut(key('y', { ctrlKey: true })), false)
})

test('isEditableTarget: 输入框、文本域、下拉、contenteditable 里不接管 Ctrl+Z', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT' }), true)
  assert.equal(isEditableTarget({ tagName: 'TEXTAREA' }), true)
  assert.equal(isEditableTarget({ tagName: 'SELECT' }), true)
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(isEditableTarget({ tagName: 'BUTTON', isContentEditable: false }), false)
  assert.equal(isEditableTarget({ tagName: 'BODY' }), false)
  assert.equal(isEditableTarget(null), false)
})

test('undoShortcutLabel: 苹果设备显示 ⌘Z，其余显示 Ctrl+Z', () => {
  assert.equal(undoShortcutLabel('MacIntel'), '⌘Z')
  assert.equal(undoShortcutLabel('macOS'), '⌘Z')
  assert.equal(undoShortcutLabel('iPad'), '⌘Z')
  assert.equal(undoShortcutLabel('Win32'), 'Ctrl+Z')
  assert.equal(undoShortcutLabel('Windows'), 'Ctrl+Z')
  assert.equal(undoShortcutLabel('Linux x86_64'), 'Ctrl+Z')
  assert.equal(undoShortcutLabel(''), 'Ctrl+Z')
})
