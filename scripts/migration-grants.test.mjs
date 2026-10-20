import test from 'node:test'
import assert from 'node:assert/strict'
import { createdPublicTables, tablesMissingServiceRoleGrant } from './migration-grants.mjs'

test('finds unqualified, public-qualified and quoted tables; skips other schemas', () => {
  const sql = `
    create table if not exists foo (id int);
    CREATE TABLE public.bar (id int);
    create table "public"."Baz" (id int);
    create table private.secret (id int);
  `
  assert.deepEqual(createdPublicTables(sql), ['foo', 'bar', 'baz'])
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
