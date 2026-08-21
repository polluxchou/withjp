// 意图解析的 gemini / deepseek 真实句式 A/B。
//
// 回答三个问题，缺一个都不算测过：
//   1. 相对时间提取对不对 —— 最脆的一环，错了不报错、只给错数字
//   2. schema 能不能过 —— DeepSeek 的 json_object 会不会吐出结构不符的东西
//   3. 延迟差多少 —— 交互式面板里用户能感觉到
//
// 只读不写：跑的是 parser 的 prompt，不碰 executor，不落库。
//
// 用法：node scripts/llm-ab-intent.mjs [--runs N]
// 需要 .env.local 里的 GEMINI_API_KEY 与 DEEPSEEK_API_KEY。

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')

// 本机网络的两个坑，实测记下来省下一次排查（2026-08-20）：
//
// 1. Node 内置 fetch（undici）**不认** HTTP_PROXY / HTTPS_PROXY。本机挂着
//    HTTPS_PROXY=http://127.0.0.1:15236 时，curl 能通而 node fetch 直连
//    Google 的 IP 超时（10s）。
// 2. 但**别**为此装 undici 的 ProxyAgent：那个代理是 TLS 拦截型的，经它拿到
//    的是二进制乱码，两家都解析失败——连本来直连正常的 DeepSeek 也一起坏掉。
//
// 所以脚本一律直连。Gemini 打不通时它会显示成 9 次网络错，看到就知道是本机
// 环境问题，不是模型问题。

// ── env ───────────────────────────────────────────────────────

function loadEnvLocal() {
  const f = path.join(ROOT, '.env.local')
  if (!fs.existsSync(f)) {
    console.error('缺 .env.local —— A/B 需要 GEMINI_API_KEY 与 DEEPSEEK_API_KEY')
    process.exit(1)
  }
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

// ── 被测对象：与 parser.ts 同构的两段 prompt ──────────────────
//
// 刻意抄一份而不是 import parser.ts：那是 TS + 路径别名，脚本跑不动；而且
// A/B 要的是「同一段 prompt 打两家」，抄一份反而让对照更明确。
// parser.ts 的 prompt 改了，这里要跟着改 —— 下面这行注释就是提醒。

const TODAY = '2026-08-20'

function classifyPrompt(text) {
  return `判断下面这句话是"写操作"还是"查询"。
- 写操作：创建、修改、删除一条或多条支出记录。
- 查询：询问支出数据、汇总、占比、列表。

只返回 JSON：{"kind":"write"} 或 {"kind":"query"}。
如果完全无法判断，返回 {"kind":"unknown"}。

输入：${JSON.stringify(text)}`
}

// 抽取只测「时间范围」这一段——把完整 SCHEMA_DOC 抄进来会让脚本随 parser 漂移，
// 而 A/B 真正要分辨的就是相对时间。用一个最小 schema 逼两家输出可比对的字段。
function datePrompt(text) {
  return `今天是 ${TODAY}。

把下面这句话里的时间范围提取成绝对日期。只返回 JSON：
{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}
如果句子里没有时间信息，返回 {"from":null,"to":null}。
不要输出 JSON 以外的任何文字。

输入：${JSON.stringify(text)}`
}

// ── 两家的传输 ────────────────────────────────────────────────

async function callGemini(model, prompt) {
  const key = process.env.GEMINI_API_KEY
  const base = (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
  const res = await fetch(`${base}/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callDeepseek(model, prompt) {
  const key = process.env.DEEPSEEK_API_KEY
  const base = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Output a single valid json object. No prose, no markdown fences.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`deepseek ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

const PROVIDERS = [
  { name: 'gemini-2.5-flash', call: (p) => callGemini('gemini-2.5-flash', p) },
  { name: 'deepseek-chat', call: (p) => callDeepseek('deepseek-chat', p) },
]

// ── fixtures ──────────────────────────────────────────────────
//
// 期望值按 TODAY=2026-08-20 手算。相对时间是重点，绝对日期与无时间各留一条
// 当对照。

const CASES = [
  { text: 'Q3 薪资中 MC 占了多少', kind: 'query', from: '2026-07-01', to: '2026-09-30', tag: '相对·季度' },
  { text: '上个月支出最大的三类是什么', kind: 'query', from: '2026-07-01', to: '2026-07-31', tag: '相对·上月' },
  // 「最近三个月」的起点含不含当日是天然歧义（5-20 与 5-21 都讲得通），
  // 给 ±1 天容差，否则统计里会记成模型错。
  { text: '最近三个月的差旅费一共多少', kind: 'query', from: '2026-05-21', to: '2026-08-20', tag: '相对·近N月', tolDays: 1 },
  { text: '今年到目前为止设备买了多少钱', kind: 'query', from: '2026-01-01', to: '2026-08-20', tag: '相对·年初至今' },
  { text: '上周的支出有哪些', kind: 'query', from: '2026-08-10', to: '2026-08-16', tag: '相对·上周' },
  { text: '5月10日打车花了多少', kind: 'query', from: '2026-05-10', to: '2026-05-10', tag: '绝对·单日' },
  { text: '新增差旅费 5月10日打车 320 元', kind: 'write', from: '2026-05-10', to: '2026-05-10', tag: '写·绝对日期' },
  { text: '把 pollux 那笔差旅改成 350 元', kind: 'write', from: null, to: null, tag: '写·无时间' },
  { text: '一共有多少笔支出', kind: 'query', from: null, to: null, tag: '查·无时间' },
]

// ── 跑 ────────────────────────────────────────────────────────

function pct(n, d) { return d === 0 ? '—' : `${((n / d) * 100).toFixed(0)}%` }

function quantile(sorted, q) {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length))
  return sorted[i]
}

async function timed(fn) {
  const t0 = Date.now()
  try {
    const out = await fn()
    return { ms: Date.now() - t0, out, err: null }
  } catch (e) {
    return { ms: Date.now() - t0, out: null, err: e instanceof Error ? e.message : String(e) }
  }
}

function parseJson(raw) {
  try { return JSON.parse(raw) } catch { return null }
}

function dayDiff(a, b) {
  return Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)
}

// tolDays 允许边界差几天：有些说法（「最近三个月」含不含当日）本身就有歧义，
// 严格比对会把它记成模型错。
function dateMatches(got, c) {
  const gf = got?.from ?? null
  const gt = got?.to ?? null
  if (c.from === null || c.to === null) return gf === c.from && gt === c.to
  if (gf === null || gt === null) return false
  const tol = c.tolDays ?? 0
  return dayDiff(gf, c.from) <= tol && dayDiff(gt, c.to) <= tol
}

async function main() {
  loadEnvLocal()
  const runs = Number((process.argv.find((a) => a.startsWith('--runs=')) ?? '--runs=1').split('=')[1]) || 1

  const stats = {}
  for (const p of PROVIDERS) {
    stats[p.name] = { kindOk: 0, kindTotal: 0, dateOk: 0, dateTotal: 0, schemaFail: 0, err: 0, lat: [] }
  }

  for (let run = 1; run <= runs; run++) {
    for (const c of CASES) {
      const row = { tag: c.tag, text: c.text }
      for (const p of PROVIDERS) {
        const s = stats[p.name]

        const k = await timed(() => p.call(classifyPrompt(c.text)))
        s.lat.push(k.ms)
        if (k.err) { s.err++; row[p.name] = `ERR ${k.err.slice(0, 40)}`; continue }
        const kObj = parseJson(k.out)
        if (!kObj) s.schemaFail++
        s.kindTotal++
        const kindHit = kObj?.kind === c.kind
        if (kindHit) s.kindOk++

        const d = await timed(() => p.call(datePrompt(c.text)))
        s.lat.push(d.ms)
        if (d.err) { s.err++; row[p.name] = `${kindHit ? 'K' : 'k'} / ERR`; continue }
        const dObj = parseJson(d.out)
        if (!dObj) s.schemaFail++
        s.dateTotal++
        const dateHit = dateMatches(dObj, c)
        if (dateHit) s.dateOk++

        row[p.name] = `${kindHit ? 'K' : '✗K'} ${dateHit ? 'D' : `✗D(${dObj?.from}→${dObj?.to})`}`
      }
      console.log(
        `[${row.tag}] ${row.text}\n` +
        PROVIDERS.map((p) => `    ${p.name.padEnd(18)} ${row[p.name]}`).join('\n'),
      )
    }
  }

  console.log('\n' + '─'.repeat(78))
  console.log(`汇总（今天视为 ${TODAY}，${CASES.length} 条 × ${runs} 轮）\n`)
  console.log('模型                分类准确  日期准确  schema失败  网络错  p50    p95')
  for (const p of PROVIDERS) {
    const s = stats[p.name]
    const lat = s.lat.slice().sort((a, b) => a - b)
    console.log(
      `${p.name.padEnd(19)} ${pct(s.kindOk, s.kindTotal).padEnd(9)} ` +
      `${pct(s.dateOk, s.dateTotal).padEnd(9)} ${String(s.schemaFail).padEnd(11)} ` +
      `${String(s.err).padEnd(7)} ${String(quantile(lat, 0.5)).padEnd(6)} ${quantile(lat, 0.95)}`,
    )
  }
  console.log('\nK/D = 分类/日期命中，✗ 前缀为未命中；日期未命中会打印模型实际给的区间。')
}

main().catch((e) => { console.error(e); process.exit(1) })
