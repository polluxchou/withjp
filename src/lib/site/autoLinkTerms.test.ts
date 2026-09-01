import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findFirstAutoLink } from './autoLinkTerms.ts'

test('findFirstAutoLink splits before/match/after around the term', () => {
  const split = findFirstAutoLink('本次与 PolyjuiceAvatar 达成合作', new Set())
  assert.deepEqual(split, {
    before: '本次与 ',
    match: 'PolyjuiceAvatar',
    url: 'https://polyjuiceavatar.com',
    after: ' 达成合作',
  })
})

test('matches with no separating whitespace against CJK text', () => {
  const split = findFirstAutoLink('PolyjuiceAvatarとの提携', new Set())
  assert.deepEqual(split, {
    before: '',
    match: 'PolyjuiceAvatar',
    url: 'https://polyjuiceavatar.com',
    after: 'との提携',
  })
})

// 回归用例：已发布新闻正文里的真实措辞（'EchoWITH 与 PolyjuiceAvatar 工作室
// 合作推进'）——早期实现只登记了 'Polyjuice'，整词边界匹配下命中不到复合词
// 'PolyjuiceAvatar' 里的子串，导致线上完全没有加粗加链接生效。
test('matches the real news copy phrasing', () => {
  const split = findFirstAutoLink(
    '这项技术由 EchoWITH 与 PolyjuiceAvatar 工作室合作推进',
    new Set(),
  )
  assert.equal(split?.match, 'PolyjuiceAvatar')
})

test('does not match the term embedded inside a longer word', () => {
  assert.equal(findFirstAutoLink('SuperPolyjuiceAvatarX partnership', new Set()), null)
})

test('does not match a bare "Polyjuice" without the "Avatar" suffix', () => {
  assert.equal(findFirstAutoLink('Polyjuice is not the registered term', new Set()), null)
})

test('is case-sensitive', () => {
  assert.equal(findFirstAutoLink('a polyjuiceavatar partnership', new Set()), null)
})

test('returns null when the text has no registered term', () => {
  assert.equal(findFirstAutoLink('no mentions here', new Set()), null)
})

test('skips a term already recorded in seen', () => {
  const seen = new Set(['PolyjuiceAvatar'])
  assert.equal(findFirstAutoLink('PolyjuiceAvatar again', seen), null)
})

test('records the matched term into seen', () => {
  const seen = new Set<string>()
  findFirstAutoLink('PolyjuiceAvatar partnership', seen)
  assert.equal(seen.has('PolyjuiceAvatar'), true)
})
