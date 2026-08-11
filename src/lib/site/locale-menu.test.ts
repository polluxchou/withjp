import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLocaleMenuOptions,
  nextLocaleMenuIndex,
  nextLocaleMenuOpen,
} from './locale-menu.ts'

test('locale menu keeps routing order and marks exactly the current locale', () => {
  const options = buildLocaleMenuOptions('ja')
  assert.deepEqual(options.map(({ locale }) => locale), ['zh', 'en', 'ja'])
  assert.deepEqual(options.map(({ active }) => active), [false, false, true])
})

test('an unknown current locale does not invent an active option', () => {
  assert.equal(buildLocaleMenuOptions('fr').filter(({ active }) => active).length, 0)
})

test('toggle opens and closes while dismiss events always close', () => {
  assert.equal(nextLocaleMenuOpen(false, 'toggle'), true)
  assert.equal(nextLocaleMenuOpen(true, 'toggle'), false)
  assert.equal(nextLocaleMenuOpen(true, 'outside'), false)
  assert.equal(nextLocaleMenuOpen(true, 'escape'), false)
  assert.equal(nextLocaleMenuOpen(true, 'select'), false)
})

test('arrow, home and end keys move focus with wrapping', () => {
  assert.equal(nextLocaleMenuIndex(0, 'ArrowDown', 3), 1)
  assert.equal(nextLocaleMenuIndex(2, 'ArrowDown', 3), 0)
  assert.equal(nextLocaleMenuIndex(0, 'ArrowUp', 3), 2)
  assert.equal(nextLocaleMenuIndex(1, 'Home', 3), 0)
  assert.equal(nextLocaleMenuIndex(1, 'End', 3), 2)
  assert.equal(nextLocaleMenuIndex(1, 'Escape', 3), 1)
})
