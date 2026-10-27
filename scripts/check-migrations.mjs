import fs from 'node:fs'
import path from 'node:path'
import {
  GRANT_CHECK_FROM,
  missingTablePrivileges,
  sequencesMissingServiceRoleGrant,
  unsupportedTableCreation,
} from './migration-grants.mjs'

// Guards the migration naming contract (see supabase/migrations/README.md):
//   * Every .sql file must be named <YYYYMMDDHHMMSS>_<snake_case>.sql
//   * No two files may share the same timestamp prefix — duplicate numbering
//     is exactly what caused 022/027 to be skipped during manual application
//     (2026-08-08 incident: /api/notifications 500).
//   * Files at or after GRANT_CHECK_FROM must grant every new public table to
//     service_role — Supabase stops auto-granting on 2026-10-30 (see migration-grants.mjs).

const root = process.cwd()
const dir = path.join(root, 'supabase', 'migrations')

const NAME_RE = /^(\d{14})_[a-z0-9_]+\.sql$/

const entries = fs.readdirSync(dir).filter((name) => name !== 'README.md')

const errors = []
const seen = new Map()

for (const name of entries) {
  const match = NAME_RE.exec(name)
  if (!match) {
    errors.push(
      `${name}: 文件名必须是 <YYYYMMDDHHMMSS>_<snake_case>.sql（生成时间戳：TZ=Asia/Tokyo date +%Y%m%d%H%M%S）`
    )
    continue
  }
  const prefix = match[1]
  if (seen.has(prefix)) {
    errors.push(`${name}: 时间戳前缀 ${prefix} 与 ${seen.get(prefix)} 重复，请重新生成`)
  } else {
    seen.set(prefix, name)
  }
  if (prefix >= GRANT_CHECK_FROM) {
    const sql = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const { table, missing } of missingTablePrivileges(sql)) {
      errors.push(
        `${name}: 新表 public.${table} 对 service_role 缺少 ${missing.join(', ').toUpperCase()} 权限（见 README「新建表必须显式 grant」）`
      )
    }
    for (const sequence of sequencesMissingServiceRoleGrant(sql)) {
      errors.push(`${name}: 序列 public.${sequence} 对 service_role 缺少 USAGE 或 UPDATE 权限`)
    }
    for (const issue of unsupportedTableCreation(sql)) {
      errors.push(`${name}: ${issue}；请改用显式 CREATE TABLE + GRANT 或扩展检查器`)
    }
  }
}

if (errors.length > 0) {
  console.error('supabase/migrations 检查未通过：\n')
  for (const error of errors) console.error(`  - ${error}`)
  console.error('\n约定详见 supabase/migrations/README.md')
  process.exit(1)
}

console.log(`supabase/migrations 检查通过（${entries.length} 个迁移文件）`)
