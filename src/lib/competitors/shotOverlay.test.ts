import test from 'node:test'
import assert from 'node:assert/strict'

import { shotOverlaySections } from './shotOverlay.ts'

/** 人工上传：caption 是空串，两个直播态字段为 null。 */
const manual = { caption: '', viewer_count: null, stream_started_at: null }

/** 自动采集：Claude 写了 caption，直播态两项齐全。 */
const auto = {
  caption: '「MVP予戦」礼物对战环节，Mimi 暂列第 1 位。',
  viewer_count: 149,
  stream_started_at: '2026-08-25T05:33:00Z',
}

test('自动采集 + 可编辑 + 多张：渐变层四段全开', () => {
  assert.deepEqual(shotOverlaySections(auto, true, 3), {
    live: true, caption: true, strip: true, edit: true, footer: true,
  })
})

test('只读 + 人工上传 + 仅此一张：渐变层整个不画，图上只剩日期胶囊', () => {
  assert.deepEqual(shotOverlaySections(manual, false, 1), {
    live: false, caption: false, strip: false, edit: false, footer: false,
  })
})

test('只读 + 人工上传 + 多张：胶片条必须留着，否则没法翻页', () => {
  const s = shotOverlaySections(manual, false, 3)
  assert.equal(s.strip, true)
  assert.equal(s.footer, true, '有胶片条就得有渐变层垫底，否则缩略图压在图上看不清')
  assert.equal(s.edit, false)
})

test('人工上传 + 可编辑 + 仅此一张：只为编辑钮留渐变层', () => {
  const s = shotOverlaySections(manual, true, 1)
  assert.deepEqual(s, { live: false, caption: false, strip: false, edit: true, footer: true })
})

test('caption 只有空白字符时不算有备注', () => {
  assert.equal(shotOverlaySections({ ...manual, caption: '  \n ' }, false, 1).caption, false)
  assert.equal(shotOverlaySections({ ...manual, caption: ' x ' }, false, 1).caption, true)
})

test('在线 0 人也算直播态：0 是真实读数，不是「没采到」', () => {
  // 写成 !!viewer_count 就会把冷场那一场整段吞掉
  const s = shotOverlaySections({ ...manual, viewer_count: 0 }, false, 1)
  assert.equal(s.live, true)
  assert.equal(s.footer, true)
})

test('只有开播时刻、没有在线人数：直播态照样成立', () => {
  // 已播时长由 stream_started_at 派生，所以这两项任一存在都要出这一段
  const s = shotOverlaySections({ ...manual, stream_started_at: '2026-08-25T05:33:00Z' }, false, 1)
  assert.equal(s.live, true)
})

test('没有选中项时全关：夹逼兜底期间不该渲染半层叠加', () => {
  assert.deepEqual(shotOverlaySections(null, true, 3), {
    live: false, caption: false, strip: false, edit: false, footer: false,
  })
  assert.equal(shotOverlaySections(undefined, true, 3).footer, false)
})

test('张数 0 或 1 都不出胶片条', () => {
  assert.equal(shotOverlaySections(auto, false, 1).strip, false)
  assert.equal(shotOverlaySections(auto, false, 0).strip, false)
})
