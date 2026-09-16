import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMilestoneOverview, formatMilestoneDate, getMilestoneDaysLeft, groupMilestonesForList } from './list-view.ts'
import type { Milestone } from '../types/index.ts'

const now = new Date('2026-09-09T18:00:00Z') // September 10 in Tokyo
const row = (id: string, status: Milestone['status'], date: string, completed: string | null = null) => ({ id, status, target_date: date, completed_date: completed })

test('groups open work by urgency and keeps completed milestones out of overdue', () => {
  const rows = [row('done','completed','2026-08-10','2026-08-10'), row('planned','planned','2026-10-10'), row('active','active','2026-10-01'), row('due','active','2026-09-15'), row('late','active','2026-09-01')]
  const before = structuredClone(rows)
  assert.deepEqual(groupMilestonesForList(rows, now).map(g => [g.key, g.milestones.map(m => m.id)]), [
    ['overdue',['late']], ['due',['due']], ['active',['active']], ['planned',['planned']], ['completed',['done']],
  ])
  assert.deepEqual(rows, before)
})
test('completion date wins, legacy completion stays archived, cancelled completion counts down', () => {
  const groups = groupMilestonesForList([row('date','missed','2026-08-10','2026-08-10'), row('legacy','completed','2026-08-11'), row('cancelled','active','2026-08-12')], now)
  assert.deepEqual(groups.map(g=>[g.key,g.milestones.map(m=>m.id)]), [['overdue',['cancelled']],['completed',['legacy','date']]])
})
test('groups sort by target dates and completed groups by newest completion', () => {
  const result = groupMilestonesForList([row('b','active','2026-10-01'),row('a','active','2026-10-01'),row('old','completed','2026-08-01','2026-08-01'),row('new','completed','2026-07-01','2026-09-01')],now)
  assert.deepEqual(result.map(g=>g.milestones.map(m=>m.id)),[['a','b'],['new','old']])
  assert.deepEqual(groupMilestonesForList([],now),[])
})
test('countdown respects Tokyo business day and the date stamp in western timezones', () => {
  assert.equal(getMilestoneDaysLeft('2026-09-10T00:00:00Z',now),0)
  assert.equal(getMilestoneDaysLeft('2026-09-09',now),-1)
  assert.equal(getMilestoneDaysLeft('2026-09-17',now),7)
  assert.equal(getMilestoneDaysLeft('invalid',now),0)
})
test('dates localize without timezone shifts and retain years across business-year boundaries', () => {
  assert.match(formatMilestoneDate('2026-08-27T00:00:00Z','zh',now),/08月27日/)
  assert.match(formatMilestoneDate('2026-08-27','en',now),/Aug 27/)
  assert.match(formatMilestoneDate('2026-08-27','ja',now),/08月27日/)
  assert.match(formatMilestoneDate('2025-08-27','zh',now),/2025/)
  assert.match(formatMilestoneDate('2026-08-27','zh',now,true),/2026/)
  assert.doesNotMatch(formatMilestoneDate('2027-01-01','en',new Date('2026-12-31T18:00:00Z')),/2027/)
  assert.equal(formatMilestoneDate(null,'en',now),'—')
  assert.equal(formatMilestoneDate('invalid','en',now),'—')
})
test('overview merges colliding dates, assigns chronological numbers and keeps markers apart', () => {
  const rows = [row('c','active','2026-12-01'),row('b','completed','2026-08-10'),row('a','active','2026-08-10')]
  const before = structuredClone(rows)
  const overview = buildMilestoneOverview(rows,now)
  assert.deepEqual(overview.numbers,{a:1,b:2,c:3})
  assert.deepEqual(overview.groups.map(g=>g.milestones.map(m=>m.id)),[['a','b'],['c']])
  overview.groups.forEach((group, index) => {
    assert.ok(Number.isFinite(group.x) && group.x>=5 && group.x<=95)
    if (index) assert.ok(group.x-overview.groups[index-1].x>=8)
  })
  assert.ok(overview.todayX>=5 && overview.todayX<=95)
  assert.ok(overview.ticks.length<=7)
  assert.deepEqual(rows,before)
})
test('overview handles empty, invalid and long-range dates without NaN or missing list rows', () => {
  for (const rows of [[],[row('bad','planned','invalid')]]) {
    const result=buildMilestoneOverview(rows,now)
    assert.deepEqual(result.groups,[])
    assert.ok(Number.isFinite(result.todayX))
  }
  assert.equal(groupMilestonesForList([row('bad','planned','invalid')],now).flatMap(g=>g.milestones).length,1)
  const result=buildMilestoneOverview([row('old','completed','2020-01-01'),row('future','planned','2030-01-01')],now)
  assert.ok(result.ticks.length<=7)
  assert.ok(result.groups.every(g=>Number.isFinite(g.x)))
})
