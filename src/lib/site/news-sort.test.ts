import assert from 'node:assert/strict'
import test from 'node:test'
import { sortNews, publishedOnly, isValidNewsSlug } from './news-sort.ts'

test('置顶优先，其次发布日倒序', () => {
  const rows = [
    { slug: 'a', is_pinned: false, published_on: '2026-10-01', is_published: true },
    { slug: 'b', is_pinned: true,  published_on: '2026-08-01', is_published: true },
    { slug: 'c', is_pinned: false, published_on: '2026-12-01', is_published: true },
  ]
  assert.deepEqual(sortNews(rows).map(r => r.slug), ['b', 'c', 'a'])
})

test('已下架的不出现在官网列表', () => {
  const rows = [
    { slug: 'a', is_pinned: false, published_on: '2026-10-01', is_published: true },
    { slug: 'b', is_pinned: true,  published_on: '2026-11-01', is_published: false },
  ]
  assert.deepEqual(publishedOnly(rows).map(r => r.slug), ['a'])
})

test('slug 形状校验与数据库 check 一致', () => {
  assert.equal(isValidNewsSlug('moondollz-launch'), true)
  assert.equal(isValidNewsSlug('a1-b2'), true)
  assert.equal(isValidNewsSlug('Moondollz'), false)   // 大写
  assert.equal(isValidNewsSlug('a--b'), false)        // 连续连字符
  assert.equal(isValidNewsSlug('-a'), false)          // 首尾连字符
  assert.equal(isValidNewsSlug('a_b'), false)         // 下划线
  assert.equal(isValidNewsSlug(''), false)
  assert.equal(isValidNewsSlug('x'.repeat(61)), false) // 超过 60
})
