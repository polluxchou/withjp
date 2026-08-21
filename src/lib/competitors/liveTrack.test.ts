// src/lib/competitors/liveTrack.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeSample,
  roomEnded,
  nextWatchdog,
  initialWatchdog,
  type ProbeSample,
  type DrainHealth,
} from './liveTrack.ts'

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

test('normalizeSample: 钳到 0 时把钳之前的负值留在 raw，不静默吞掉 startTime 解析错', () => {
  const s = normalizeSample(probeSample(), 1_786_536_900)
  assert.equal(s.raw.elapsed_before_clamp, -300)
})

test('normalizeSample: 没发生钳制时 elapsed_before_clamp 是 null', () => {
  assert.equal(normalizeSample(probeSample(), 1_786_536_000).raw.elapsed_before_clamp, null)
  assert.equal(normalizeSample(probeSample(), null).raw.elapsed_before_clamp, null)
})

test('normalizeSample: raw 原样保留三个字段的页面原文，供排查选择器漂移', () => {
  const s = normalizeSample(probeSample(), 1_786_536_000)
  assert.equal(s.raw.viewer_text, '1.2K')
  assert.equal(s.raw.followers_text, '34.5M')
  assert.equal(s.raw.likes_text, '2,340')
})

test('normalizeSample: 四个选择器的命中情况整组带进 raw', () => {
  const s = normalizeSample(probeSample(), 1_786_536_000)
  assert.deepEqual(s.raw.selectors_ok, {
    viewer: '[data-e2e="x"]', followers: null, likes: null, chatHost: '.chat',
  })
})

const health = (over: Partial<DrainHealth> = {}): DrainHealth => ({
  samples: 1,
  observerAlive: true,
  hasVideo: true,
  roomEnded: false,
  ...over,
})

test('nextWatchdog: 一切正常 → ok', () => {
  const r = nextWatchdog(initialWatchdog(), health())
  assert.equal(r.action, 'ok')
  assert.equal(r.state.reinjects, 0)
})

test('nextWatchdog: 页面判定已结束 → 立即 end，不重注入', () => {
  const r = nextWatchdog(initialWatchdog(), health({ roomEnded: true, samples: 5 }))
  assert.equal(r.action, 'end')
})

test('nextWatchdog: 排空为空 → 先重注入', () => {
  const r = nextWatchdog(initialWatchdog(), health({ samples: 0 }))
  assert.equal(r.action, 'reinject')
  assert.equal(r.state.reinjects, 1)
})

test('nextWatchdog: observer 掉了 → 重注入', () => {
  assert.equal(nextWatchdog(initialWatchdog(), health({ observerAlive: false })).action, 'reinject')
})

test('nextWatchdog: video 没了 → 重注入', () => {
  assert.equal(nextWatchdog(initialWatchdog(), health({ hasVideo: false })).action, 'reinject')
})

test('nextWatchdog: 连续三轮不健康 → 第三轮判 end', () => {
  const st = initialWatchdog()
  const bad = health({ samples: 0 })
  let r = nextWatchdog(st, bad)
  assert.equal(r.action, 'reinject')
  r = nextWatchdog(r.state, bad)
  assert.equal(r.action, 'reinject')
  r = nextWatchdog(r.state, bad)
  assert.equal(r.action, 'end')
})

test('nextWatchdog: 重注入后恢复健康 → 计数器清零，能再扛两次', () => {
  let r = nextWatchdog(initialWatchdog(), health({ samples: 0 }))
  assert.equal(r.state.reinjects, 1)
  r = nextWatchdog(r.state, health())
  assert.equal(r.action, 'ok')
  assert.equal(r.state.reinjects, 0)
  r = nextWatchdog(r.state, health({ samples: 0 }))
  assert.equal(r.action, 'reinject')
})
