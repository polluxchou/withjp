// src/lib/competitors/liveTrack.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeSample, roomEnded, type ProbeSample } from './liveTrack.ts'

test('roomEnded: 只有 status 4 且无 2 才算结束', () => {
  assert.equal(roomEnded('{"status":4}'), true)
})

test('roomEnded: 同时出现 2 和 4 视为在播（结束页混着别人的在播卡片）', () => {
  assert.equal(roomEnded('{"status":4} ... {"status":2}'), false)
})

test('roomEnded: 只有 status 2 是在播', () => {
  assert.equal(roomEnded('{"status":2}'), false)
})

test('roomEnded: 认 liveStatus / live_status 两种写法', () => {
  assert.equal(roomEnded('{"liveStatus":4}'), true)
  assert.equal(roomEnded('{"live_status":4}'), true)
})

test('roomEnded: 读不到任何状态码时不下结论（返回 false，交给其它信号）', () => {
  assert.equal(roomEnded(''), false)
  assert.equal(roomEnded('<html><body>whatever</body></html>'), false)
})

test('roomEnded: 容忍冒号两侧空格', () => {
  assert.equal(roomEnded('{"status" : 4}'), true)
})

const probeSample = (over: Partial<ProbeSample> = {}): ProbeSample => ({
  t: 1_786_536_600_000, // 2026-08-12T12:10:00Z
  viewer: '1.2K',
  followers: '34.5M',
  likes: '2,340',
  msgs: 17,
  speakers: 9,
  observerAlive: true,
  selectorsOk: { viewer: '[data-e2e="x"]', followers: null, likes: null, chatHost: '.chat' },
  ...over,
})

test('normalizeSample: 文本计数转数字，算出距开播秒数', () => {
  const s = normalizeSample(probeSample(), 1_786_536_000) // 开播比采样早 600 秒
  assert.equal(s.viewer_count, 1200)
  assert.equal(s.follower_count, 34_500_000)
  assert.equal(s.like_total, 2340)
  assert.equal(s.chat_msgs, 17)
  assert.equal(s.chat_speakers, 9)
  assert.equal(s.elapsed_seconds, 600)
  assert.equal(s.sampled_at, '2026-08-12T12:10:00.000Z')
})

test('normalizeSample: 开播时间未知则 elapsed_seconds 为 null，不猜', () => {
  assert.equal(normalizeSample(probeSample(), null).elapsed_seconds, null)
})

test('normalizeSample: 读不到的字段是 null，不是 0', () => {
  const s = normalizeSample(probeSample({ viewer: null, followers: '', likes: 'N/A' }), 1_786_536_000)
  assert.equal(s.viewer_count, null)
  assert.equal(s.follower_count, null)
  assert.equal(s.like_total, null)
})

test('normalizeSample: 自检信息原样带进 raw，供报表判可信度', () => {
  const s = normalizeSample(probeSample({ observerAlive: false }), 1_786_536_000)
  assert.equal(s.raw.observer_alive, false)
  assert.equal(s.raw.selectors_ok.viewer, '[data-e2e="x"]')
  assert.equal(s.raw.selectors_ok.followers, null)
})

test('normalizeSample: 采样早于开播时间时 elapsed 不为负，钳到 0', () => {
  const s = normalizeSample(probeSample(), 1_786_536_900) // 开播晚于采样 300 秒
  assert.equal(s.elapsed_seconds, 0)
})
