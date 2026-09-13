import test from 'node:test'
import assert from 'node:assert/strict'

import { shotDockSections } from './shotDock.ts'

/** 人工上传：caption 是空串，两个直播态字段为 null。 */
const manual = { caption: '', viewer_count: null, stream_started_at: null }

/** 自动采集：Claude 写了 caption，直播态两项齐全。 */
const auto = {
  caption: '「MVP予戦」礼物对战环节，Mimi 暂列第 1 位。',
  viewer_count: 149,
  stream_started_at: '2026-08-25T05:33:00Z',
}

test('无识别内容 + 无编辑权：整条底板不渲染', () => {
  const d = shotDockSections(manual, false)
  assert.deepEqual(d, { caption: false, meta: false, edit: false, any: false })
})

test('无识别内容 + 有编辑权：只留编辑入口', () => {
  const d = shotDockSections(manual, true)
  assert.equal(d.caption, false)
  assert.equal(d.meta, false)
  assert.equal(d.edit, true)
  assert.equal(d.any, true)
})

test('有识别内容 + 无编辑权：caption 与直播态都出，编辑区不出', () => {
  const d = shotDockSections(auto, false)
  assert.deepEqual(d, { caption: true, meta: true, edit: false, any: true })
})

test('有识别内容 + 有编辑权：三段齐全', () => {
  const d = shotDockSections(auto, true)
  assert.deepEqual(d, { caption: true, meta: true, edit: true, any: true })
})

test('caption 只有空白字符时不渲染：空段会在底板里留出一条无解释的空隙', () => {
  assert.equal(shotDockSections({ ...manual, caption: '   \n ' }, false).caption, false)
  assert.equal(shotDockSections({ ...manual, caption: ' x ' }, false).caption, true)
})

test('在线 0 人也算直播态：0 是真实读数，不是「没采到」', () => {
  // 写成 !!viewer_count 就会把冷场的那一场整段吞掉
  const d = shotDockSections({ ...manual, viewer_count: 0 }, false)
  assert.equal(d.meta, true)
  assert.equal(d.any, true)
})

test('只有开播时刻、没有在线人数：直播态照样成立', () => {
  // 已播时长由 stream_started_at 派生，所以这两项任一存在都要出这一段
  const d = shotDockSections({ ...manual, stream_started_at: '2026-08-25T05:33:00Z' }, false)
  assert.equal(d.meta, true)
})

test('没有选中项时全关：夹逼兜底期间不该渲染半条底板', () => {
  assert.deepEqual(shotDockSections(null, true), {
    caption: false, meta: false, edit: false, any: false,
  })
  assert.equal(shotDockSections(undefined, true).any, false)
})
