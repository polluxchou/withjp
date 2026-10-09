import assert from 'node:assert/strict'
import test from 'node:test'

import {
  REGION_CODES, REGION_UNSET, matchesRegionFilter, normalizeRegion, regionBuckets, regionFlag, regionOptions,
  resolveNewRegion,
} from './regions.ts'

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

test('国旗:两位代码转成区域指示符,大小写容错;不是两位字母就不画', () => {
  assert.equal(regionFlag('JP'), '\u{1F1EF}\u{1F1F5}')
  assert.equal(regionFlag('kr'), '\u{1F1F0}\u{1F1F7}')
  assert.equal(regionFlag('CN'), '\u{1F1E8}\u{1F1F3}')
  assert.equal(regionFlag(''), '')
  assert.equal(regionFlag('JPN'), '')
  assert.equal(regionFlag('J1'), '')
  assert.equal(regionFlag(null), '')
})

test('分桶:按账号数从多到少,同数按代码字母序,未填垫底', () => {
  // 2026-10-09 生产库的形状:JP 22 / KR 5 / MY 1
  const regions = [...Array(22).fill('JP'), ...Array(5).fill('KR'), 'MY']
  assert.deepEqual(regionBuckets(regions), [
    { key: 'JP', count: 22 }, { key: 'KR', count: 5 }, { key: 'MY', count: 1 },
  ])
  assert.deepEqual(regionBuckets(['TW', null, 'CN', ' ', undefined, 'tw']), [
    { key: 'TW', count: 2 }, { key: 'CN', count: 1 }, { key: REGION_UNSET, count: 3 },
  ], '空串、空白、null、undefined 都算未填,且大小写归一后再计数')
  assert.deepEqual(regionBuckets([]), [])
})

test('筛选:空串=全部;未填桶只收空地区;其余按代码比对且大小写容错', () => {
  assert.equal(matchesRegionFilter('JP', ''), true)
  assert.equal(matchesRegionFilter(null, ''), true)
  assert.equal(matchesRegionFilter('KR', 'KR'), true)
  assert.equal(matchesRegionFilter(' kr ', 'KR'), true)
  assert.equal(matchesRegionFilter('JP', 'KR'), false)
  assert.equal(matchesRegionFilter(null, 'KR'), false)
  assert.equal(matchesRegionFilter(null, REGION_UNSET), true)
  assert.equal(matchesRegionFilter('  ', REGION_UNSET), true)
  assert.equal(matchesRegionFilter('JP', REGION_UNSET), false)
})
