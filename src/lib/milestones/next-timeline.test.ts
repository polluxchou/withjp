import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DAY_MS,
  buildUpcomingRange,
  filterUpcomingMilestones,
  getTimelinePosition,
  getTimelineVisual,
  groupTimelineItems,
  shouldNavigateTimelinePress,
  type TimelineMilestone,
} from './next-timeline.ts'

const TODAY = new Date('2026-05-13T12:00:00.000Z')

function localIso(year: number, monthIndex: number, day: number, hour = 0): string {
  return new Date(year, monthIndex, day, hour).toISOString()
}

function ms(overrides: Partial<TimelineMilestone>): TimelineMilestone {
  return {
    id: overrides.id ?? 'm1',
    title: overrides.title ?? 'Milestone',
    target_date: overrides.target_date ?? localIso(2026, 4, 20),
    status: overrides.status ?? 'planned',
    priority: overrides.priority ?? 'medium',
    risk_level: overrides.risk_level ?? 'low',
    owner_agent_id: 'owner_agent_id' in overrides ? overrides.owner_agent_id! : 'owner-1',
  }
}

test('buildUpcomingRange starts at local day boundary and spans selected days', () => {
  const range = buildUpcomingRange(TODAY, 30)
  assert.equal(range.days, 30)
  assert.equal(range.start.getHours(), 0)
  assert.equal(range.start.getMinutes(), 0)
  assert.equal(range.end.getTime() - range.start.getTime(), 30 * DAY_MS)
})

test('filterUpcomingMilestones includes today through the selected range end', () => {
  const milestones = [
    ms({ id: 'past', target_date: localIso(2026, 4, 12, 23) }),
    ms({ id: 'today', target_date: localIso(2026, 4, 13, 8) }),
    ms({ id: 'inside', target_date: localIso(2026, 5, 1) }),
    ms({ id: 'edge', target_date: localIso(2026, 5, 12) }),
    ms({ id: 'future', target_date: localIso(2026, 5, 13) }),
  ]

  const result = filterUpcomingMilestones(milestones, buildUpcomingRange(TODAY, 30))
  assert.deepEqual(result.map((m) => m.id), ['today', 'inside', 'edge'])
})

test('getTimelinePosition maps dates to percentages across the range', () => {
  const range = buildUpcomingRange(TODAY, 30)

  assert.equal(getTimelinePosition(localIso(2026, 4, 13), range), 0)
  assert.equal(getTimelinePosition(localIso(2026, 4, 28), range), 50)
  assert.equal(getTimelinePosition(localIso(2026, 5, 12), range), 100)
})

test('getTimelineVisual prioritizes overdue, risk, attention, completed, and missing owner state', () => {
  assert.equal(getTimelineVisual(ms({ status: 'missed' }), TODAY).tone, 'danger')
  assert.equal(getTimelineVisual(ms({ risk_level: 'high' }), TODAY).tone, 'danger')
  assert.equal(getTimelineVisual(ms({ priority: 'high' }), TODAY).tone, 'warning')
  assert.equal(getTimelineVisual(ms({ status: 'completed' }), TODAY).tone, 'success')
  assert.equal(getTimelineVisual(ms({ owner_agent_id: null }), TODAY).hollow, true)
})

test('groupTimelineItems clusters items that are close together', () => {
  const range = buildUpcomingRange(TODAY, 30)
  const items = filterUpcomingMilestones([
    ms({ id: 'a', target_date: localIso(2026, 4, 18) }),
    ms({ id: 'b', target_date: localIso(2026, 4, 18, 12) }),
    ms({ id: 'c', target_date: localIso(2026, 5, 5) }),
  ], range)

  const groups = groupTimelineItems(items, range, 3)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].milestones.map((m) => m.id), ['a', 'b'])
  assert.deepEqual(groups[1].milestones.map((m) => m.id), ['c'])
})

test('shouldNavigateTimelinePress keeps desktop clicks direct', () => {
  assert.equal(shouldNavigateTimelinePress({
    isTouchLike: false,
    milestoneId: 'a',
    armedMilestoneId: null,
  }), true)
})

test('shouldNavigateTimelinePress requires a second tap for touch-like input', () => {
  assert.equal(shouldNavigateTimelinePress({
    isTouchLike: true,
    milestoneId: 'a',
    armedMilestoneId: null,
  }), false)

  assert.equal(shouldNavigateTimelinePress({
    isTouchLike: true,
    milestoneId: 'a',
    armedMilestoneId: 'b',
  }), false)

  assert.equal(shouldNavigateTimelinePress({
    isTouchLike: true,
    milestoneId: 'a',
    armedMilestoneId: 'a',
  }), true)
})
