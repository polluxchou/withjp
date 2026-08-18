#!/usr/bin/env node
// 直播截图入库：上传 competitor-shots 桶 + 插 competitor_shots 行。
// 复刻 src/app/api/competitors/upload/route.ts + service.addShot 的行为，
// 走 service-role 直连（与 record-competitor-snapshot.ts 同模式）。
//
// Run:
//   node --env-file=.env.local scripts/live-watch/record-live-shot.mjs \
//     --handle <handle> --file <shot.png> [--shot-on YYYY-MM-DD] [--tag live_auto] [--caption <text>] [--dry-run]
//
// --dry-run 只查 competitor 档案并打印，不上传不插行。

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const BUCKET = 'competitor-shots'
const MAX_BYTES = 5 * 1024 * 1024 // 与 upload-image.ts 的限制保持一致

const args = process.argv.slice(2)
function opt(name, fallback = null) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

const handle = opt('handle')
const file = opt('file')
const shotOn = opt('shot-on', new Date().toISOString().slice(0, 10))
const tag = opt('tag', 'live_auto')
const caption = opt('caption', '')
const dryRun = opt('dry-run') === true
const replaceId = opt('replace') // 传 shot_id：上传新图 → 更新该行 image_url → 删旧桶文件

if (!handle || (!file && !dryRun)) {
  console.error('usage: record-live-shot.mjs --handle <handle> --file <shot.png> [--shot-on YYYY-MM-DD] [--tag live_auto] [--caption <text>] [--dry-run]')
  process.exit(2)
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(shotOn)) {
  console.error(`invalid --shot-on: ${shotOn} (expect YYYY-MM-DD)`)
  process.exit(2)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  console.error('Run with: node --env-file=.env.local scripts/live-watch/record-live-shot.mjs ...')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const { data: comp, error: cErr } = await db
    .from('competitors')
    .select('id, handle, display_name')
    .eq('platform', 'tiktok')
    .eq('handle', handle)
    .maybeSingle()
  if (cErr) { console.error('competitor lookup failed:', cErr.message); process.exit(1) }
  if (!comp) {
    // 截图必须挂在已建档竞品下，不在这里静默建档 —— 建档是显式的数据准备动作
    console.error(`competitor not found: tiktok/@${handle} — 先建档再入库`)
    process.exit(4)
  }
  if (dryRun) {
    console.log(`✓ dry-run tiktok/@${comp.handle} (${comp.display_name ?? '-'}) id=${comp.id}`)
    return
  }

  const buffer = await readFile(file)
  if (buffer.length > MAX_BYTES) {
    console.error(`image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB > 5MB`)
    process.exit(5)
  }

  const path = `${randomUUID()}.png`
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'image/png',
    upsert: false,
  })
  if (upErr) { console.error('upload failed:', upErr.message); process.exit(1) }
  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)

  if (replaceId) {
    // 先取旧行的 image_url（为删旧桶文件），再把该行指到新图
    const { data: old } = await db.from('competitor_shots').select('image_url').eq('id', replaceId).maybeSingle()
    const { error: uErr } = await db
      .from('competitor_shots')
      .update({ image_url: pub.publicUrl, shot_on: shotOn, caption })
      .eq('id', replaceId)
    if (uErr) { console.error('shot update failed:', uErr.message); process.exit(1) }
    if (old?.image_url) {
      const oldPath = old.image_url.split('/competitor-shots/')[1]
      if (oldPath) await db.storage.from(BUCKET).remove([oldPath])
    }
    console.log(`✓ replaced shot ${replaceId} → ${pub.publicUrl}`)
    return
  }

  const { data: row, error: sErr } = await db
    .from('competitor_shots')
    .insert({
      competitor_id: comp.id,
      image_url: pub.publicUrl,
      shot_on: shotOn,
      tag,
      caption,
      sort_order: 0,
    })
    .select('id')
    .single()
  if (sErr) { console.error('shot insert failed:', sErr.message); process.exit(1) }

  console.log(`✓ tiktok/@${comp.handle} shot_on=${shotOn} tag=${tag} shot_id=${row.id}`)
  console.log(`  ${pub.publicUrl}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
