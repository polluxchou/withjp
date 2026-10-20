// Supabase stops auto-granting Data API access to newly created tables in the
// "public" schema on 2026-10-30. A table created after that without an explicit
// GRANT is unreachable through supabase-js/PostgREST ("permission denied") —
// including for service_role, which every server route uses (src/lib/supabase/server.ts).
//
// Rule enforced for migrations at or after GRANT_CHECK_FROM: every table the file
// creates in public must be granted to service_role in the same file. Grants to
// anon/authenticated are a per-table least-privilege decision and are not forced.

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

// Tables (lowercased) granted to the given role, plus whether a schema-wide
// "grant ... on all tables in schema public to <role>" covers everything.
export function grantedTables(sql, role) {
  const re = /\bgrant\s+[\s\S]+?\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?);/gi
  const tables = new Set()
  let allPublic = false
  for (const m of stripComments(sql).matchAll(re)) {
    const roles = m[2].split(',').map((r) => r.trim().replace(/"/g, '').toLowerCase())
    if (!roles.includes(role.toLowerCase())) continue
    const target = m[1].trim()
    if (/^all\s+tables\s+in\s+schema\s+"?public"?$/i.test(target)) {
      allPublic = true
      continue
    }
    for (const part of target.replace(/^table\s+/i, '').split(',')) {
      const name = part.trim().replace(/"/g, '').toLowerCase()
      const [schema, table] = name.includes('.') ? name.split('.') : ['public', name]
      if (schema === 'public') tables.add(table)
    }
  }
  return { tables, allPublic }
}

// Public tables created in `sql` that are not granted to service_role.
export function tablesMissingServiceRoleGrant(sql) {
  const { tables, allPublic } = grantedTables(sql, 'service_role')
  if (allPublic) return []
  return createdPublicTables(sql).filter((t) => !tables.has(t))
}
