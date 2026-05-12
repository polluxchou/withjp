// Create initial user accounts
// Run: node --env-file=.env.local scripts/seed-users.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  console.error('Run with: node --env-file=.env.local scripts/seed-users.mjs')
  process.exit(1)
}

const supabase = createClient(url, key)

const users = [
  { email: 'howl@chi-ron.com',        password: 'osakamcn2026', name: 'Howl',      role: 'tech' },
  { email: 'lintao.wu@withamp.live',   password: 'osakamcn2026', name: 'Lintao Wu', role: 'tech' },
]

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
