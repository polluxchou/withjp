import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 迁移改成时间戳命名后这两个路径跟着变了（旧名 010_pmo_activity_events /
// 011_fix_activity_actor_type_casts，对照表见 supabase/migrations/README.md 附录）。
// 这个断言按路径读文件，改名不同步就直接 ENOENT——而 npm test 不在任何 CI
// workflow 里（只有 copy 和 migrations 两个），所以只能靠本地跑到。
const migrations = [
  'supabase/migrations/20260510190412_pmo_activity_events.sql',
  'supabase/migrations/20260511142957_fix_activity_actor_type_casts.sql',
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
