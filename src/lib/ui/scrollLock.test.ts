import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { lockViewportScroll, type ScrollLockTarget } from './scrollLock.ts'

function fakeTarget(init: Partial<{ overflow: string; paddingRight: string; clientWidth: number }> = {}) {
  return {
    style: { overflow: init.overflow ?? '', paddingRight: init.paddingRight ?? '' },
    clientWidth: init.clientWidth ?? 1000,
  } satisfies ScrollLockTarget
}

test('上锁把 overflow 设成 hidden', () => {
  const el = fakeTarget()
  lockViewportScroll(el, 1000)
  assert.equal(el.style.overflow, 'hidden')
})

test('补上等于滚动条宽度的 padding-right', () => {
  const el = fakeTarget({ clientWidth: 1265 })
  lockViewportScroll(el, 1280)
  assert.equal(el.style.paddingRight, '15px')
})

test('覆盖式滚动条（槽宽 0）不加 padding', () => {
  const el = fakeTarget({ clientWidth: 375 })
  lockViewportScroll(el, 375)
  assert.equal(el.style.paddingRight, '')
})

test('槽宽算成负数时也不加 padding', () => {
  const el = fakeTarget({ clientWidth: 1300 })
  lockViewportScroll(el, 1280)
  assert.equal(el.style.paddingRight, '')
})

test('解锁读回原有内联值，而不是写死成空串', () => {
  const el = fakeTarget({ overflow: 'auto', paddingRight: '4px', clientWidth: 1265 })
  const release = lockViewportScroll(el, 1280)
  assert.equal(el.style.overflow, 'hidden')
  assert.equal(el.style.paddingRight, '15px')
  release()
  assert.equal(el.style.overflow, 'auto')
  assert.equal(el.style.paddingRight, '4px')
})

test('原本没有内联值时，解锁恢复成空串（交还样式表的值）', () => {
  const el = fakeTarget({ clientWidth: 1265 })
  const release = lockViewportScroll(el, 1280)
  release()
  assert.equal(el.style.overflow, '')
  assert.equal(el.style.paddingRight, '')
})

test('嵌套上锁：里层不吃掉外层补的 padding，逐层解锁回到原点', () => {
  const el = fakeTarget({ clientWidth: 1265 })
  const releaseOuter = lockViewportScroll(el, 1280)
  assert.equal(el.style.paddingRight, '15px')
  // 外层已经锁住，滚动条早就没了 —— 里层此刻量到的槽宽是 0
  el.clientWidth = 1280
  const releaseInner = lockViewportScroll(el, 1280)
  assert.equal(el.style.overflow, 'hidden')
  assert.equal(el.style.paddingRight, '15px', '里层不该把外层补的 padding 清掉')
  releaseInner()
  assert.equal(el.style.overflow, 'hidden', '外层还锁着')
  assert.equal(el.style.paddingRight, '15px')
  releaseOuter()
  assert.equal(el.style.overflow, '')
  assert.equal(el.style.paddingRight, '')
})

test('重复解锁是幂等的，不会二次写坏样式', () => {
  const el = fakeTarget({ overflow: 'auto', clientWidth: 1265 })
  const release = lockViewportScroll(el, 1280)
  release()
  el.style.overflow = 'scroll'
  release()
  assert.equal(el.style.overflow, 'scroll', '第二次调用不该再写一遍旧值')
})

test('乱序释放（外层先放）不会把页面永久锁死', () => {
  const el = fakeTarget({ clientWidth: 1265 })
  const releaseDrawer = lockViewportScroll(el, 1280)
  el.clientWidth = 1280 // 已经锁上了，滚动条没了，后来者量到的槽宽是 0
  const releaseModal = lockViewportScroll(el, 1280)

  // 真实场景：路由一变 Sidebar 自动关抽屉，此时 ProfileEditor 弹窗还开着
  releaseDrawer()
  assert.equal(el.style.overflow, 'hidden', '弹窗还持有锁，页面必须仍然锁着')
  assert.equal(el.style.paddingRight, '15px')

  releaseModal()
  assert.equal(el.style.overflow, '', '最后一个释放后必须真正解锁')
  assert.equal(el.style.paddingRight, '', '补的 padding 也要撤掉')
})

test('恢复的是第一个持有者上锁前的值', () => {
  const el = fakeTarget({ overflow: 'auto', paddingRight: '4px', clientWidth: 1265 })
  const releaseA = lockViewportScroll(el, 1280)
  const releaseB = lockViewportScroll(el, 1280)
  releaseB()
  releaseA()
  assert.equal(el.style.overflow, 'auto')
  assert.equal(el.style.paddingRight, '4px')
})

test('不同元素各自计数，互不干扰', () => {
  const a = fakeTarget({ clientWidth: 1265 })
  const b = fakeTarget({ clientWidth: 375 })
  const releaseA = lockViewportScroll(a, 1280)
  const releaseB = lockViewportScroll(b, 375)
  releaseA()
  assert.equal(a.style.overflow, '', 'a 的唯一持有者已释放')
  assert.equal(b.style.overflow, 'hidden', 'b 不该被 a 的释放牵连')
  releaseB()
  assert.equal(b.style.overflow, '')
})

test('全部释放后再上锁，重新捕获当时的原值', () => {
  const el = fakeTarget({ clientWidth: 1265 })
  lockViewportScroll(el, 1280)()
  el.style.overflow = 'scroll'
  const release = lockViewportScroll(el, 1280)
  assert.equal(el.style.overflow, 'hidden')
  release()
  assert.equal(el.style.overflow, 'scroll', '第二轮该恢复成第二轮开始前的值')
})
