// src/lib/competitors/ask-prompt.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAskContext } from './ask-context.ts'
import { ANSWER_LANGUAGE, buildSystemPrompt } from './ask-prompt.ts'

const CTX = buildAskContext({ competitors: [], canEdit: true }, new Date('2026-08-19T15:30:00Z'), 'zh')

test('prompt 内嵌完整且未改写的上下文包 JSON', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  // 用同一次 JSON.stringify 结果去比对,而不是抠单个字段——这样能钉住
  // "整包原样嵌入",不会因为 prompt 文案怎么改而误判,只会在真的漏嵌数据包
  // 或改动了序列化方式时失败。
  assert.ok(p.includes(JSON.stringify(CTX, null, 2)))
})

test('语言指令随 locale 切换,未知 locale 回落中文', () => {
  assert.ok(buildSystemPrompt(CTX, 'zh').includes(ANSWER_LANGUAGE.zh))
  assert.ok(buildSystemPrompt(CTX, 'en').includes(ANSWER_LANGUAGE.en))
  assert.ok(buildSystemPrompt(CTX, 'ja').includes(ANSWER_LANGUAGE.ja))
  assert.ok(buildSystemPrompt(CTX, 'fr').includes(ANSWER_LANGUAGE.zh))
})

test('规则1:禁止算术,数字必须原样引用', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('不做任何算术'))
})

test('规则2:insufficient 字段禁止用于比较/排序/趋势,且要点名排除的账号', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('insufficient'))
  assert.ok(p.includes('点名'))
})

test('规则3:没有截图记录只代表未采集,不是没开播', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('capturedDates'))
  assert.ok(p.includes('没有采到'))
})

test('规则4:liveHabit 的 insufficient 门槛也盖住 sessionsInWindow 与 recentSessions 的原始时刻', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('sessionsInWindow'))
  assert.ok(p.includes('recentSessions'))
  assert.ok(p.includes('反推'))
})

test('规则5:latestStartedAt 是硬事实,不受第4条门槛约束', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('latestStartedAt'))
  assert.ok(p.includes('不受第 4 条约束'))
})

test('规则6:peakViewersAllTime 是全量历史峰值,不是最近一场的峰值', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('peakViewersAllTime'))
  assert.ok(p.includes('最近一场直播的峰值'))
})

test('规则7:lastShotUptimeMinutes 归属 lastShotUptimeAt 而非 lastOn,且是下限', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('lastShotUptimeMinutes'))
  assert.ok(p.includes('lastShotUptimeAt'))
  assert.ok(p.includes('lastOn'))
  assert.ok(p.includes('下限'))
})

test('规则8:regionMismatch 为 true 时必须提示冲突,不能径直断言 region', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('regionMismatch'))
  assert.ok(p.includes('observedLanguage'))
})

test('规则9:相对日期以 meta.todayTokyo 为基准,slots.at 已换算不可再转时区', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('todayTokyo'))
  assert.ok(p.includes('displayTimeZone'))
  assert.ok(p.includes('不要再自己做时区转换'))
})

test('规则10:未收录账号要说明并给出相近 handle,不能编造', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('未收录'))
  assert.ok(p.includes('相近'))
})
