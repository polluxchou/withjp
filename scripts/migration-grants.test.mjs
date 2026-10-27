import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createdPublicTables, tablesMissingServiceRoleGrant } from './migration-grants.mjs'
import * as grantChecks from './migration-grants.mjs'

test('finds unqualified, public-qualified and quoted tables; skips other schemas', () => {
  const sql = `
    create table if not exists foo (id int);
    CREATE TABLE public.bar (id int);
    create table "public"."Baz" (id int);
    create table private.secret (id int);
  `
  assert.deepEqual(createdPublicTables(sql), ['foo', 'bar', 'Baz'])
})

test('ignores create table inside comments', () => {
  assert.deepEqual(createdPublicTables('-- create table foo (id int);\n/* create table bar */'), [])
})

test('flags a new table with no service_role grant', () => {
  const sql = `
    create table public.foo (id int);
    grant select on public.foo to authenticated;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('accepts service_role grant in a multi-role, multi-table statement', () => {
  const sql = `
    create table foo (id int);
    create table public.bar (id int);
    grant select, insert, update, delete on table public.foo, bar to authenticated, service_role;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), [])
})

test('only the table that lacks a grant is reported', () => {
  const sql = `
    create table foo (id int);
    create table bar (id int);
    grant all on foo to service_role;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['bar'])
})

test('schema-wide grant to service_role covers every table', () => {
  const sql = `
    create table foo (id int);
    grant all on all tables in schema public to service_role;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), [])
})

test('a grant to service_role in a commented-out line does not count', () => {
  const sql = `
    create table foo (id int);
    -- grant all on foo to service_role;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('a SELECT-only grant does not satisfy server write access', () => {
  const sql = 'create table public.foo (id int); grant select on public.foo to service_role;'
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('a later revoke removes an earlier grant', () => {
  const sql = `
    create table public.foo (id int);
    grant all on public.foo to service_role;
    revoke insert on public.foo from service_role;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('schema-wide grants before creation do not cover future tables', () => {
  const sql = `
    grant all on all tables in schema public to service_role;
    create table public.foo (id int);
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('serial-backed insert needs sequence USAGE or UPDATE', () => {
  const sql = `
    create table public.foo (id serial primary key);
    grant select, insert, update, delete on public.foo to service_role;
  `
  assert.deepEqual(grantChecks.sequencesMissingServiceRoleGrant?.(sql), ['foo_id_seq'])
})

test('a sequence USAGE grant after creation satisfies serial-backed insert', () => {
  const sql = `
    create table public.foo (id bigserial primary key);
    grant usage on sequence public.foo_id_seq to service_role;
    grant all on public.foo to service_role;
  `
  assert.deepEqual(grantChecks.sequencesMissingServiceRoleGrant?.(sql), [])
})

test('sequence grant before creation does not cover later serial sequence', () => {
  const sql = `
    grant usage on all sequences in schema public to service_role;
    create table public.foo (id smallserial primary key);
    grant all on public.foo to service_role;
  `
  assert.deepEqual(grantChecks.sequencesMissingServiceRoleGrant?.(sql), ['foo_id_seq'])
})

test('schema-wide sequence grant after creation covers a serial sequence', () => {
  const sql = `
    create table public.foo (id serial primary key);
    grant usage on all sequences in schema public to service_role;
  `
  assert.deepEqual(grantChecks.sequencesMissingServiceRoleGrant?.(sql), [])
})

test('an explicit nextval default needs access to its sequence', () => {
  const sql = `
    create sequence public.ticket_ids;
    grant usage on sequence public.ticket_ids to service_role;
    create table public.tickets (id bigint default nextval('public.ticket_ids'::regclass));
  `
  assert.deepEqual(grantChecks.sequencesMissingServiceRoleGrant?.(sql), [])
})

test('a later sequence revoke removes its usage grant', () => {
  const sql = `
    create table public.foo (id serial primary key);
    grant usage on sequence public.foo_id_seq to service_role;
    revoke usage on sequence public.foo_id_seq from service_role;
  `
  assert.deepEqual(grantChecks.sequencesMissingServiceRoleGrant?.(sql), ['foo_id_seq'])
})

test('identity columns do not require a separate sequence grant for insert', () => {
  const sql = 'create table public.foo (id bigint generated always as identity primary key);'
  assert.deepEqual(grantChecks.sequencesMissingServiceRoleGrant?.(sql), [])
})

test('a GRANT mentioned inside a dollar-quoted body is not executed', () => {
  const sql = `
    create table public.foo (id int);
    do $$ begin raise notice 'grant all on public.foo to service_role;'; end $$;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('non-BMP text in comments does not shift SQL token positions', () => {
  const sql = 'create table public.foo (id int); /*🔒*/grant all on public.foo to service_role;'
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), [])
})

test('recreating a table loses the old object grant', () => {
  const sql = `
    create table public.foo (id int);
    grant all on public.foo to service_role;
    drop table public.foo;
    create table public.foo (id int);
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('REVOKE CASCADE still revokes the service role grant', () => {
  const sql = `
    create table public.foo (id int);
    grant all on public.foo to service_role;
    revoke insert on public.foo from service_role cascade;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('nextval default added by ALTER TABLE needs sequence access', () => {
  const sql = `
    create sequence public.foo_id_seq;
    create table public.foo (id bigint);
    alter table public.foo alter column id set default nextval('public.foo_id_seq'::regclass);
    grant all on public.foo to service_role;
  `
  assert.deepEqual(grantChecks.sequencesMissingServiceRoleGrant?.(sql), ['foo_id_seq'])
})

test('quoted mixed-case table is distinct from unquoted lowercase table', () => {
  const sql = `
    create table public.foo (id int);
    create table public."Foo" (id int);
    grant all on public.foo to service_role;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['Foo'])
})

test('unqualified GRANT follows the active search_path', () => {
  const sql = `
    create schema if not exists private;
    create table private.foo (id int);
    create table public.foo (id int);
    set search_path = private, public;
    grant all on foo to service_role;
  `
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('unqualified CREATE TABLE follows the active search_path', () => {
  const sql = 'set search_path = private, public; create table foo (id int);'
  assert.deepEqual(createdPublicTables(sql), [])
})

test('GRANT text inside an E-string does not count', () => {
  const sql = String.raw`create table public.foo (id int); select E'can\'t grant all on public.foo to service_role;';`
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('nested block comments cannot smuggle a GRANT', () => {
  const sql = 'create table public.foo (id int); /* outer /* inner */ grant all on public.foo to service_role; */'
  assert.deepEqual(tablesMissingServiceRoleGrant(sql), ['foo'])
})

test('unqualified sequence GRANT follows the active search_path', () => {
  const sql = `
    create schema if not exists private;
    create sequence private.foo_id_seq;
    create table public.foo (id serial primary key);
    set search_path = private, public;
    grant usage on sequence foo_id_seq to service_role;
  `
  assert.deepEqual(grantChecks.sequencesMissingServiceRoleGrant?.(sql), ['foo_id_seq'])
})

test('unsupported table-creating SQL is rejected for manual review', () => {
  const cases = [
    "do $$ begin execute 'create table public.foo (id int)'; end $$;",
    'select 1 as id into public.foo;',
    'alter table private.foo set schema public;',
  ]
  for (const sql of cases) {
    assert.ok(grantChecks.unsupportedTableCreation?.(sql)?.length > 0, sql)
  }
})

test('policy-only DO block does not trigger unsupported table creation', () => {
  const sql = "do $$ begin execute 'create policy p on public.foo using (true)'; end $$;"
  assert.deepEqual(grantChecks.unsupportedTableCreation?.(sql), [])
})

test('migration CLI rejects a serial table missing its sequence grant', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'migration-grants-'))
  try {
    const migrations = path.join(root, 'supabase', 'migrations')
    mkdirSync(migrations, { recursive: true })
    writeFileSync(path.join(migrations, '20261027000000_serial_table.sql'), `
      create table public.foo (id serial primary key);
      grant select, insert, update, delete on public.foo to service_role;
    `)
    const checker = fileURLToPath(new URL('./check-migrations.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /foo_id_seq/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('migration CLI rejects unsupported SELECT INTO table creation', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'migration-grants-'))
  try {
    const migrations = path.join(root, 'supabase', 'migrations')
    mkdirSync(migrations, { recursive: true })
    writeFileSync(path.join(migrations, '20261027000000_select_into.sql'),
      'select 1 as id into public.foo;')
    const checker = fileURLToPath(new URL('./check-migrations.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /SELECT INTO/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
