import test from 'node:test'
import assert from 'node:assert/strict'

import { CREATOR_PLATFORMS, normalizeCreatorPlatform } from './platforms.ts'

test('creator platform options include TikTok and Instagram', () => {
  assert.ok(CREATOR_PLATFORMS.includes('TikTok'))
  assert.ok(CREATOR_PLATFORMS.includes('Instagram'))
})

test('normalizeCreatorPlatform canonicalizes supported platform names', () => {
  assert.equal(normalizeCreatorPlatform('tiktok'), 'TikTok')
  assert.equal(normalizeCreatorPlatform('Tik Tok'), 'TikTok')
  assert.equal(normalizeCreatorPlatform('instagram'), 'Instagram')
  assert.equal(normalizeCreatorPlatform('insta'), 'Instagram')
  assert.equal(normalizeCreatorPlatform('youtube'), 'YouTube')
  assert.equal(normalizeCreatorPlatform(' xiao hong shu '), 'Xiaohongshu')
})

test('normalizeCreatorPlatform preserves unknown values after trimming', () => {
  assert.equal(normalizeCreatorPlatform('  Threads  '), 'Threads')
  assert.equal(normalizeCreatorPlatform(''), '')
  assert.equal(normalizeCreatorPlatform('   '), '')
})
