// src/lib/competitors/shot-window-wiring.test.ts
// 源码断言 + 常量断言：截图按日期窗口加载在服务端与路由层的接线。
// 判据本身在 shotWindow.test.ts 单测；这里钉「服务端真的在用它们」。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { ASK_SHOT_COLUMNS } from './service.ts'

const SERVICE = readFileSync(new URL('./service.ts', import.meta.url), 'utf8')
const ASK_SERVICE = readFileSync(new URL('./ask-service.ts', import.meta.url), 'utf8')

function bodyOf(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`)
  assert.ok(start >= 0, `找不到 ${name}`)
  const next = src.indexOf('\nexport ', start + 1)
  return src.slice(start, next < 0 ? undefined : next)
}

test('问答截图列：正好是 ask-context 读到的那几列', () => {
  assert.deepEqual(
    ASK_SHOT_COLUMNS.split(',').map((s) => s.trim()),
    ['competitor_id', 'shot_on', 'sort_order', 'stream_started_at', 'viewer_count', 'captured_at'],
  )
})

test('getAskBoard：截图只查问答列，不 select(*)，不按窗口截断', () => {
  const body = bodyOf(SERVICE, 'getAskBoard')
  assert.match(body, /db\.from\('competitor_shots'\)\.select\(ASK_SHOT_COLUMNS\)/)
  assert.doesNotMatch(body, /competitor_shots'\)\.select\('\*'\)/)
  assert.doesNotMatch(body, /\.or\(|\.gte\(|\.lt\(/)
})

test('问答服务改走 getAskBoard（全量历史），不再用相册窗口化的 getCompetitorBoard', () => {
  assert.match(ASK_SERVICE, /import \{ getAskBoard \} from '\.\/service\.ts'/)
  assert.doesNotMatch(ASK_SERVICE, /getCompetitorBoard/)
})
