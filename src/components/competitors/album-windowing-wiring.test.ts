// src/components/competitors/album-windowing-wiring.test.ts
// 源码断言：竞品相册「按日期窗口加载」在组件层的接线。
// 本仓没有 DOM 测试环境，判据都在 src/lib/competitors/shotWindow.ts 里单测；
// 这里只钉「组件真的在用它们」——接线一旦被改回旧写法，别的测试一个都不会红。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
const CARD = read('./CompetitorCard.tsx')

test('卡片开播时段读全量 sessionStarts，不读已加载截图（否则数字会跟着相册翻页变）', () => {
  assert.match(CARD, /summarizeLiveHabit\(c\.sessionStarts, timeZoneForLocale\(locale\)\)/)
  assert.match(CARD, /recentSessionStarts\(c\.sessionStarts, RECENT_SESSIONS\)/)
  assert.doesNotMatch(CARD, /c\.shots\.map\(\(s\) => s\.stream_started_at\)/)
})
