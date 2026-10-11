// Create initial user accounts.
//
// 账号清单不进仓库（本仓库是 public）。把要建的用户写在一个本地 JSON 文件里，
// 默认路径 scripts/seed-users.local.json（已 gitignore），格式见 scripts/seed-users.example.json；
// 也可以用第一个参数指定别的路径。密码请用随机值，建完号让本人自行修改。
//
// Run: node --env-file=.env.local scripts/seed-users.mjs [path/to/users.json]

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  console.error('Run with: node --env-file=.env.local scripts/seed-users.mjs [users.json]')
  process.exit(1)
}

const usersFile = path.resolve(process.argv[2] ?? 'scripts/seed-users.local.json')

if (!fs.existsSync(usersFile)) {
  console.error(`Users file not found: ${usersFile}`)
  console.error('Copy scripts/seed-users.example.json to scripts/seed-users.local.json and fill it in.')
  process.exit(1)
}

const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'))

if (!Array.isArray(users) || users.length === 0) {
  console.error(`${usersFile}: expected a non-empty JSON array of { email, password, name, role }`)
  process.exit(1)
}

for (const u of users) {
  if (!u?.email || !u?.password || !u?.name || !u?.role) {
    console.error(`${usersFile}: every entry needs email, password, name and role`)
    process.exit(1)
  }
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function run() {
  for (const u of users) {
    const { data, error } = await supabase.auth.admin.createUser({
      email:         u.email,
      password:      u.password,
      email_confirm: true,
      user_metadata: { name: u.name },
    })

    if (error) {
      console.error(`✗ ${u.email}: ${error.message}`)
      continue
    }

    const { error: profileErr } = await supabase
      .from('users')
      .update({ role: u.role })
      .eq('id', data.user.id)

    if (profileErr) {
      console.error(`✗ ${u.email} role update: ${profileErr.message}`)
    } else {
      console.log(`✓ ${u.email}  role=${u.role}  (id: ${data.user.id})`)
    }
  }
}

run()
