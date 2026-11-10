// Writes (or refreshes) the ledger registration block at the end of migration
// files — see scripts/migration-ledger.mjs.
//
//   npm run migrations:stamp                 every file at or after LEDGER_CHECK_FROM
//   npm run migrations:stamp -- <file>...    just these files (name or path)
//
// Run it after the SQL is final, and again after any later edit: the block
// carries a checksum of the SQL above it and CI rejects a stale one.

import fs from 'node:fs'
import path from 'node:path'
import { LEDGER_CHECK_FROM, stampMigration } from './migration-ledger.mjs'

const dir = path.join(process.cwd(), 'supabase', 'migrations')
const NAME_RE = /^(\d{14})_[a-z0-9_]+\.sql$/

const requested = process.argv.slice(2).map((arg) => path.basename(arg))
const targets = requested.length
  ? requested
  : fs.readdirSync(dir).filter((name) => NAME_RE.test(name) && name.slice(0, 14) >= LEDGER_CHECK_FROM)

let failed = false
for (const name of targets.sort()) {
  const file = path.join(dir, name)
  if (!NAME_RE.test(name) || !fs.existsSync(file)) {
    console.error(`${name}: 不是 supabase/migrations 下的迁移文件`)
    failed = true
    continue
  }
  const before = fs.readFileSync(file, 'utf8')
  const after = stampMigration(name, before)
  if (after === before) {
    console.log(`${name}: 已是最新`)
  } else {
    fs.writeFileSync(file, after)
    console.log(`${name}: 已写入账本登记语句`)
  }
}
process.exit(failed ? 1 : 0)
