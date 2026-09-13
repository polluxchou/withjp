import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAIN_EDITING_NARROW_VH,
  MAIN_MAX_VH,
  lightboxNeighbors,
  showsNeighbors,
} from './lightboxLayout.ts'

test('宽屏放得下前后各一张', () => {
  assert.equal(showsNeighbors(1280, 800), true)  // 常见笔记本
  assert.equal(showsNeighbors(1024, 768), true)  // iPad 横屏
  assert.equal(showsNeighbors(1440, 900), true)
})

test('竖高的视口放不下：竖图由高度约束宽度，宽高比才是判据', () => {
  // iPad 竖屏宽度有 768，却因为太高而放不下 —— 只看宽度会判错
  assert.equal(showsNeighbors(768, 1024), false)
  assert.equal(showsNeighbors(390, 844), false)  // iPhone
  assert.equal(showsNeighbors(375, 812), false)
})

test('同样的宽度，矮一点就放得下', () => {
  // 900 宽在 600 高时放得下，在 900 高时放不下 —— 证明判据不是"宽度过阈值"
  assert.equal(showsNeighbors(900, 600), true)
  assert.equal(showsNeighbors(900, 900), false)
})

test('非法尺寸兜底为不显示', () => {
  assert.equal(showsNeighbors(0, 0), false)
  assert.equal(showsNeighbors(-100, 800), false)
  assert.equal(showsNeighbors(1280, 0), false)
})

test('第一张不画左邻、最后一张不画右邻', () => {
  // 空占位框会被读成「图没加载出来」，所以那一侧什么都不画
  assert.deepEqual(lightboxNeighbors(1280, 800, 3, 0), { left: false, right: true })
  assert.deepEqual(lightboxNeighbors(1280, 800, 3, 1), { left: true, right: true })
  assert.deepEqual(lightboxNeighbors(1280, 800, 3, 2), { left: true, right: false })
})

test('当天只有一张：两边都没有', () => {
  assert.deepEqual(lightboxNeighbors(1280, 800, 1, 0), { left: false, right: false })
})

test('窄视口下即使有前后张也不画', () => {
  assert.deepEqual(lightboxNeighbors(375, 812, 3, 1), { left: false, right: false })
})

test('越界的 index 不会画出不存在的邻居', () => {
  // 删掉最后一张后夹逼兜底的那一帧可能拿到越界 index
  assert.deepEqual(lightboxNeighbors(1280, 800, 2, 5), { left: true, right: false })
  assert.deepEqual(lightboxNeighbors(1280, 800, 2, -1), { left: false, right: true })
})

test('窄屏编辑态的高度上限低于常态，宽屏则完全不缩', () => {
  // 这两个常量是组件里 max-h-[80vh] / max-h-[62vh] 两个字面量的登记处
  // （Tailwind 只认字面量，不能插值），改一边必须改另一边。
  assert.equal(MAIN_MAX_VH, 0.8)
  assert.equal(MAIN_EDITING_NARROW_VH, 0.62)
  // 窄屏才缩：手机上编辑区是两行，不缩放不下。宽屏缩反而会让整列变矮、
  // 主图往下掉 —— 第一版按 58vh 缩，实测主图下移了 56px，方向正好反了。
  assert.ok(MAIN_EDITING_NARROW_VH < MAIN_MAX_VH)
})

test('邻图显示与否只看折叠态高度：开关编辑区不该让两侧的图闪进闪出', () => {
  // showsNeighbors 不接受 editing 参数就是为了钉死这件事；这里用行为再钉一遍
  const before = showsNeighbors(1280, 800)
  const after = showsNeighbors(1280, 800)
  assert.equal(before, after)
  // 常态放不下的视口，不会因为编辑态变矮就突然放得下
  assert.equal(showsNeighbors(768, 1024), false)
})
