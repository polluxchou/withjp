import { createHash } from 'node:crypto'

// Applied-migrations ledger (see supabase/migrations/README.md「已应用账本」).
//
// Migrations here are pasted into the Supabase SQL Editor by hand. Until this
// ledger existed the file name was the only record of "applied or not", and a
// file that was merged but never run went unnoticed twice (2026-08-08
// notifications 500, 2026-08-09 checkpointer tables without RLS).
//
// Every migration at or after LEDGER_CHECK_FROM ends with a block that records
// itself in public.applied_migrations. The block is the last statement, so it
// only lands when everything above it ran. `npm run migrations:stamp` writes the
// block; `npm run audit:migrations` diffs this directory against the table.

// The migration that creates the ledger table. Older files are covered by the
// one-off backfill migration instead of a block of their own.
export const LEDGER_CHECK_FROM = '20261110084920'

// Everything from this line down is the generated block. The checksum covers
// the SQL above it, so the block never has to contain its own hash.
export const LEDGER_MARKER = '-- @applied-migrations-ledger'

const MARKER_NOTE = '（由 npm run migrations:stamp 生成，勿手改；改了上面的 SQL 要重新生成）'

function normalize(text) {
  return text.replace(/\r\n?/g, '\n')
}

// The part of a migration the checksum covers: everything above the marker
// line, or the whole file when it has none (pre-ledger migrations).
export function migrationBody(content) {
  const text = normalize(content)
  const lines = text.split('\n')
  const at = lines.findIndex((line) => line.startsWith(LEDGER_MARKER))
  const body = at < 0 ? text : lines.slice(0, at).join('\n')
  return body.trimEnd() + '\n'
}

// Line endings and trailing blank lines are normalized first, so a Windows
// checkout or an editor's final-newline setting cannot change the hash.
export function migrationChecksum(content) {
  return createHash('sha256').update(migrationBody(content), 'utf8').digest('hex')
}

export function ledgerBlock(filename, content) {
  return [
    `${LEDGER_MARKER}${MARKER_NOTE}`,
    'insert into public.applied_migrations (filename, checksum)',
    `values ('${filename}', '${migrationChecksum(content)}')`,
    'on conflict (filename) do update',
    '  set checksum = excluded.checksum, applied_at = now(), backfilled = false;',
    '',
  ].join('\n')
}

// Append the block, or refresh it when the SQL above it changed.
export function stampMigration(filename, content) {
  return `${migrationBody(content)}\n${ledgerBlock(filename, content)}`
}

// Problems that stop a migration from recording itself correctly. Comparing
// against the generated text (rather than parsing the INSERT) also guarantees
// the block is the last thing in the file and names this file.
export function ledgerProblems(filename, content) {
  const text = normalize(content)
  const lines = text.split('\n')
  const markers = lines.filter((line) => line.startsWith(LEDGER_MARKER)).length
  if (markers === 0) return ['缺少账本登记语句']
  if (markers > 1) return ['出现多个账本登记标记，只能有一段且位于文件末尾']
  const at = lines.findIndex((line) => line.startsWith(LEDGER_MARKER))
  const actual = lines.slice(at).join('\n').trimEnd()
  const expected = ledgerBlock(filename, content).trimEnd()
  if (actual !== expected) return ['账本登记语句与文件名或内容校验和不一致（SQL 改过或文件改名后没有重新生成）']
  return []
}

// Diff the repo against the ledger. `files` is [{ filename, content }],
// `rows` is [{ filename, checksum }] read from public.applied_migrations.
//   missing — in the repo, not in the ledger: merged but never run
//   changed — recorded with a different checksum: edited after it was run
//   unknown — in the ledger, not in the repo: renamed or deleted file
export function compareLedger(files, rows) {
  const recorded = new Map(rows.map((row) => [row.filename, row.checksum]))
  const names = new Set(files.map((file) => file.filename))
  const missing = []
  const changed = []
  for (const { filename, content } of [...files].sort((a, b) => a.filename.localeCompare(b.filename))) {
    if (!recorded.has(filename)) missing.push(filename)
    else if (recorded.get(filename) !== migrationChecksum(content)) changed.push(filename)
  }
  const unknown = rows.map((row) => row.filename).filter((name) => !names.has(name)).sort()
  return { missing, changed, unknown }
}
