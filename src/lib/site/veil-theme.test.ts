import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(
  new URL('../../app/globals.css', import.meta.url),
  'utf8',
)

function cssBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `Missing CSS block: ${selector}`)

  const end = css.indexOf('\n  }', start)
  assert.notEqual(end, -1, `Unclosed CSS block: ${selector}`)
  return css.slice(start, end)
}

test('triangular veil text stays black in dark and light themes', () => {
  const root = cssBlock(':root')
  const light = cssBlock(":root[data-theme='light']")

  assert.match(root, /--site-on-accent:\s*#000000;/) // style-tokens-ignore: token value under test
  assert.doesNotMatch(
    light,
    /--site-on-accent:/,
    'Light theme must inherit the black veil foreground from :root.',
  )
})

test('triangular veil background stays the brand cyan in both themes', () => {
  const root = cssBlock(':root')
  const light = cssBlock(":root[data-theme='light']")

  assert.match(root, /--site-veil:\s*#25f4ee;/) // style-tokens-ignore: token value under test
  assert.doesNotMatch(
    light,
    /--site-veil:/,
    'Light theme must inherit the cyan veil background from :root — the deep-teal accent drops the black veil text to 3.6:1.',
  )
})

// 幕布底色曾经写成 bg-site-accent，浅色主题下就跟着翻成了深青。三条锁在一起：
// 组件引用专用 token、accent 不再出现在这个组件里、Tailwind 里登记了这个 token
// （site.veil 缺失时 bg-site-veil 会静默不生成任何类，页面只是没有背景色）。
test('veil fill references its own token, wired through Tailwind', () => {
  const component = readFileSync(
    new URL('../../components/site/LogoVeil.tsx', import.meta.url),
    'utf8',
  )
  assert.match(component, /bg-site-veil/)
  assert.doesNotMatch(
    component,
    /bg-site-accent/,
    'The veil fill must not use the theme-flipping accent.',
  )

  const tailwind = readFileSync(
    new URL('../../../tailwind.config.ts', import.meta.url),
    'utf8',
  )
  assert.match(tailwind, /veil: 'var\(--site-veil\)'/)
})
