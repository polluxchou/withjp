import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findFirstAutoLink } from './autoLinkTerms.ts'

test('findFirstAutoLink splits before/match/after around the term', () => {
  const split = findFirstAutoLink('本次与 Polyjuice 达成合作', new Set())
  assert.deepEqual(split, {
    before: '本次与 ',
    match: 'Polyjuice',
    url: 'https://polyjuiceavatar.com',
    after: ' 达成合作',
  })
})

test('matches with no separating whitespace against CJK text', () => {
  const split = findFirstAutoLink('Polyjuiceとの提携', new Set())
  assert.deepEqual(split, {
    before: '',
    match: 'Polyjuice',
    url: 'https://polyjuiceavatar.com',
    after: 'との提携',
  })
})

test('does not match the term embedded inside a longer word', () => {
  assert.equal(findFirstAutoLink('SuperPolyjuiceX partnership', new Set()), null)
})

test('is case-sensitive', () => {
  assert.equal(findFirstAutoLink('a polyjuice partnership', new Set()), null)
})

test('returns null when the text has no registered term', () => {
  assert.equal(findFirstAutoLink('no mentions here', new Set()), null)
})

test('skips a term already recorded in seen', () => {
  const seen = new Set(['Polyjuice'])
  assert.equal(findFirstAutoLink('Polyjuice again', seen), null)
})

test('records the matched term into seen', () => {
  const seen = new Set<string>()
  findFirstAutoLink('Polyjuice partnership', seen)
  assert.equal(seen.has('Polyjuice'), true)
})
