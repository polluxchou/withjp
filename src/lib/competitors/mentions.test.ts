// src/lib/competitors/mentions.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { extractMentionedHandles } from './mentions.ts'

test('extractMentionedHandles: 提取多个 @handle', () => {
  assert.deepEqual(
    extractMentionedHandles('合作 @sister_group 和 @tokyo.velvet'),
    ['sister_group', 'tokyo.velvet'],
  )
})

test('extractMentionedHandles: 排除自身(大小写不敏感)', () => {
  assert.deepEqual(extractMentionedHandles('我是 @Me,联系 @you', 'me'), ['you'])
  assert.deepEqual(extractMentionedHandles('我是 @Me,联系 @you', '@ME'), ['you'])
})

test('extractMentionedHandles: 邮箱域名不算(@ 前是词字符)', () => {
  assert.deepEqual(extractMentionedHandles('邮箱 test@gmail.com 关注 @realhandle'), ['realhandle'])
})

test('extractMentionedHandles: 大小写去重,保留首次出现', () => {
  assert.deepEqual(extractMentionedHandles('@Foo @foo @FOO'), ['Foo'])
})

test('extractMentionedHandles: 去尾部点/停在非法字符', () => {
  assert.deepEqual(extractMentionedHandles('看 @abc。 和 @def.'), ['abc', 'def'])
})

test('extractMentionedHandles: 少于 2 位不算', () => {
  assert.deepEqual(extractMentionedHandles('@a 与 @ab'), ['ab'])
})

test('extractMentionedHandles: 空/无 @ 返回 []', () => {
  assert.deepEqual(extractMentionedHandles(''), [])
  assert.deepEqual(extractMentionedHandles(null), [])
  assert.deepEqual(extractMentionedHandles(undefined), [])
  assert.deepEqual(extractMentionedHandles('没有提及任何人'), [])
})

test('extractMentionedHandles: 上限 20 个', () => {
  const bio = Array.from({ length: 25 }, (_, i) => `@user${i}a`).join(' ')
  assert.equal(extractMentionedHandles(bio).length, 20)
})
