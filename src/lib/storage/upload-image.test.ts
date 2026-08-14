import assert from 'node:assert/strict'
import test from 'node:test'
import { validateImage, safeExtension } from './upload-image.ts'

test('只放行四种图片类型', () => {
  assert.deepEqual(validateImage({ type: 'image/png', size: 100 }), { ok: true })
  assert.deepEqual(validateImage({ type: 'image/svg+xml', size: 100 }), { ok: false, error: 'type' })
})

test('超过 5MB 被拒', () => {
  assert.deepEqual(validateImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), { ok: false, error: 'size' })
})

test('扩展名净化：剥掉路径分隔与奇怪字符', () => {
  assert.equal(safeExtension('a.png'), 'png')
  assert.equal(safeExtension('a.PNG'), 'png')
  assert.equal(safeExtension('evil.pn/g'), 'png')          // 斜杠会在桶里造出子目录
  assert.equal(safeExtension('noext'), 'png')              // 无扩展名回退
  assert.equal(safeExtension('a.' + 'x'.repeat(20)), 'png') // 异常长度回退
})
