import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldBypassMiddlewareAsset } from './middleware-assets.ts'

test('root app icon bypasses middleware when it reaches runtime guard', () => {
  assert.equal(shouldBypassMiddlewareAsset('/icon.svg'), true)
})

test('localized app pages still go through middleware runtime guard', () => {
  assert.equal(shouldBypassMiddlewareAsset('/zh/creators'), false)
})
