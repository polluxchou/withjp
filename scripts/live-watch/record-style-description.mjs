#!/usr/bin/env node
// 直播间风格描述入库：把本地任务生成的「历史图片风格总结」写进 competitor_descriptions。
// 走 service-role 直连（与 record-live-shot.mjs 同模式），不经 Next 的 API。
//
// Run:
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/live-watch/record-style-description.mjs \
//     --handle <handle> (--body <text> | --body-file <path>) \
//     [--generated-on YYYY-MM-DD] [--source auto|manual] [--dry-run]
//
// --dry-run 只解析竞品与正文并打印，不写库。
//
// 需要 --experimental-strip-types：正文的校验规则直接 import 界面那份
// descriptions.ts，两条写入路径共用同一个上限与空白处理，不各写一遍。

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { BODY_MAX_CHARS, normalizeDescriptionBody } from '../../src/lib/competitors/descriptions.ts'

const args = process.argv.slice(2)
function opt(name, fallback = null) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

// 生成日期按日本时间取，与截图的 shot_on 用同一套业务日（见 record-live-shot.mjs
// 里 SHOT_TZ 的注释）：竞品全是日区团播，整条流水线的日期都按日区的一天分桶，
// 这里跟着走才不会出现"同一轮跑出来的截图和描述差一天"。
const TZ = 'Asia/Tokyo'
function todayInTz() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const at = (type) => parts.find((x) => x.type === type).value
  return `${at('year')}-${at('month')}-${at('day')}`
}

const handle = opt('handle')
const bodyArg = opt('body')
const bodyFile = opt('body-file')
const generatedOn = opt('generated-on', todayInTz())
const source = opt('source', 'auto')
const dryRun = opt('dry-run') === true

function usage(msg) {
  console.error(msg)
  console.error('usage: record-style-description.mjs --handle <handle> (--body <text> | --body-file <path>) [--generated-on YYYY-MM-DD] [--source auto|manual] [--dry-run]')
  process.exit(2)
}

if (!handle || typeof handle !== 'string') usage('missing --handle')
if (!bodyArg && !bodyFile) usage('need --body or --body-file')
if (!/^\d{4}-\d{2}-\d{2}$/.test(generatedOn)) usage(`invalid --generated-on: ${generatedOn} (expect YYYY-MM-DD)`)
if (source !== 'auto' && source !== 'manual') usage(`invalid --source: ${source} (expect auto or manual)`)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  console.error('Run with: node --experimental-strip-types --env-file=.env.local scripts/live-watch/record-style-description.mjs ...')
  process.exit(1)
}

// 本机挂着 HTTPS_PROXY 时，经代理回来的响应体 gzip 不会被自动解压，postgrest-js
// 拿到二进制当场崩。直接要求不压缩：这些请求的响应都只有几 KB，省下的带宽不值
// 一次"为什么脚本在我机器上炸了"的排查。
// headers 必须过一遍 Headers 构造器：supabase-js 传进来的是 Headers 实例，
// 对它做对象展开会得到 {}，apikey 与 Authorization 当场蒸发（实测报
// "No API key found in request"）。
const noGzipFetch = (input, init = {}) => {
  const headers = new Headers(init.headers)
  headers.set('Accept-Encoding', 'identity')
  return fetch(input, { ...init, headers })
}

const db = createClient(url, key, {
  auth: { persistSession: false },
  global: { fetch: noGzipFetch },
})

async function main() {
  const raw = bodyFile ? await readFile(bodyFile, 'utf8') : String(bodyArg)
  const body = normalizeDescriptionBody(raw)
  if (!body) {
    console.error(`invalid body: must be non-empty and at most ${BODY_MAX_CHARS} characters`)
    process.exit(2)
  }

  const { data: comp, error: cErr } = await db
    .from('competitors')
    .select('id, handle, display_name')
    .eq('handle', handle)
    .maybeSingle()
  if (cErr) {
    console.error(`lookup failed: ${cErr.message}`)
    process.exit(1)
  }
  if (!comp) {
    console.error(`no competitor with handle ${handle}`)
    process.exit(1)
  }

  const label = `${comp.display_name ?? comp.handle} (@${comp.handle})`

  // 自动路径每个竞品每天只留一条：重跑同一天是覆盖，不是叠一条。
  // 检查放在**写入那一刻**重查、而不是复用轮次开始时的快照 —— 并行跑几个账号
  // 时那份快照会过期。库里那条 partial unique index 是这一步的兜底，不是替代。
  let existing = null
  if (source === 'auto') {
    const { data, error } = await db
      .from('competitor_descriptions')
      .select('id, body')
      .eq('competitor_id', comp.id)
      .eq('generated_on', generatedOn)
      .eq('source', 'auto')
      .maybeSingle()
    if (error) {
      console.error(`dedup check failed: ${error.message}`)
      process.exit(1)
    }
    existing = data
  }

  if (dryRun) {
    console.log(`[dry-run] ${label} · ${generatedOn} · ${source} · ${Array.from(body).length} chars`)
    console.log(existing ? `[dry-run] would UPDATE existing row ${existing.id}` : '[dry-run] would INSERT a new row')
    console.log(body)
    return
  }

  if (existing) {
    const { error } = await db
      .from('competitor_descriptions')
      .update({ body })
      .eq('id', existing.id)
    if (error) {
      console.error(`update failed: ${error.message}`)
      process.exit(1)
    }
    console.log(`updated ${existing.id} · ${label} · ${generatedOn}`)
    return
  }

  const { data, error } = await db
    .from('competitor_descriptions')
    .insert({ competitor_id: comp.id, body, generated_on: generatedOn, source })
    .select('id')
    .single()
  if (error) {
    console.error(`insert failed: ${error.message}`)
    process.exit(1)
  }
  console.log(`inserted ${data.id} · ${label} · ${generatedOn}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
