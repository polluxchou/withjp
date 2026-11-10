// Regenerates src/lib/supabase/database.types.ts from the live schema.
//
// Run: SUPABASE_DB_URL='postgres://...' npm run gen:types
//   The URL lives in agent-service/.env.local. Uses the Supabase CLI through
//   npx (pinned below); it introspects the catalog directly, no Docker needed.
//
// When to re-run: after every migration that changes the public schema
// (table, column, enum, view, function) has been applied to production —
// the same moment you run `npm run audit:migrations`. Commit the regenerated
// file in a PR of its own or together with the code that uses the new columns.
// The file describes what the database IS, so generate it after applying, not
// from an unapplied migration.
//
// Safety: the connection is opened with default_transaction_read_only=on, so
// the introspection cannot write. The CLI prints the target host on stderr;
// stderr is dropped unless the run fails, and the URL is redacted then.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SUPABASE_CLI = 'supabase@3.1.0'
const OUT = path.join(process.cwd(), 'src', 'lib', 'supabase', 'database.types.ts')

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('gen-db-types: SUPABASE_DB_URL is not set.')
  console.error("Run with: SUPABASE_DB_URL='postgres://...' npm run gen:types")
  console.error('The connection string lives in agent-service/.env.local.')
  process.exit(1)
}

const url = new URL(dbUrl)
const options = [url.searchParams.get('options'), '-c default_transaction_read_only=on'].filter(Boolean).join(' ')
url.searchParams.set('options', options)

const redact = (text) => text.replace(/postgres(?:ql)?:\/\/\S+/g, '<SUPABASE_DB_URL>')

let generated
try {
  generated = execFileSync(
    'npx',
    ['-y', SUPABASE_CLI, 'gen', 'types', 'typescript', `--remote=${url}`, '--schema', 'public', '--agent', 'no'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }
  )
} catch (err) {
  console.error('gen-db-types: supabase gen types failed.')
  console.error(redact(err.stderr?.trim() || err.message))
  process.exit(1)
}

if (!/export type Database\b/.test(generated)) {
  console.error('gen-db-types: CLI output does not look like generated types; file left unchanged.')
  process.exit(1)
}

const HEADER = [
  '// 由 `npm run gen:types`（scripts/gen-db-types.mjs）从线上 schema 生成，勿手改。',
  '// 迁移在线上应用之后重新生成并提交；见 supabase/migrations/README.md「数据库类型」。',
  '',
].join('\n') + '\n'

fs.writeFileSync(OUT, HEADER + generated.trimStart())
execFileSync('npx', ['-y', 'prettier@3.6.2', '--no-config', '--no-semi', '--single-quote', '--print-width', '100', '--write', OUT], {
  stdio: ['ignore', 'ignore', 'inherit'],
})
console.log(`gen-db-types: wrote ${path.relative(process.cwd(), OUT)}`)
