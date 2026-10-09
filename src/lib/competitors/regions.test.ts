import assert from 'node:assert/strict'
import test from 'node:test'

import { REGION_CODES, normalizeRegion, regionOptions, resolveNewRegion } from './regions.ts'

test('清单里的代码原样通过,大小写与首尾空白容错', () => {
  assert.equal(normalizeRegion('KR'), 'KR')
  assert.equal(normalizeRegion(' my '), 'MY')
  assert.equal(normalizeRegion('jp'), 'JP')
})

test('不在清单里、空串、非字符串一律判为无效', () => {
  assert.equal(normalizeRegion('XX'), null)
  assert.equal(normalizeRegion('JPN'), null, '三位代码不收,库里一直是两位')
  assert.equal(normalizeRegion(''), null)
  assert.equal(normalizeRegion('   '), null)
  assert.equal(normalizeRegion(null), null)
  assert.equal(normalizeRegion(undefined), null)
  assert.equal(normalizeRegion(81), null)
})

test('清单覆盖库里已有的三个地区', () => {
  // 2026-10-09 生产库:JP 22 / KR 5 / MY 1。清单漏掉任何一个,改地区的下拉就选不回原值。
  for (const code of ['JP', 'KR', 'MY']) assert.ok(REGION_CODES.includes(code as never), code)
})

test('主账号必须带合法地区', () => {
  assert.deepEqual(resolveNewRegion({ parentId: null, parentRegion: null, region: 'kr' }), { ok: true, region: 'KR' })
  const missing = resolveNewRegion({ parentId: null, parentRegion: null, region: undefined })
  assert.equal(missing.ok, false, '不带地区就建档,正是这次要堵的"默认日本"')
  assert.equal(resolveNewRegion({ parentId: undefined, parentRegion: null, region: 'XX' }).ok, false)
})

test('子账号沿用父账号地区,忽略传入值', () => {
  assert.deepEqual(
    resolveNewRegion({ parentId: 'p1', parentRegion: 'KR', region: 'JP' }),
    { ok: true, region: 'KR' },
    '主播跟着团走,传入值不能让一个团下面混出两个地区',
  )
  assert.deepEqual(resolveNewRegion({ parentId: 'p1', parentRegion: null, region: undefined }), { ok: true, region: null })
})

test('下拉选项:清单之外的现值也要保留,否则编辑时会被悄悄换掉', () => {
  assert.deepEqual(regionOptions('KR'), [...REGION_CODES])
  assert.deepEqual(regionOptions(null), [...REGION_CODES])
  assert.deepEqual(regionOptions(' ph '), [...REGION_CODES, 'PH'])
})
