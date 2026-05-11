import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrations = [
  'supabase/migrations/010_pmo_activity_events.sql',
  'supabase/migrations/011_fix_activity_actor_type_casts.sql',
].map((path) => [path, readFileSync(path, 'utf8')] as const)

for (const [path, migration] of migrations) {
  test(`${path} casts record_activity actor_type CASE result to activity_actor_type`, () => {
    assert.match(
      migration,
      /case\s+when\s+v_actor_id\s+is\s+not\s+null\s+then\s+'user'::activity_actor_type\s+else\s+'system'::activity_actor_type\s+end/i
    )
  })

  test(`${path} casts record_message_activity actor_type CASE result to activity_actor_type`, () => {
    assert.match(
      migration,
      /case\s+when\s+new\.sender_type\s+=\s+'agent'\s+then\s+'agent'::activity_actor_type\s+when\s+v_actor_id\s+is\s+not\s+null\s+then\s+'user'::activity_actor_type\s+else\s+'system'::activity_actor_type\s+end/i
    )
  })
}
