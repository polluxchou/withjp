// 竞品每日打点写库（唯一快照写入口）。Claude 采集后跑。
// Run: node --env-file=.env.local --experimental-strip-types scripts/record-competitor-snapshot.ts '<json>'
//   <json> 为单个对象或数组；也可从 stdin 读。字段见下方 Row。
//   node --env-file=.env.local --experimental-strip-types scripts/record-competitor-snapshot.ts < payload.json

import { createClient } from '@supabase/supabase-js'
import { parseCount } from '../src/lib/competitors/metrics.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  console.error('Run: node --env-file=.env.local --experimental-strip-types scripts/record-competitor-snapshot.ts <json>')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

type Row = {
  platform?: string
  handle: string
  profile_url?: string
  followers?: number | string
  likes?: number | string
  videos?: number | string
  following?: number | string
  display_name?: string
  bio?: string
  region?: string
  verified?: boolean
  raw?: Record<string, unknown>
  captured_on?: string // 默认今天（UTC）
}

async function readInput(): Promise<Row[]> {
  const arg = process.argv[2]
  const text = arg && arg.trim() !== '' ? arg : await new Promise<string>((resolve) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', () => resolve(buf))
  })
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function run() {
  const rows = await readInput()
  for (const r of rows) {
    const platform = r.platform ?? 'tiktok'
    const handle = r.handle
    if (!handle) { console.error('skip: row missing handle', r); continue }
    const profile_url = r.profile_url ?? `https://www.tiktok.com/@${handle}`

    // 只带上明确提供的字段，避免把清单里已维护的 display_name 覆盖成 null。
    const compRow: Record<string, unknown> = { platform, handle, profile_url }
    if (r.display_name !== undefined) compRow.display_name = r.display_name
    const { data: comp, error: cErr } = await db
      .from('competitors')
      .upsert(compRow, { onConflict: 'platform,handle' })
      .select('id')
      .single()
    if (cErr || !comp) { console.error('competitor upsert failed', handle, cErr?.message); continue }

    const captured_on = r.captured_on ?? today()
    const snap = {
      competitor_id: (comp as { id: string }).id,
      captured_on,
      followers: parseCount(r.followers ?? (r.raw?.followers as string | undefined)),
      likes: parseCount(r.likes ?? (r.raw?.likes as string | undefined)),
      videos: parseCount(r.videos ?? (r.raw?.videos as string | undefined)),
      following: parseCount(r.following ?? (r.raw?.following as string | undefined)),
      display_name: r.display_name ?? null,
      bio: r.bio ?? null,
      region: r.region ?? null,
      verified: r.verified ?? null,
      raw: r.raw ?? null,
    }
    const { error: sErr } = await db
      .from('competitor_snapshots')
      .upsert(snap, { onConflict: 'competitor_id,captured_on' })
    if (sErr) { console.error('snapshot upsert failed', handle, sErr.message); continue }

    console.log(`✓ ${platform}/@${handle} ${captured_on} — followers=${snap.followers} likes=${snap.likes} videos=${snap.videos}`)
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
