// Supabase stops auto-granting Data API access to newly created tables in the
// "public" schema on 2026-10-30. A table created after that without an explicit
// GRANT is unreachable through supabase-js/PostgREST ("permission denied") —
// including for service_role, which every server route uses (src/lib/supabase/server.ts).
//
// Rule enforced for migrations at or after GRANT_CHECK_FROM: every new public
// table needs service_role CRUD, and serial/nextval sequences need USAGE or UPDATE.
// Grants to anon/authenticated are per-table decisions and are not forced.

// Everything newer than the last migration that existed when the rule was added.
// Files from before this rely on the old auto-grant and are already applied.
export const GRANT_CHECK_FROM = '20261020000000'

const IDENT = String.raw`"?([A-Za-z_][A-Za-z0-9_]*)"?`

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

// Tables created in public: schema-qualified as public, or unqualified (search_path
// default). Tables in other schemas are not exposed by the Data API grant change.
export function createdPublicTables(sql) {
  const re = new RegExp(
    String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:${IDENT}\s*\.\s*)?${IDENT}`,
    'gi'
  )
  const tables = new Set()
  for (const m of stripComments(sql).matchAll(re)) {
    const schema = m[1]?.toLowerCase()
    if (schema && schema !== 'public') continue
    tables.add(m[2].toLowerCase())
  }
  return [...tables]
}

const TABLE_PRIVILEGES = ['select', 'insert', 'update', 'delete']

function namedPublicTargets(target) {
  return target.replace(/^table\s+/i, '').split(',').map((part) => {
    const name = part.trim().replace(/"/g, '').toLowerCase()
    const [schema, table] = name.includes('.') ? name.split('.') : ['public', name]
    return schema === 'public' ? table : null
  }).filter(Boolean)
}

function serviceRoleAclEvents(sql) {
  const re = /\b(grant|revoke)\s+([^;]+?)\s+on\s+([^;]+?)\s+(?:to|from)\s+([^;]+?);/gi
  return [...sql.matchAll(re)].filter((m) =>
    m[4].split(',').some((role) => role.trim().replace(/"/g, '').toLowerCase() === 'service_role')
  ).map((m) => ({
    index: m.index,
    kind: m[1].toLowerCase(),
    all: /\ball\b/i.test(m[2]),
    privileges: /\ball\b/i.test(m[2]) ? TABLE_PRIVILEGES :
      m[2].split(',').map((p) => p.trim().toLowerCase()),
    target: m[3].trim(),
  }))
}

// Report missing CRUD privileges after applying grants and revokes in SQL order.
// A schema-wide grant affects only tables already created at that point.
export function missingTablePrivileges(sql) {
  const clean = stripComments(sql)
  const createRe = new RegExp(
    String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:${IDENT}\s*\.\s*)?${IDENT}`,
    'gi'
  )
  const events = [...clean.matchAll(createRe)].map((m) => ({
    index: m.index,
    kind: 'create',
    schema: m[1]?.toLowerCase() ?? 'public',
    table: m[2].toLowerCase(),
  })).concat(serviceRoleAclEvents(clean)).sort((a, b) => a.index - b.index)
  const tables = new Map()
  for (const event of events) {
    if (event.kind === 'create') {
      if (event.schema === 'public' && !tables.has(event.table)) tables.set(event.table, new Set())
      continue
    }
    if (/^all\s+tables\s+in\s+schema\s+"?public"?$/i.test(event.target)) {
      for (const privileges of tables.values()) {
        for (const privilege of event.privileges) {
          if (event.kind === 'grant') privileges.add(privilege)
          else privileges.delete(privilege)
        }
      }
      continue
    }
    for (const table of namedPublicTargets(event.target)) {
      const privileges = tables.get(table)
      if (!privileges) continue
      for (const privilege of event.privileges) {
        if (event.kind === 'grant') privileges.add(privilege)
        else privileges.delete(privilege)
      }
    }
  }
  return [...tables].map(([table, privileges]) => ({
    table,
    missing: TABLE_PRIVILEGES.filter((p) => !privileges.has(p)),
  })).filter((entry) => entry.missing.length > 0)
}

export function tablesMissingServiceRoleGrant(sql) {
  return missingTablePrivileges(sql).map(({ table }) => table)
}

// SERIAL and explicit nextval() defaults invoke a sequence as the API role.
// Table INSERT does not confer sequence USAGE. Identity columns are different:
// PostgreSQL generates their value without requiring sequence privileges.
export function sequencesMissingServiceRoleGrant(sql) {
  const clean = stripComments(sql)
  const createTableRe = new RegExp(
    String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:${IDENT}\s*\.\s*)?${IDENT}`,
    'gi'
  )
  const createSequenceRe = new RegExp(
    String.raw`\bcreate\s+(?:unlogged\s+)?sequence\s+(?:if\s+not\s+exists\s+)?(?:${IDENT}\s*\.\s*)?${IDENT}`,
    'gi'
  )
  const events = [...clean.matchAll(createTableRe)].map((m) => ({
    index: m.index,
    kind: 'create-table',
    schema: m[1]?.toLowerCase() ?? 'public',
    table: m[2].toLowerCase(),
    statement: clean.slice(m.index, clean.indexOf(';', m.index) + 1),
  })).concat([...clean.matchAll(createSequenceRe)].map((m) => ({
    index: m.index,
    kind: 'create-sequence',
    schema: m[1]?.toLowerCase() ?? 'public',
    sequence: m[2].toLowerCase(),
  })), serviceRoleAclEvents(clean)).sort((a, b) => a.index - b.index)
  const sequences = new Map()
  const required = new Set()
  for (const event of events) {
    if (event.kind === 'create-sequence') {
      if (event.schema === 'public' && !sequences.has(event.sequence)) {
        sequences.set(event.sequence, new Set())
      }
      continue
    }
    if (event.kind === 'create-table') {
      if (event.schema !== 'public') continue
      const serialRe = /\b"?([A-Za-z_][A-Za-z0-9_]*)"?\s+(?:smallserial|serial|bigserial)\b/gi
      for (const m of event.statement.matchAll(serialRe)) {
        const sequence = `${event.table}_${m[1].toLowerCase()}_seq`
        required.add(sequence)
        if (!sequences.has(sequence)) sequences.set(sequence, new Set())
      }
      const nextvalRe = /\bnextval\s*\(\s*'([^']+)'/gi
      for (const m of event.statement.matchAll(nextvalRe)) {
        const [schema, sequence] = m[1].replace(/"/g, '').toLowerCase().includes('.') ?
          m[1].replace(/"/g, '').toLowerCase().split('.') : ['public', m[1].toLowerCase()]
        if (schema !== 'public') continue
        required.add(sequence)
        if (!sequences.has(sequence)) sequences.set(sequence, new Set())
      }
      continue
    }
    const target = event.target
    let targets = []
    if (/^all\s+sequences\s+in\s+schema\s+"?public"?$/i.test(target)) {
      targets = [...sequences.keys()]
    } else if (/^sequence\s+/i.test(target)) {
      targets = namedPublicTargets(target.replace(/^sequence\s+/i, ''))
    }
    for (const sequence of targets) {
      const privileges = sequences.get(sequence)
      if (!privileges) continue
      const changes = event.all ? ['usage', 'select', 'update'] : event.privileges
      for (const privilege of changes) {
        if (event.kind === 'grant') privileges.add(privilege)
        else privileges.delete(privilege)
      }
    }
  }
  return [...required].filter((sequence) => {
    const privileges = sequences.get(sequence)
    return !privileges.has('usage') && !privileges.has('update')
  })
}
