import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(url, key, { auth: { persistSession: false } })

function parseCount(v) {
  if (v == null) return null
  if (typeof v === 'number') return Math.round(v)
  const s = String(v).trim().replace(/,/g, '')
  const m = s.match(/^([\d.]+)\s*([KMB万])?$/i)
  if (!m) return null
  let n = parseFloat(m[1])
  const suf = (m[2] || '').toUpperCase()
  if (suf === 'K') n *= 1e3
  else if (suf === 'M') n *= 1e6
  else if (suf === 'B') n *= 1e9
  else if (m[2] === '万') n *= 1e4
  return Math.round(n)
}

const rows = JSON.parse(await readFile(process.argv[2], 'utf8'))
let ok = 0
for (const r of rows) {
  const { data: comp } = await db.from('competitors')
    .select('id').eq('platform', 'tiktok').eq('handle', r.handle).maybeSingle()
  if (!comp) { console.error('skip (not found):', r.handle); continue }
  const snap = {
    competitor_id: comp.id,
    captured_on: r.captured_on,
    followers: parseCount(r.followers),
    likes: parseCount(r.likes),
    videos: parseCount(r.videos), // undefined → null
    following: parseCount(r.following),
    bio: r.bio ?? null,
  }
  const { error } = await db.from('competitor_snapshots')
    .upsert(snap, { onConflict: 'competitor_id,captured_on' })
  if (error) { console.error('✗', r.handle, error.message); continue }
  console.log(`✓ @${r.handle} ${r.captured_on} followers=${snap.followers} likes=${snap.likes} following=${snap.following}`)
  ok++
}
console.log(`\n${ok}/${rows.length} written`)
process.exit(0)
