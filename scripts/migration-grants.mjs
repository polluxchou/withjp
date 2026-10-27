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

const IDENT = String.raw`("(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_]*)`

function identifier(raw) {
  return raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase()
}

function publicName(raw, defaultSchema = 'public') {
  const re = new RegExp(String.raw`^\s*(?:${IDENT}\s*\.\s*)?${IDENT}\s*$`, 'i')
  const match = re.exec(raw)
  if (!match) return null
  const schema = match[1] ? identifier(match[1]) : defaultSchema
  return schema === 'public' ? identifier(match[2]) : null
}

// Preserve offsets and quoted identifiers while hiding comments, SQL string
// literals, and dollar-quoted function bodies. A GRANT mentioned inside any of
// those is text, not a permission change.
function sqlCode(sql) {
  const chars = sql.split('')
  const hide = (from, to) => {
    for (let i = from; i < to; i++) chars[i] = ' '
  }
  for (let i = 0; i < sql.length;) {
    if (sql.startsWith('--', i)) {
      let end = sql.indexOf('\n', i)
      if (end < 0) end = sql.length
      hide(i, end)
      i = end
    } else if (sql.startsWith('/*', i)) {
      const start = i
      let depth = 1
      i += 2
      while (i < sql.length && depth > 0) {
        if (sql.startsWith('/*', i)) { depth++; i += 2 }
        else if (sql.startsWith('*/', i)) { depth--; i += 2 }
        else i++
      }
      hide(start, i)
    } else if (sql[i] === "'") {
      const start = i++
      const escaped = /[eE]/.test(sql[start - 1] ?? '') &&
        !/[A-Za-z_0-9]/.test(sql[start - 2] ?? '')
      while (i < sql.length) {
        if (escaped && sql[i] === '\\') { i += 2; continue }
        if (sql[i++] !== "'") continue
        if (sql[i] === "'") i++
        else break
      }
      hide(start, i)
    } else if (sql[i] === '"') {
      i++
      while (i < sql.length) {
        if (sql[i++] !== '"') continue
        if (sql[i] === '"') i++
        else break
      }
    } else if (sql[i] === '$') {
      const delimiter = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0]
      if (!delimiter) { i++; continue }
      const close = sql.indexOf(delimiter, i + delimiter.length)
      const end = close < 0 ? sql.length : close + delimiter.length
      hide(i, end)
      i = end
    } else {
      i++
    }
  }
  return chars.join('')
}

// Tables created in public: schema-qualified as public, or unqualified while
// public is first in search_path. Other schemas are outside this grant rule.
export function createdPublicTables(sql) {
  const re = new RegExp(
    String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:${IDENT}\s*\.\s*)?${IDENT}`,
    'gi'
  )
  const clean = sqlCode(sql)
  const events = [...clean.matchAll(re)].map((m) => ({
    index: m.index,
    kind: 'create',
    schema: m[1] ? identifier(m[1]) : null,
    table: identifier(m[2]),
  })).concat(searchPathEvents(clean)).sort((a, b) => a.index - b.index)
  const tables = new Set()
  let defaultSchema = 'public'
  for (const event of events) {
    if (event.kind === 'search-path') {
      defaultSchema = event.schema
    } else if ((event.schema ?? defaultSchema) === 'public') {
      tables.add(event.table)
    }
  }
  return [...tables]
}

const TABLE_PRIVILEGES = ['select', 'insert', 'update', 'delete']

function namedPublicTargets(target, defaultSchema = 'public') {
  return target.replace(/^table\s+/i, '').split(',')
    .map((name) => publicName(name, defaultSchema)).filter(Boolean)
}

function searchPathEvents(sql) {
  const re = /\bset\s+(?:local\s+)?search_path\s*(?:=|to)\s*([^;]+);/gi
  return [...sql.matchAll(re)].filter((m) =>
    sql.slice(sql.lastIndexOf(';', m.index) + 1, m.index).trim() === ''
  ).map((m) => ({
    index: m.index,
    kind: 'search-path',
    schema: identifier(m[1].split(',')[0].trim()),
  }))
}

function serviceRoleAclEvents(sql) {
  const re = /\b(grant|revoke)\s+([^;]+?)\s+on\s+([^;]+?)\s+(?:to|from)\s+([^;]+?);/gi
  return [...sql.matchAll(re)].filter((m) =>
    m[4].replace(/\s+(?:cascade|restrict|with\s+grant\s+option)\s*$/i, '')
      .split(',').some((role) => identifier(role.trim()) === 'service_role')
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
  const clean = sqlCode(sql)
  const createRe = new RegExp(
    String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:${IDENT}\s*\.\s*)?${IDENT}`,
    'gi'
  )
  const events = [...clean.matchAll(createRe)].map((m) => ({
    index: m.index,
    kind: 'create',
    schema: m[1] ? identifier(m[1]) : null,
    table: identifier(m[2]),
  })).concat(serviceRoleAclEvents(clean), searchPathEvents(clean))
    .sort((a, b) => a.index - b.index)
  const tables = new Map()
  let defaultSchema = 'public'
  for (const event of events) {
    if (event.kind === 'search-path') {
      defaultSchema = event.schema
      continue
    }
    if (event.kind === 'create') {
      const schema = event.schema === null ? defaultSchema : event.schema
      if (schema === 'public') tables.set(event.table, new Set())
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
    for (const table of namedPublicTargets(event.target, defaultSchema)) {
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
  const clean = sqlCode(sql)
  const createTableRe = new RegExp(
    String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:${IDENT}\s*\.\s*)?${IDENT}`,
    'gi'
  )
  const createSequenceRe = new RegExp(
    String.raw`\bcreate\s+(?:unlogged\s+)?sequence\s+(?:if\s+not\s+exists\s+)?(?:${IDENT}\s*\.\s*)?${IDENT}`,
    'gi'
  )
  const alterTableRe = new RegExp(
    String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:${IDENT}\s*\.\s*)?${IDENT}`,
    'gi'
  )
  const events = [...clean.matchAll(createTableRe)].map((m) => ({
    index: m.index,
    kind: 'create-table',
    schema: m[1] ? identifier(m[1]) : null,
    table: identifier(m[2]),
    statement: sql.slice(m.index, clean.indexOf(';', m.index) + 1),
  })).concat([...clean.matchAll(createSequenceRe)].map((m) => ({
    index: m.index,
    kind: 'create-sequence',
    schema: m[1] ? identifier(m[1]) : null,
    sequence: identifier(m[2]),
  })), [...clean.matchAll(alterTableRe)].map((m) => ({
    index: m.index,
    kind: 'alter-table',
    schema: m[1] ? identifier(m[1]) : null,
    table: identifier(m[2]),
    statement: sql.slice(m.index, clean.indexOf(';', m.index) + 1),
  })), serviceRoleAclEvents(clean), searchPathEvents(clean))
    .sort((a, b) => a.index - b.index)
  const sequences = new Map()
  const required = new Set()
  const createdTables = new Set()
  let defaultSchema = 'public'
  for (const event of events) {
    if (event.kind === 'search-path') {
      defaultSchema = event.schema
      continue
    }
    if (event.kind === 'create-sequence') {
      if ((event.schema ?? defaultSchema) === 'public') sequences.set(event.sequence, new Set())
      continue
    }
    if (event.kind === 'create-table' || event.kind === 'alter-table') {
      if ((event.schema ?? defaultSchema) !== 'public') continue
      if (event.kind === 'create-table') createdTables.add(event.table)
      else if (!createdTables.has(event.table)) continue
      const serialRe = /\b"?([A-Za-z_][A-Za-z0-9_]*)"?\s+(?:smallserial|serial|bigserial)\b/gi
      for (const m of event.statement.matchAll(serialRe)) {
        const sequence = `${event.table}_${m[1]}_seq`
        required.add(sequence)
        sequences.set(sequence, new Set())
      }
      const nextvalRe = /\bnextval\s*\(\s*'([^']+)'/gi
      for (const m of event.statement.matchAll(nextvalRe)) {
        const sequence = publicName(m[1], defaultSchema)
        if (!sequence) continue
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
      targets = namedPublicTargets(target.replace(/^sequence\s+/i, ''), defaultSchema)
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

// These forms can create or move a table into public without a top-level
// CREATE TABLE. Refuse to call such a migration checked until it gets a
// dedicated rule (or is rewritten as explicit CREATE TABLE + GRANT).
export function unsupportedTableCreation(sql) {
  const code = sqlCode(sql)
  const issues = []
  if (/\bselect\b[^;]*\binto\s+(?:temp(?:orary)?\s+|unlogged\s+)?(?:"?public"?\s*\.\s*)?[A-Za-z_]/i.test(code)) {
    issues.push('SELECT INTO 建表未受 grant 检查覆盖')
  }
  if (/\balter\s+table\b[^;]*\bset\s+schema\s+"?public"?\b/i.test(code)) {
    issues.push('ALTER TABLE SET SCHEMA public 未受 grant 检查覆盖')
  }
  if (/\bcreate\s+foreign\s+table\b/i.test(code)) {
    issues.push('CREATE FOREIGN TABLE 未受 grant 检查覆盖')
  }
  const doBlock = /\bdo\s+(?:language\s+\w+\s+)?(\$[A-Za-z_0-9]*\$)([\s\S]*?)\1/gi
  for (const match of sql.matchAll(doBlock)) {
    if (/\bcreate\s+(?:unlogged\s+)?table\b|\bselect\b[\s\S]*?\binto\s+(?:public\s*\.)?|\bset\s+schema\s+public\b/i.test(match[2])) {
      issues.push('DO 动态建表未受 grant 检查覆盖')
      break
    }
  }
  return issues
}
