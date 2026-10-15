import assert from 'node:assert/strict'
import test from 'node:test'

import { LANDED_MS, LEAVE_MS, SETTLE_MS, dropAnimationKind, dropOutcomeOf, settleKeyframes, withLeaving } from './dropMotion.ts'

test('dropAnimationKind: 写入了原地淡出，没写入飞回原位，减少动效一律直接消失', () => {
  assert.equal(dropAnimationKind('commit', false), 'settle')
  // 问日期时事项还留在原格，飞回去才看得出「还没动」
  assert.equal(dropAnimationKind('ask', false), 'back')
  assert.equal(dropAnimationKind('cancel', false), 'back')
  assert.equal(dropAnimationKind('commit', true), 'none')
  assert.equal(dropAnimationKind('ask', true), 'none')
  assert.equal(dropAnimationKind('cancel', true), 'none')
})

test('dropOutcomeOf: 写入 = commit，问日期 = ask，原地或没放进任何区 = cancel', () => {
  assert.equal(dropOutcomeOf('patch'), 'commit')
  assert.equal(dropOutcomeOf('askDate'), 'ask')
  assert.equal(dropOutcomeOf('noop'), 'cancel')
  assert.equal(dropOutcomeOf(null), 'cancel')
})

test('时长：落地高亮 900ms、离开 220ms、原地淡出 160ms（与 globals.css 的动画对齐）', () => {
  assert.equal(LANDED_MS, 900)
  assert.equal(LEAVE_MS, 220)
  assert.equal(SETTLE_MS, 160)
})

test('settleKeyframes: 停在放下的位置，只缩 4% 并淡出', () => {
  const frames = settleKeyframes({ x: 120.5, y: -40, scaleX: 1, scaleY: 1 })
  assert.deepEqual(frames, [
    { transform: 'translate3d(120.5px, -40px, 0) scaleX(1) scaleY(1)', opacity: 1 },
    { transform: 'translate3d(120.5px, -40px, 0) scaleX(0.96) scaleY(0.96)', opacity: 0 },
  ])
  // 已有缩放时按比例再缩，位置不变
  const scaled = settleKeyframes({ x: 0, y: 0, scaleX: 0.5, scaleY: 2 })
  assert.equal(scaled[1].transform, 'translate3d(0px, 0px, 0) scaleX(0.48) scaleY(1.92)')
})

const a = { id: 'a' }
const b = { id: 'b' }
const c = { id: 'c' }
const gone = { id: 'x' }

test('withLeaving: 被拖走的卡片插回原位置并标 leaving，其余不动', () => {
  assert.deepEqual(withLeaving([a, b, c], null), [
    { row: a, leaving: false }, { row: b, leaving: false }, { row: c, leaving: false },
  ])
  assert.deepEqual(withLeaving([a, b, c], { row: gone, index: 1 }), [
    { row: a, leaving: false }, { row: gone, leaving: true }, { row: b, leaving: false }, { row: c, leaving: false },
  ])
  // 原来是第一张 / 最后一张
  assert.equal(withLeaving([a, b], { row: gone, index: 0 })[0].row, gone)
  assert.equal(withLeaving([a, b], { row: gone, index: 2 })[2].row, gone)
})

test('withLeaving: 越界下标夹到两端；列表里已有它（撤销后回来了）就不再插', () => {
  assert.equal(withLeaving([a, b], { row: gone, index: 9 })[2].row, gone)
  assert.equal(withLeaving([a, b], { row: gone, index: -3 })[0].row, gone)
  // findIndex 没找到（-1）：放最前，而不是被 splice 当成「倒数第一个之前」
  assert.equal(withLeaving([a, b, c], { row: gone, index: -1 })[0].row, gone)
  assert.deepEqual(withLeaving([], { row: gone, index: 0 }), [{ row: gone, leaving: true }])
  const back = withLeaving([a, gone, b], { row: gone, index: 0 })
  assert.equal(back.length, 3)
  assert.equal(back.every((x) => !x.leaving), true)
})
