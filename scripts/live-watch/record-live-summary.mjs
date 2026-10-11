#!/usr/bin/env node
// 开播时段趋势总结入库：把 Claude 按请求生成的 markdown 总结写进 competitor_live_summaries，
// 「开播时段」页的「趋势总结」视图按生成日期列出。
// 走 service-role 直连（与 record-style-description.mjs 同模式），不经 Next 的 API。
//
// Run:
//   node --experimental-strip-types --env-file=.env.local \
//     scripts/live-watch/record-live-summary.mjs \
//     --body-file <md> [--title <text>] [--subtitle <text>] \
//     [--generated-on YYYY-MM-DD] [--source auto|manual] [--dry-run]
//
// --title     缺省「开播时段趋势总结」
// --subtitle  列表里标题下面那行范围说明（如「N 个号 · 起止日期 · N 场」），缺省为空
// --source    auto（缺省）：同一天只留一份，重跑同一天是覆盖；manual：手写补充，每次新增一份
// --dry-run   只校验参数与正文并打印将要写入的内容，**不连库**：预览不该去碰生产库，
//             表也可能还没建（迁移是合并后在 SQL Editor 手工执行的）。所以 dry-run 不需要 env。
//
// 正文里会点名道姓写竞品账号与数据——总结文件放仓库外（如临时目录），只经本脚本进库；
// 本仓库是公开的，别把总结 markdown 提交进来。
//
// 需要 --experimental-strip-types：正文与单行字段的校验直接 import 界面那份
// liveSummaries.ts，两条路径共用同一个上限与空白处理，不各写一遍。

import { readFile } from 'node:fs/promises'
import {
  SUMMARY_BODY_MAX_CHARS,
  SUMMARY_LINE_MAX_CHARS,
  normalizeSummaryBody,
  normalizeSummarySubtitle,
  normalizeSummaryTitle,
} from '../../src/lib/competitors/liveSummaries.ts'

const DEFAULT_TITLE = '开播时段趋势总结'

const args = process.argv.slice(2)
function opt(name, fallback = null) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

// 生成日期取**本机**当天（理由同 record-style-description.mjs：generated_on 记的是
// 「这份总结什么时候产出的」，没有日区可言；不用 toISOString()，那是 UTC，会在时区边界上差一天）。
// 要精确指定就用 --generated-on。
function todayLocal() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** YYYY-MM-DD 且是日历上真有的一天（2026-02-30 这种格式对、日子不存在的也拦下）。 */
function isRealDay(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  const [y, m, d] = ymd.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d))
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d
}

const bodyFile = opt('body-file')
const titleArg = opt('title')
const subtitleArg = opt('subtitle')
const generatedOn = opt('generated-on', todayLocal())
const source = opt('source', 'auto')
const dryRun = opt('dry-run') === true

function usage(msg) {
  console.error(msg)
  console.error(
    'usage: record-live-summary.mjs --body-file <md> [--title <text>] [--subtitle <text>] [--generated-on YYYY-MM-DD] [--source auto|manual] [--dry-run]',
  )
  process.exit(2)
}

if (!bodyFile || typeof bodyFile !== 'string') usage('missing --body-file')
if (titleArg === true) usage('--title needs a value')
if (subtitleArg === true) usage('--subtitle needs a value')
if (!isRealDay(generatedOn)) usage(`invalid --generated-on: ${generatedOn} (expect a real YYYY-MM-DD)`)
if (source !== 'auto' && source !== 'manual') usage(`invalid --source: ${source} (expect auto or manual)`)

const title = normalizeSummaryTitle(titleArg)
if (title === null) usage(`invalid --title: at most ${SUMMARY_LINE_MAX_CHARS} characters`)
const subtitle = normalizeSummarySubtitle(subtitleArg)
if (subtitle === null) usage(`invalid --subtitle: at most ${SUMMARY_LINE_MAX_CHARS} characters`)

let raw
try {
  raw = await readFile(bodyFile, 'utf8')
} catch (e) {
  usage(`cannot read --body-file ${bodyFile}: ${e.message}`)
}
const body = normalizeSummaryBody(raw)
if (!body) usage(`invalid body: must be non-empty and at most ${SUMMARY_BODY_MAX_CHARS} characters`)

const row = { generated_on: generatedOn, title: title || DEFAULT_TITLE, subtitle, body, source }

if (dryRun) {
  const lines = body.split('\n').length
  console.log(`[dry-run] ${row.generated_on} · ${row.source} · ${Array.from(body).length} chars / ${lines} lines`)
  console.log(`[dry-run] title: ${row.title}`)
  console.log(`[dry-run] subtitle: ${row.subtitle || '(empty)'}`)
  console.log(
    row.source === 'auto'
      ? '[dry-run] would UPDATE the auto summary of that day if one exists, else INSERT (not checked: dry-run does not touch the DB)'
      : '[dry-run] would INSERT a new manual summary',
  )
  console.log('[dry-run] ---- body ----')
  console.log(body)
  process.exit(0)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  console.error('Run with: node --experimental-strip-types --env-file=.env.local scripts/live-watch/record-live-summary.mjs ...')
  process.exit(1)
}

// 代理两道坎（undici 不认 HTTPS_PROXY、经代理回来的 gzip 不自动解压），理由与写法同
// record-style-description.mjs，两道都得治。
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

// headers 必须过一遍 Headers 构造器：对 supabase-js 传进来的 Headers 实例做对象展开会得到 {}。
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
  // 自动路径每天只留一份：重跑同一天是覆盖。检查放在**写入那一刻**重查，不复用早先的快照；
  // 库里那条 partial unique index（generated_on where source = 'auto'）是兜底，不是替代。
  // 不用 upsert(onConflict)：PostgREST 的 on_conflict 对不上带 where 的部分唯一索引。
  if (row.source === 'auto') {
    const { data: existing, error } = await db
      .from('competitor_live_summaries')
      .select('id')
      .eq('generated_on', row.generated_on)
      .eq('source', 'auto')
      .maybeSingle()
    if (error) {
      console.error(`dedup check failed: ${error.message}`)
      process.exit(1)
    }
    if (existing) {
      // updated_at 由表上的触发器刷新。
      const { error: uErr } = await db
        .from('competitor_live_summaries')
        .update({ title: row.title, subtitle: row.subtitle, body: row.body })
        .eq('id', existing.id)
      if (uErr) {
        console.error(`update failed: ${uErr.message}`)
        process.exit(1)
      }
      console.log(`updated ${existing.id} · ${row.generated_on} · ${row.title}`)
      return
    }
  }

  const { data, error } = await db.from('competitor_live_summaries').insert(row).select('id').single()
  if (error) {
    console.error(`insert failed: ${error.message}`)
    process.exit(1)
  }
  console.log(`inserted ${data.id} · ${row.generated_on} · ${row.source} · ${row.title}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
