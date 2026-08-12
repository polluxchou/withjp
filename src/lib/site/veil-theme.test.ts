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
