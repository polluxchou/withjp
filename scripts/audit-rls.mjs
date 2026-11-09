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
//   Exits 1 when any table has RLS disabled, or when a browser-side role holds
//   table privileges it should not.
//
// Third finding, also a FAIL (added 2026-11):
//   * Client-role grants    — anon / authenticated holding any table privilege
//                             outside CLIENT_GRANT_ALLOWLIST. Every server read
//                             and write goes through service_role; the two
//                             browser roles are used for sign-in only. A stray
//                             grant plus a permissive policy lets any signed-in
//                             user bypass the API's permission checks by talking
//                             to PostgREST directly, and TRUNCATE is not gated by
//                             RLS at all. "RLS enabled + has a policy" says
//                             nothing about this, so it is checked on its own.

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

// Tables a browser-side role may touch, and exactly which privileges. Anything
// else held by anon / authenticated fails the audit. Adding a row here is the
// deliberate act of opening a table to direct browser access — it needs a
// matching RLS policy in the same migration.
const CLIENT_GRANT_ALLOWLIST = {
  authenticated: {
    broadcast_accounts: ['SELECT'],
    site_members: ['SELECT'],
    site_news: ['SELECT'],
    user_salary: ['SELECT'],
    users: ['SELECT'],
  },
  anon: {},
}

const GRANTS_SQL = `
select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated')
 group by grantee, table_name
 order by grantee, table_name
`

function query(sql) {
  try {
    return execFileSync('psql', [dbUrl, '-X', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
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
}

const raw = query(SQL)

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

const strayGrants = query(GRANTS_SQL)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [grantee, table, privs] = line.split('|')
    const allowed = CLIENT_GRANT_ALLOWLIST[grantee]?.[table] ?? []
    return { grantee, table, extra: privs.split(',').filter((p) => !allowed.includes(p)) }
  })
  .filter((g) => g.extra.length)

if (strayGrants.length) {
  console.error('audit-rls failed: browser-side roles hold table privileges outside the allowlist. A signed-in user can reach these tables through PostgREST directly, bypassing the API:')
  for (const g of strayGrants) console.error(`  ${g.grantee} on ${g.table}: ${g.extra.join(',')}`)
  console.error('\nFix: revoke all on table public.<name> from anon, authenticated; (see supabase/migrations/20261110084614_revoke_client_table_grants.sql)')
  console.error('If the table is meant to be read from the browser, grant the minimum, add an RLS policy, and add it to CLIENT_GRANT_ALLOWLIST in this script.')
  process.exit(1)
}

console.log(`RLS audit OK — ${tables.length} public tables, all with RLS enabled (${denyAll.length} deny-all, ${tables.length - denyAll.length} policy-backed).`)
