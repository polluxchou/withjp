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

import { readFile } from 'node:fs/promises'
import { BODY_MAX_CHARS, normalizeDescriptionBody } from '../../src/lib/competitors/descriptions.ts'

const args = process.argv.slice(2)
function opt(name, fallback = null) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

// 生成日期取**本机**当天，不跟截图的 shot_on 那样按日本时间分桶。
// 两者语义不同：shot_on 记的是"直播发生在日区的哪一天"，是业务日；generated_on
// 记的是"这份总结什么时候产出的"，没有日区可言。若照搬 JST，本机 PDT 下午跑出来
// 的描述会盖上明天的日戳，排到界面手写那条（走浏览器本地日期）的前面 —— 同一天
// 两条写入路径对不上。要精确指定就用 --generated-on。
//
// 不用 toISOString()：那是 UTC，同样会在时区边界上差一天。
function todayLocal() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const handle = opt('handle')
const bodyArg = opt('body')
const bodyFile = opt('body-file')
const generatedOn = opt('generated-on', todayLocal())
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

// 本机挂代理时要过两道坎，两道都得治，只治一道会换个姿势失败：
// ① Node 内置 fetch(undici) 不认 HTTP_PROXY/HTTPS_PROXY，会直连 Supabase 的
//    Cloudflare IP 然后 UND_ERR_CONNECT_TIMEOUT。接管全局 dispatcher 解决。
// ② 但经代理回来的响应体是 gzip 且**不会**被自动解压（直连那条路径才会），
//    postgrest-js 拿到 \x1F\x8B 开头的字节直接 JSON.parse 当场崩。所以再要求
//    服务端别压缩 —— 这些响应都只有几 KB，省那点带宽不值一次排查。
const usingProxy = Boolean(
  process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy,
)
if (usingProxy) {
  const { EnvHttpProxyAgent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new EnvHttpProxyAgent())
}
// 动态 import 且必须晚于上面那段：静态 import 会被提升到文件最前面执行，
// supabase-js 就会在 dispatcher 换掉之前把旧的抓在手里。
const { createClient } = await import('@supabase/supabase-js')

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
