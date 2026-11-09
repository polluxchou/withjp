import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LEDGER_CHECK_FROM,
  LEDGER_MARKER,
  compareLedger,
  ledgerProblems,
  migrationChecksum,
  stampMigration,
} from './migration-ledger.mjs'

const NAME = '20270101000000_add_thing.sql'
const SQL = 'alter table public.foo add column if not exists bar int;\n'
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

test('checksum is the sha256 of the SQL, independent of line endings and trailing blank lines', () => {
  assert.equal(migrationChecksum(SQL), sha(SQL))
  assert.equal(migrationChecksum(SQL.replace(/\n/g, '\r\n')), sha(SQL))
  assert.equal(migrationChecksum(SQL + '\n\n'), sha(SQL))
  assert.equal(migrationChecksum(SQL.trimEnd()), sha(SQL))
})

test('checksum changes when the SQL changes', () => {
  assert.notEqual(migrationChecksum(SQL), migrationChecksum(SQL.replace('int', 'bigint')))
})

test('checksum ignores the registration block, so stamping does not change it', () => {
  assert.equal(migrationChecksum(stampMigration(NAME, SQL)), migrationChecksum(SQL))
})

test('stamped file records its own name and checksum as the last statement', () => {
  const stamped = stampMigration(NAME, SQL)
  assert.ok(stamped.startsWith(SQL))
  const block = stamped.slice(stamped.indexOf(LEDGER_MARKER))
  assert.match(block, /insert into public\.applied_migrations \(filename, checksum\)/)
  assert.ok(block.includes(`values ('${NAME}', '${sha(SQL)}')`))
  assert.match(block, /on conflict \(filename\) do update/)
  assert.ok(stamped.trimEnd().endsWith(';'))
})

test('stamping twice is a no-op; stamping after an edit refreshes the checksum', () => {
  const stamped = stampMigration(NAME, SQL)
  assert.equal(stampMigration(NAME, stamped), stamped)
  const edited = stamped.replace('bar int', 'bar bigint')
  const restamped = stampMigration(NAME, edited)
  assert.ok(restamped.includes(sha(SQL.replace('bar int', 'bar bigint'))))
  assert.ok(!restamped.includes(sha(SQL)))
  assert.equal(restamped.split(LEDGER_MARKER).length, 2)
})

test('a correctly stamped file has no problems', () => {
  assert.deepEqual(ledgerProblems(NAME, stampMigration(NAME, SQL)), [])
})

test('flags a file with no registration block', () => {
  assert.match(ledgerProblems(NAME, SQL)[0], /缺少账本登记语句/)
})

test('a marker that only appears mid-line in a comment does not count as a block', () => {
  const sql = `-- see ${LEDGER_MARKER} in the README\n${SQL}`
  assert.match(ledgerProblems(NAME, sql)[0], /缺少账本登记语句/)
})

test('flags SQL edited after stamping', () => {
  const edited = stampMigration(NAME, SQL).replace('bar int', 'bar bigint')
  assert.match(ledgerProblems(NAME, edited)[0], /不一致/)
})

test('flags a block copied from another migration', () => {
  const copied = stampMigration('20270101000001_other.sql', SQL)
  assert.match(ledgerProblems(NAME, copied)[0], /不一致/)
})

test('flags SQL appended after the block', () => {
  const appended = stampMigration(NAME, SQL) + 'drop table public.foo;\n'
  assert.match(ledgerProblems(NAME, appended)[0], /不一致/)
})

test('flags a hand-edited block that would not record the run', () => {
  const stamped = stampMigration(NAME, SQL)
  const commented = stamped.replace('insert into public.applied_migrations', '-- insert into public.applied_migrations')
  assert.match(ledgerProblems(NAME, commented)[0], /不一致/)
})

test('flags two blocks', () => {
  const stamped = stampMigration(NAME, SQL)
  const doubled = stamped + stamped.slice(stamped.indexOf(LEDGER_MARKER))
  assert.match(ledgerProblems(NAME, doubled)[0], /多个/)
})

test('compareLedger separates never-run, edited-after-run and renamed files', () => {
  const files = [
    { filename: '20270101000002_c.sql', content: 'select 3;\n' },
    { filename: '20270101000000_a.sql', content: stampMigration('20270101000000_a.sql', 'select 1;\n') },
    { filename: '20270101000001_b.sql', content: 'select 2;\n' },
    { filename: '20270101000003_d.sql', content: 'select 4;\n' },
  ]
  const rows = [
    { filename: '20270101000000_a.sql', checksum: sha('select 1;\n') },
    { filename: '20270101000001_b.sql', checksum: sha('select 22;\n') },
    { filename: '20260101000000_gone.sql', checksum: sha('x') },
  ]
  assert.deepEqual(compareLedger(files, rows), {
    missing: ['20270101000002_c.sql', '20270101000003_d.sql'],
    changed: ['20270101000001_b.sql'],
    unknown: ['20260101000000_gone.sql'],
  })
})

test('compareLedger is clean when every file is recorded with its checksum', () => {
  const files = [{ filename: NAME, content: stampMigration(NAME, SQL) }]
  const rows = [{ filename: NAME, checksum: sha(SQL) }]
  assert.deepEqual(compareLedger(files, rows), { missing: [], changed: [], unknown: [] })
})

function runChecker(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'migration-ledger-'))
  try {
    const migrations = path.join(root, 'supabase', 'migrations')
    mkdirSync(migrations, { recursive: true })
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(migrations, name), content)
    const checker = fileURLToPath(new URL('./check-migrations.mjs', import.meta.url))
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('migration CLI rejects a new migration without a registration block', () => {
  const result = runChecker({ [NAME]: SQL })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /缺少账本登记语句/)
  assert.match(result.stderr, /migrations:stamp/)
})

test('migration CLI rejects a stale registration block', () => {
  const result = runChecker({ [NAME]: stampMigration(NAME, SQL).replace('bar int', 'bar bigint') })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /不一致/)
})

test('migration CLI accepts a stamped migration and leaves pre-ledger files alone', () => {
  const before = `${String(Number(LEDGER_CHECK_FROM) - 1)}_old.sql`
  const result = runChecker({ [NAME]: stampMigration(NAME, SQL), [before]: SQL })
  assert.equal(result.status, 0, result.stderr)
})

test('migration CLI applies the rule from the threshold timestamp itself', () => {
  const result = runChecker({ [`${LEDGER_CHECK_FROM}_first.sql`]: SQL })
  assert.equal(result.status, 1)
})

test('stamp CLI writes the block and the checker then passes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'migration-ledger-'))
  try {
    const migrations = path.join(root, 'supabase', 'migrations')
    mkdirSync(migrations, { recursive: true })
    writeFileSync(path.join(migrations, NAME), SQL)
    const stamp = fileURLToPath(new URL('./stamp-migration.mjs', import.meta.url))
    const checker = fileURLToPath(new URL('./check-migrations.mjs', import.meta.url))
    assert.equal(spawnSync(process.execPath, [stamp], { cwd: root, encoding: 'utf8' }).status, 0)
    assert.equal(readFileSync(path.join(migrations, NAME), 'utf8'), stampMigration(NAME, SQL))
    assert.equal(spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' }).status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("this repo's migrations at or after the threshold are all stamped", () => {
  const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
  const ledger = readFileSync(path.join(dir, `${LEDGER_CHECK_FROM}_applied_migrations_ledger.sql`), 'utf8')
  assert.deepEqual(ledgerProblems(`${LEDGER_CHECK_FROM}_applied_migrations_ledger.sql`, ledger), [])
})
