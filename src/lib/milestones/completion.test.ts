import test from 'node:test'
import assert from 'node:assert/strict'

import {
  completionDeltaDays,
  getMilestoneTiming,
  fallbackStatus,
  normalizeDayStamp,
  planStatusRecompute,
  recomputeStatusByTime,
  resolveCompletion,
  tokyoDayStamp,
} from './completion.ts'
import type { MilestoneStatus } from '../types/index.ts'

const NOW = new Date('2026-08-31T03:00:00.000Z') // 东京时间 8/31 12:00

function day(iso: string): string {
  return `${iso}T00:00:00.000Z`
}

const DATES = { start_date: day('2026-06-01'), target_date: day('2026-09-30') }

test('completed milestones use actual completion timing even 31 days after their target', () => {
  const milestone = { status: 'completed' as const, target_date: day('2026-08-10'), completed_date: day('2026-08-10') }
  assert.deepEqual(getMilestoneTiming(milestone, -31), {
    completed: true, days: 0, label: 'detail.completedOnTime', tone: 'success',
  })
  assert.deepEqual(getMilestoneTiming(milestone, -100), getMilestoneTiming(milestone, -31))
  assert.deepEqual(getMilestoneTiming({ ...milestone, completed_date: day('2026-08-08') }, -31), {
    completed: true, days: 2, label: 'detail.completedEarly', tone: 'success',
  })
  assert.deepEqual(getMilestoneTiming({ ...milestone, completed_date: day('2026-08-13') }, -31), {
    completed: true, days: 3, label: 'detail.completedLate', tone: 'warning',
  })
})

test('completion date is authoritative and legacy completed rows never show a countdown', () => {
  const milestone = { status: 'missed' as const, target_date: day('2026-08-10'), completed_date: day('2026-08-10') }
  assert.equal(getMilestoneTiming(milestone, -31).completed, true)
  assert.deepEqual(getMilestoneTiming({ ...milestone, status: 'completed', completed_date: null }, -31), {
    completed: true, days: null, label: 'status.completed', tone: 'success',
  })
})

test('open milestones retain overdue and remaining days after completion is cleared', () => {
  const milestone = { status: 'active' as const, target_date: day('2026-08-10'), completed_date: null }
  for (const daysLeft of [-31, 0, 3, 10]) {
    assert.deepEqual(getMilestoneTiming(milestone, daysLeft), {
      completed: false,
      days: Math.abs(daysLeft),
      label: daysLeft < 0 ? 'table.overdue' : 'table.daysShort',
      tone: daysLeft < 0 ? 'danger' : daysLeft <= 7 ? 'warning' : 'neutral',
    })
  }
})

// ── tokyoDayStamp ─────────────────────────────────────────────

test('tokyoDayStamp 按东京业务日取整，不受 UTC 日界影响', () => {
  // UTC 还是 8/30，东京已经是 8/31 —— 早班点「已完成」不该盖上昨天的戳
  assert.equal(tokyoDayStamp(new Date('2026-08-30T23:30:00.000Z')), day('2026-08-31'))
  assert.equal(tokyoDayStamp(new Date('2026-08-31T03:00:00.000Z')), day('2026-08-31'))
  // 东京 8/31 23:59 → UTC 已是 9/1，仍应记 8/31
  assert.equal(tokyoDayStamp(new Date('2026-08-31T14:59:00.000Z')), day('2026-08-31'))
})

// ── normalizeDayStamp ─────────────────────────────────────────

test('normalizeDayStamp 接受纯日期与完整 ISO，空值归一为 null', () => {
  assert.equal(normalizeDayStamp('2026-08-31'), day('2026-08-31'))
  assert.equal(normalizeDayStamp('2026-08-31T00:00:00.000Z'), day('2026-08-31'))
  assert.equal(normalizeDayStamp('2026-08-31T15:20:00.000Z'), day('2026-08-31'))
  assert.equal(normalizeDayStamp(null), null)
  assert.equal(normalizeDayStamp(''), null)
  assert.equal(normalizeDayStamp('   '), null)
})

test('normalizeDayStamp 对非法输入返回 undefined，让调用方能报 400 而不是静默丢日期', () => {
  assert.equal(normalizeDayStamp('not-a-date'), undefined)
  assert.equal(normalizeDayStamp('2026-13-45'), undefined)
  assert.equal(normalizeDayStamp(42), undefined)
})

test('normalizeDayStamp 挡住会静默进位的越界日期', () => {
  // Date 对 13 月直接判非法，但 2/30、4/31 这类是「格式合法、日历不存在」，
  // 会被悄悄进位成 3/2、5/1 —— 回读一遍才拦得住
  assert.equal(normalizeDayStamp('2026-02-30'), undefined)
  assert.equal(normalizeDayStamp('2026-04-31'), undefined)
})

// ── fallbackStatus ────────────────────────────────────────────

test('fallbackStatus：目标日期已过 → missed', () => {
  assert.equal(
    fallbackStatus({ start_date: day('2026-06-01'), target_date: day('2026-08-30') }, NOW),
    'missed',
  )
})

test('fallbackStatus：目标日期在 7 天内 → at_risk', () => {
  assert.equal(
    fallbackStatus({ start_date: day('2026-06-01'), target_date: day('2026-09-03') }, NOW),
    'at_risk',
  )
})

test('fallbackStatus：已开始且目标日期尚远 → active', () => {
  assert.equal(fallbackStatus(DATES, NOW), 'active')
})

test('fallbackStatus：还没到开始日期 → planned', () => {
  assert.equal(
    fallbackStatus({ start_date: day('2026-10-01'), target_date: day('2026-12-01') }, NOW),
    'planned',
  )
})

test('fallbackStatus：恰好 7 天整后到期不算 at_risk，与 GET 的时间兜底取同一个开区间', () => {
  // NOW + 7d 这一刻本身落在窗口外（route.ts 用的是严格小于），差一秒才进窗口
  assert.equal(
    fallbackStatus({ start_date: day('2026-06-01'), target_date: '2026-09-07T03:00:00.000Z' }, NOW),
    'active',
  )
  assert.equal(
    fallbackStatus({ start_date: day('2026-06-01'), target_date: '2026-09-07T02:59:59.000Z' }, NOW),
    'at_risk',
  )
})

test('fallbackStatus：目标日期当天的零点整不算逾期,那一天还没过完', () => {
  // now 恰好 === target_date 这一瞬间(定时兜底如果正好在 UTC 零点跑到)。
  // 「今天到期」不是「已经逾期」—— 判定用严格小于才对。
  const noon = new Date('2026-09-07T00:00:00.000Z')
  assert.equal(
    fallbackStatus({ start_date: day('2026-06-01'), target_date: day('2026-09-07') }, noon),
    'at_risk',
  )
  // 再晚 1 毫秒才算逾期
  assert.equal(
    fallbackStatus(
      { start_date: day('2026-06-01'), target_date: day('2026-09-07') },
      new Date('2026-09-07T00:00:00.001Z'),
    ),
    'missed',
  )
})

test('fallbackStatus：开始日期恰好到点即算已开始 → active,而不是还停在 planned', () => {
  const dates = { start_date: day('2026-09-01'), target_date: day('2026-12-01') }
  assert.equal(fallbackStatus(dates, new Date('2026-09-01T00:00:00.000Z')), 'active')
  // 差 1 毫秒还没开始
  assert.equal(fallbackStatus(dates, new Date('2026-08-31T23:59:59.999Z')), 'planned')
})

// ── resolveCompletion ─────────────────────────────────────────

const PREV_OPEN = { ...DATES, status: 'active' as const, completed_date: null }
const PREV_DONE = { ...DATES, status: 'completed' as const, completed_date: day('2026-08-20') }

test('填完成日期 → 状态自动置为 completed', () => {
  assert.deepEqual(
    resolveCompletion(PREV_OPEN, { completed_date: '2026-08-25' }, NOW),
    { status: 'completed', completed_date: day('2026-08-25') },
  )
})

test('同批既填日期又显式给了别的状态时，完成日期是权威', () => {
  assert.deepEqual(
    resolveCompletion(PREV_OPEN, { completed_date: '2026-08-25', status: 'active' }, NOW),
    { status: 'completed', completed_date: day('2026-08-25') },
  )
})

test('清空完成日期 → 状态按起止日期回退重算', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { completed_date: null }, NOW),
    { status: 'active', completed_date: null },
  )
})

test('清空完成日期时若显式给了非完成状态，采纳该状态', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { completed_date: null, status: 'planned' }, NOW),
    { status: 'planned', completed_date: null },
  )
})

test('清空完成日期却仍要求 completed —— 日期权威，回退重算而不是自相矛盾', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { completed_date: '', status: 'completed' }, NOW),
    { status: 'active', completed_date: null },
  )
})

test('手动点「已完成」且日期为空 → 补今天（东京业务日）', () => {
  assert.deepEqual(
    resolveCompletion(PREV_OPEN, { status: 'completed' }, NOW),
    { status: 'completed', completed_date: day('2026-08-31') },
  )
})

test('手动点「已完成」但日期已存在 → 不覆盖原有日期', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { status: 'completed' }, NOW),
    { status: 'completed', completed_date: day('2026-08-20') },
  )
})

test('从「已完成」点回其它状态 → 完成日期一并清空，否则会被再次拽回 completed', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { status: 'at_risk' }, NOW),
    { status: 'at_risk', completed_date: null },
  )
})

test('patch 里既没有状态也没有完成日期 → 原样返回，不动既有数据', () => {
  assert.deepEqual(
    resolveCompletion(PREV_DONE, { title: 'x' } as Record<string, unknown>, NOW),
    { status: 'completed', completed_date: day('2026-08-20') },
  )
})

test('不变式：任何一条规则走完，completed 与完成日期非空互为充要条件', () => {
  const patches: Record<string, unknown>[] = [
    { completed_date: '2026-08-25' },
    { completed_date: null },
    { status: 'completed' },
    { status: 'planned' },
    { status: 'completed', completed_date: null },
    { status: 'missed', completed_date: '2026-08-25' },
    {},
  ]
  for (const prev of [PREV_OPEN, PREV_DONE]) {
    for (const patch of patches) {
      const out = resolveCompletion(prev, patch, NOW)
      assert.equal(
        out.status === 'completed',
        out.completed_date !== null,
        `不变式被打破：${JSON.stringify({ prev: prev.status, patch, out })}`,
      )
    }
  }
})

// ── completionDeltaDays ───────────────────────────────────────

test('completionDeltaDays：正数=延期，负数=提前，0=准点', () => {
  assert.equal(completionDeltaDays(day('2026-10-05'), day('2026-09-30')), 5)
  assert.equal(completionDeltaDays(day('2026-09-25'), day('2026-09-30')), -5)
  assert.equal(completionDeltaDays(day('2026-09-30'), day('2026-09-30')), 0)
})

test('completionDeltaDays：没有完成日期或日期非法时返回 null', () => {
  assert.equal(completionDeltaDays(null, day('2026-09-30')), null)
  assert.equal(completionDeltaDays(day('2026-09-30'), 'nope'), null)
})

test('completionDeltaDays 按日界取整，同一天的不同时刻不产生 ±1 天漂移', () => {
  assert.equal(completionDeltaDays('2026-09-30T23:00:00.000Z', '2026-09-30T01:00:00.000Z'), 0)
})

// ── recomputeStatusByTime ─────────────────────────────────────
//
// 定时重算与「取消完成」的还原共用阈值,但语境不同:还原时没有可信的底态
// (刚从 completed 下来),而定时重算面对的行可能带着人工设定的 planned/active。
// 下面这组用例把两者的差别钉住 —— 尤其是第 6 条:开始日期已过也不许把
// planned 推成 active。

const STUCK_MISSED_NEAR = { start_date: day('2026-05-11'), target_date: day('2026-09-07'), status: 'missed' as const }
const STUCK_MISSED_FAR  = { start_date: day('2026-07-24'), target_date: day('2026-09-15'), status: 'missed' as const }
const STUCK_AT_RISK     = { start_date: day('2026-08-17'), target_date: day('2026-11-30'), status: 'at_risk' as const }

test('recomputeStatusByTime：目标日期已过 → missed（正向推进照旧）', () => {
  assert.equal(
    recomputeStatusByTime({ start_date: day('2026-08-17'), target_date: day('2026-08-28'), status: 'active' }, NOW),
    'missed',
  )
})

test('recomputeStatusByTime：7 天内到期 → at_risk（正向推进照旧）', () => {
  assert.equal(
    recomputeStatusByTime({ start_date: day('2026-06-01'), target_date: day('2026-09-03'), status: 'active' }, NOW),
    'at_risk',
  )
})

test('recomputeStatusByTime：卡死的 missed 在目标日期推远后回到 active', () => {
  // 真实卡死行「银行注册」:target 被改到 2026-09-15(15 天后),状态却留在 missed
  assert.equal(recomputeStatusByTime(STUCK_MISSED_FAR, NOW), 'active')
})

test('recomputeStatusByTime：卡死的 missed 在目标日期推进到 7 天窗口内时降为 at_risk', () => {
  // 真实卡死行「和陈昊、小兽完成代理协议签约」:target 2026-09-07,列表上
  // 同时显示「已逾期」和「剩 7 天」
  assert.equal(recomputeStatusByTime(STUCK_MISSED_NEAR, NOW), 'at_risk')
})

test('recomputeStatusByTime：卡死的 at_risk 在目标日期推远后回到 active', () => {
  // 真实卡死行「场地装修 — 直播工作室」:target 2026-11-30(91 天后)仍是 at_risk
  assert.equal(recomputeStatusByTime(STUCK_AT_RISK, NOW), 'active')
})

test('recomputeStatusByTime：planned 且开始日期已过 → 仍是 planned,定时任务不代劳「开工」', () => {
  // 与 fallbackStatus 的唯一分歧点。开始日期只是计划,没开工就是没开工 ——
  // 真实行「0号直播间设备采买」(start 2026-08-15 已过)必须留在 planned。
  const notStarted = { start_date: day('2026-08-15'), target_date: day('2026-09-15'), status: 'planned' as const }
  assert.equal(recomputeStatusByTime(notStarted, NOW), 'planned')
  // 同一组日期交给 fallbackStatus(还原语境)则会算成 active —— 两个语境确实不同
  assert.equal(fallbackStatus(notStarted, NOW), 'active')
})

test('recomputeStatusByTime：active 且开始日期还没到 → 保持 active,不被降级成 planned', () => {
  // 人工提前开工是有效信息,定时重算不该把它抹掉
  assert.equal(
    recomputeStatusByTime({ start_date: day('2026-10-01'), target_date: day('2026-12-01'), status: 'active' }, NOW),
    'active',
  )
})

test('recomputeStatusByTime：从时间态还原时,开始日期未到则回到 planned', () => {
  assert.equal(
    recomputeStatusByTime({ start_date: day('2026-10-01'), target_date: day('2026-12-01'), status: 'missed' }, NOW),
    'planned',
  )
})

test('recomputeStatusByTime：恰好 7 天整后到期不算 at_risk,与 fallbackStatus 同一个开区间', () => {
  const dates = { start_date: day('2026-06-01'), status: 'active' as const }
  assert.equal(recomputeStatusByTime({ ...dates, target_date: '2026-09-07T03:00:00.000Z' }, NOW), 'active')
  assert.equal(recomputeStatusByTime({ ...dates, target_date: '2026-09-07T02:59:59.000Z' }, NOW), 'at_risk')
})

test('recomputeStatusByTime：不变式 —— 永不返回 completed', () => {
  // 调用方只喂 completed_date is null 的行,所以 status='completed' 只可能是
  // 旁路写入留下的坏行(打破了 completed ⇔ 完成日期非空)。重算应当把它修回
  // 一个开放态,而不是原样放行 —— 更不能凭空造出 completed。
  const statuses: MilestoneStatus[] = ['planned', 'active', 'at_risk', 'completed', 'missed']
  const targets = [day('2026-08-01'), day('2026-09-03'), day('2026-09-15'), day('2026-12-01')]
  for (const status of statuses) {
    for (const target_date of targets) {
      for (const start_date of [day('2026-06-01'), day('2026-10-01')]) {
        assert.notEqual(
          recomputeStatusByTime({ start_date, target_date, status }, NOW),
          'completed',
          `重算产出了 completed：${JSON.stringify({ status, start_date, target_date })}`,
        )
      }
    }
  }
  assert.equal(
    recomputeStatusByTime({ start_date: day('2026-06-01'), target_date: day('2026-12-01'), status: 'completed' }, NOW),
    'active',
  )
})

// ── planStatusRecompute ───────────────────────────────────────

test('planStatusRecompute：只产出真正变了的行,状态没变的不写库', () => {
  const groups = planStatusRecompute(
    [
      { id: 'far',     ...STUCK_MISSED_FAR },                                                    // missed  → active
      { id: 'overdue', start_date: day('2026-08-17'), target_date: day('2026-08-28'), status: 'missed' }, // 仍 missed
      { id: 'planned', start_date: day('2026-08-15'), target_date: day('2026-09-15'), status: 'planned' }, // 仍 planned
    ],
    NOW,
  )
  assert.deepEqual(groups, [{ status: 'active', ids: ['far'] }])
})

test('planStatusRecompute：同一目标状态的多行合并成一组,组序稳定', () => {
  const groups = planStatusRecompute(
    [
      { id: 'a', ...STUCK_MISSED_FAR },  // → active
      { id: 'b', ...STUCK_MISSED_NEAR }, // → at_risk
      { id: 'c', ...STUCK_AT_RISK },     // → active
      { id: 'd', start_date: day('2026-10-01'), target_date: day('2026-12-01'), status: 'at_risk' }, // → planned
    ],
    NOW,
  )
  // 组序按固定的状态次序输出(不随入参顺序漂移),便于断言与日志比对
  assert.deepEqual(groups, [
    { status: 'at_risk', ids: ['b'] },
    { status: 'active',  ids: ['a', 'c'] },
    { status: 'planned', ids: ['d'] },
  ])
})

test('planStatusRecompute：全都不需要改时返回空数组,一条 UPDATE 都不发', () => {
  assert.deepEqual(
    planStatusRecompute(
      [
        { id: 'a', start_date: day('2026-08-17'), target_date: day('2026-08-28'), status: 'missed' },
        { id: 'b', start_date: day('2026-06-01'), target_date: day('2026-09-03'), status: 'at_risk' },
        { id: 'c', start_date: day('2026-08-15'), target_date: day('2026-09-15'), status: 'planned' },
        { id: 'd', ...DATES, status: 'active' },
      ],
      NOW,
    ),
    [],
  )
})

test('planStatusRecompute：空入参返回空数组', () => {
  assert.deepEqual(planStatusRecompute([], NOW), [])
})
