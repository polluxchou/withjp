import test from 'node:test'
import assert from 'node:assert/strict'
import { pickMilestoneFields } from './fields.ts'

const full = {
  title: 'Launch',
  description: null,
  type: 'launch',
  level: 'company',
  priority: 'high',
  risk_level: 'low',
  owner_agent_id: 'a1',
  involved_agent_ids: ['a1', 'a2'],
  linked_creator_ids: [],
  parent_milestone_id: null,
  start_date: '2026-11-01',
  target_date: '2026-12-01',
  completed_date: '',
  success_metric: { gmv: 100 },
  notes: 'n',
}

test('accepts what the milestone form sends', () => {
  assert.deepEqual(pickMilestoneFields(full), { ok: true, fields: { ...full } })
})

test('drops keys outside the whitelist', () => {
  const r = pickMilestoneFields({ title: 'x', id: 'y', created_by_user_id: 'z', updated_at: 'now' })
  assert.deepEqual(r, { ok: true, fields: { title: 'x' } })
})

test('present-but-null keys become null, as PATCH always did', () => {
  assert.deepEqual(pickMilestoneFields({ notes: undefined, owner_agent_id: null }), {
    ok: true,
    fields: { notes: null, owner_agent_id: null },
  })
})

test('rejects values the database would refuse', () => {
  for (const body of [
    { type: 'party' },
    { status: 'COMPLETED' },
    { level: null },
    { title: '' },
    { title: 5 },
    { start_date: null },
    { involved_agent_ids: 'a1' },
    { linked_creator_ids: [1] },
    { success_metric: [] },
    { success_metric: null },
    { notes: 1 },
    { completed_date: 20261101 },
  ]) {
    assert.equal(pickMilestoneFields(body).ok, false, JSON.stringify(body))
  }
})
