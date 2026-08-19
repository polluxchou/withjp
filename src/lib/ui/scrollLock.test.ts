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

// ── 防线：守住 Sidebar 移动端抽屉那把 body 锁赖以生效的前提 ──────────────
// Sidebar 锁的是 body（见 components/layout/Sidebar.tsx）。它今天有效，靠的是
// 「<html> 的 overflow 两轴都是 visible」→ overflow 向视口传播时改用 body 的值。
// 谁哪天为了兜住横向溢出加一句 `html { overflow-x: hidden }`，传播规则立刻失效、
// 那把锁静默失灵：抽屉照样能开、底层页面照样能滚，没有任何测试会红。
// 这条测试就是那声警报。:root 一并盯着 —— 它选中的也是 <html>。
test('globals.css 不给 html / :root 设 overflow（Sidebar 的 body 锁依赖这个前提）', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '') // 先去注释，免得注释里提到 overflow 造成误报

  const offenders: string[] = []
  for (const [, selector, decls] of Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))) {
    const hitsRoot = /(^|[\s,>+~])(html|:root)\b/.test(selector)
    const setsOverflow = /(^|[\s;])overflow(-x|-y)?\s*:/.test(decls)
    if (hitsRoot && setsOverflow) offenders.push(`${selector.trim()} { ${decls.trim()} }`)
  }

  assert.deepEqual(
    offenders,
    [],
    '给 html/:root 设了 overflow 会让 Sidebar 的 body 滚动锁静默失灵；' +
      '要么撤掉这条 CSS，要么把 Sidebar 改成用 lockViewportScroll()（锁 documentElement，无条件成立）',
  )
})
