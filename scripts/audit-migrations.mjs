// Migration drift audit. Lists the migrations in supabase/migrations/ that the
// live database has no record of running.
//
// Why this exists:
//   Migrations are pasted into the SQL Editor by hand, so "merged" and "applied"
//   are two separate events and nothing used to connect them. Each migration now
//   records itself in public.applied_migrations as its last statement
//   (scripts/migration-ledger.mjs). This script diffs the directory against
//   that table, which turns "did anyone run it?" into a command.
//
// Three findings; the first two fail the run:
//   * missing — file in the repo, no row in the ledger: merged but never run.
//   * changed — row exists with another checksum: the file was edited after it
//               was run, so the database may not match what the file says now.
//   * unknown — row in the ledger, no such file: renamed or deleted. Listed only.
//
// Read-only: the query runs inside `begin transaction read only`.
//
// Run: SUPABASE_DB_URL='postgres://...' npm run audit:migrations
//   The URL lives in agent-service/.env.local. Requires psql on PATH.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { compareLedger } from './migration-ledger.mjs'

const dbUrl = process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.error('audit-migrations: SUPABASE_DB_URL is not set.')
  console.error("Run with: SUPABASE_DB_URL='postgres://...' npm run audit:migrations")
  console.error('The connection string lives in agent-service/.env.local.')
  process.exit(1)
}

// Statements go in on stdin so every psql version prints each result, and the
// whole session is one read-only transaction.
function psql(sql) {
  try {
    return execFileSync('psql', [dbUrl, '-X', '-q', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
      encoding: 'utf8',
      input: `begin transaction read only;\n${sql}\nrollback;\n`,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).split('\n').filter(Boolean)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('audit-migrations: psql not found on PATH. Install postgresql client tools.')
      process.exit(1)
    }
    console.error('audit-migrations: psql failed.')
    console.error((err.stderr?.trim() || err.message).replace(/postgres(?:ql)?:\/\/\S+/g, '<SUPABASE_DB_URL>'))
    process.exit(1)
  }
}

// Checked separately so a database without the ledger gets instructions
// instead of a raw "relation does not exist".
if (psql("select to_regclass('public.applied_migrations') is not null;")[0] !== 't') {
  console.error('audit-migrations failed: public.applied_migrations does not exist in this database.')
  console.error('Run the *_applied_migrations_ledger.sql and *_applied_migrations_backfill.sql migrations first')
  console.error('(supabase/migrations/README.md「已应用账本」).')
  process.exit(1)
}

const lines = psql('select filename, checksum, backfilled from public.applied_migrations order by filename;')

const rows = lines.map((line) => {
  const [filename, checksum, backfilled] = line.split('|')
  return { filename, checksum, backfilled: backfilled === 't' }
})

const dir = path.join(process.cwd(), 'supabase', 'migrations')
const files = fs.readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .map((filename) => ({ filename, content: fs.readFileSync(path.join(dir, filename), 'utf8') }))

const { missing, changed, unknown } = compareLedger(files, rows)

if (unknown.length) {
  console.log('In the ledger but not in the repo (renamed or deleted file) — listed for visibility:')
  for (const name of unknown) console.log(`  ${name}`)
  console.log('')
}

if (missing.length || changed.length) {
  console.error('audit-migrations failed.')
  if (missing.length) {
    console.error('\nNot recorded as applied — run these in the SQL Editor, in file-name order:')
    for (const name of missing) console.error(`  ${name}`)
  }
  if (changed.length) {
    console.error('\nEdited after they were applied (checksum differs from the ledger) — check whether the')
    console.error('change still has to reach the database, then re-run the file to record the new checksum:')
    for (const name of changed) console.error(`  ${name}`)
  }
  process.exit(1)
}

const backfilled = rows.filter((row) => row.backfilled).length
console.log(
  `Migration audit OK — ${files.length} files, all recorded in public.applied_migrations ` +
  `(${backfilled} backfilled, ${rows.length - backfilled - unknown.length} self-recorded).`
)
