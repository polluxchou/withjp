// RLS audit. Reports every table in the public schema whose row-level security
// posture would let an unauthenticated caller read it.
//
// Why this exists:
//   Migrations here are applied by hand, with no execution ledger — the files in
//   supabase/migrations/ record intent, not state. On 2026-08-09 Supabase raised
//   "Table publicly accessible / rls_disabled_in_public" against the four
//   LangGraph checkpointer tables (checkpoints, checkpoint_blobs,
//   checkpoint_writes, checkpoint_migrations). The migration that fixes them was
//   already sitting in the repo, written and reviewed — it had simply never been
//   run against production. Grepping the migration files would have answered
//   "covered". Only pg_class knew otherwise.
//
//   Hence: query pg_class.relrowsecurity directly. That is authoritative, and it
//   stays correct for tables created outside migrations altogether — which is how
//   the checkpointer tables got there in the first place (agent-service calls
//   AsyncPostgresSaver.setup() at startup, which CREATEs them in public).
//
// Two distinct findings, only one of which fails the run:
//   * RLS disabled          — FAIL. anon and authenticated both hold SELECT on
//                             public tables by default, and the anon key ships in
//                             the browser bundle, so the table is world-readable.
//   * RLS on, zero policies — OK, listed for visibility. This is deliberate
//                             deny-all: the public API is sealed while the backend
//                             still reaches the table over SUPABASE_DB_URL as
//                             `postgres` (rolbypassrls), which RLS never gates.
//
// Run: SUPABASE_DB_URL='postgres://...' node scripts/audit-rls.mjs
//   The URL lives in agent-service/.env.local. Requires psql on PATH.
//   Exits 1 when any table has RLS disabled.

import { execFileSync } from 'node:child_process'

const dbUrl = process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.error('audit-rls: SUPABASE_DB_URL is not set.')
  console.error("Run with: SUPABASE_DB_URL='postgres://...' node scripts/audit-rls.mjs")
  console.error('The connection string lives in agent-service/.env.local.')
  process.exit(1)
}

const SQL = `
select c.relname,
       c.relrowsecurity,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
 order by c.relname
`

let raw
try {
  raw = execFileSync('psql', [dbUrl, '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', SQL], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error('audit-rls: psql not found on PATH. Install postgresql client tools.')
    process.exit(1)
  }
  console.error('audit-rls: psql failed.')
  console.error(err.stderr?.trim() || err.message)
  process.exit(1)
}

const tables = raw
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [name, rls, policies] = line.split('|')
    return { name, rls: rls === 't', policies: Number(policies) }
  })

if (!tables.length) {
  console.error('audit-rls: no tables found in the public schema — is SUPABASE_DB_URL pointing at the right database?')
  process.exit(1)
}

const unprotected = tables.filter((t) => !t.rls)
const denyAll = tables.filter((t) => t.rls && t.policies === 0)

if (denyAll.length) {
  console.log(`Deny-all (RLS on, no policies) — public API sealed, backend direct connection unaffected:`)
  for (const t of denyAll) console.log(`  ${t.name}`)
  console.log('')
}

if (unprotected.length) {
  console.error('audit-rls failed: RLS is disabled on these public tables. Anyone holding the anon key — which ships in the browser bundle — can read them:')
  for (const t of unprotected) {
    console.error(`  ${t.name}${t.policies ? ` (has ${t.policies} policy/policies, but they are inert while RLS is off)` : ''}`)
  }
  console.error('\nFix: alter table <name> enable row level security; then add a policy, or leave it policy-less for a backend-only table.')
  console.error('Write it as a migration in supabase/migrations/ AND run it — a committed migration is not an applied one.')
  process.exit(1)
}

console.log(`RLS audit OK — ${tables.length} public tables, all with RLS enabled (${denyAll.length} deny-all, ${tables.length - denyAll.length} policy-backed).`)
