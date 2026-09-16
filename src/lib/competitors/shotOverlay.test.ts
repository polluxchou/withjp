import test from 'node:test'
import assert from 'node:assert/strict'

import { CAPTION_CLAMP_LINES, captionOverflowsClamp, shotOverlaySections } from './shotOverlay.ts'

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

test('CAPTION_CLAMP_LINES: 折叠态显示两行', () => {
  assert.equal(CAPTION_CLAMP_LINES, 2)
})

test('captionOverflowsClamp: 内容高过两行才算需要折叠', () => {
  // 行高 16、夹两行 = 32
  assert.equal(captionOverflowsClamp(48, 16), true, '三行')
  assert.equal(captionOverflowsClamp(32, 16), false, '正好两行')
  assert.equal(captionOverflowsClamp(16, 16), false, '一行')
})

test('captionOverflowsClamp: 1px 容差,挡掉子像素行高的误判', () => {
  // 子像素行高会让没超出的段落也差出零点几 px,没有容差就会给每条备注都挂上按钮
  assert.equal(captionOverflowsClamp(32.6, 16), false)
  assert.equal(captionOverflowsClamp(33.2, 16), true)
})

test('captionOverflowsClamp: 判据与展开/折叠无关,只看内容高度', () => {
  // 这是默认展开之后的关键:展开态下 scrollHeight 就是全文高度,
  // 拿它跟"两行"比,照样能算出"这段本来需不需要折叠"。
  // 旧写法 scrollHeight > clientHeight 在展开态恒为 false,短备注也会挂出收起钮。
  assert.equal(captionOverflowsClamp(96, 16), true, '展开态的六行全文')
  assert.equal(captionOverflowsClamp(16, 16), false, '展开态的一行全文')
})

test('captionOverflowsClamp: 拿不到行高时一律当作没超出', () => {
  // getComputedStyle 在极端情况下会返回 normal / 0,算出来是 NaN 或除零。
  // 宁可少一颗按钮,也不要给每条备注都挂一颗点了没反应的钮。
  assert.equal(captionOverflowsClamp(96, 0), false)
  assert.equal(captionOverflowsClamp(96, Number.NaN), false)
  assert.equal(captionOverflowsClamp(96, -5), false)
  assert.equal(captionOverflowsClamp(Number.NaN, 16), false)
})
