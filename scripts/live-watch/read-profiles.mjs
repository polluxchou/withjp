#!/usr/bin/env node
// 竞品主页指标读取（零依赖，Node >= 22）。连专用 Chrome（--remote-debugging-port），
// 单 tab 依次导航到 tiktok.com/@handle，从页面 rehydration JSON 读粉丝/赞/视频/关注数
// + 昵称/bio/地区/认证。主页计数是服务端渲染的静态整数，无需切前台、无需等视频。
//
// 与直播不同：登录态读主页不被通报（无社交暴露）。逐个顺序、真人节奏。
// 撞登录墙/验证码 → 该 handle 记为失败、继续下一个，最后汇总，绝不破解。
//
// Run:
//   node scripts/live-watch/read-profiles.mjs --handles a,b,c [--port 9222] [--gap 4000]
// 输出：stdout 一行 JSON = { ok:[...payloads], failed:[{handle,reason}] }
//   payload 字段对齐 record-competitor-snapshot.ts 的 Row。

const args = process.argv.slice(2)
function opt(name, fallback = null) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

const handles = String(opt('handles', '')).split(',').map((s) => s.trim()).filter(Boolean)
const port = Number(opt('port', '9222'))
const gap = Number(opt('gap', '4000')) // 账号之间的停顿（真人节奏）
const capturedOn = opt('captured-on') // 显式本地日期，绕开脚本 UTC 坑

if (!handles.length) {
  console.error('usage: read-profiles.mjs --handles a,b,c [--port 9222] [--gap 4000] [--captured-on YYYY-MM-DD]')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function browserWs() {
  const ver = await (await fetch(`http://localhost:${port}/json/version`, { signal: AbortSignal.timeout(3000) })).json()
  return ver.webSocketDebuggerUrl
}

function makeConn(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
    }
  })
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', () => rej(new Error('ws connect failed')), { once: true })
  })
  const send = (method, params = {}, timeoutMs = 20000) =>
    new Promise((resolve, reject) => {
      const mid = ++id
      const timer = setTimeout(() => { pending.delete(mid); reject(new Error(`${method} timeout`)) }, timeoutMs)
      pending.set(mid, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  return { ws, ready, send }
}

// 现在的 TikTok 主页是客户端渲染，计数不在 rehydration JSON 里，而在渲染后的 DOM
// 上，用稳定的 data-e2e 属性标注。从 outerHTML（= 当前渲染 DOM）按 data-e2e 抽。
// 值可能是缩写（"28.9K"/"1.2M"），原样传给下游 record 脚本的 parseCount 处理。
function textOf(html, e2e) {
  const m = html.match(new RegExp(`data-e2e="${e2e}"[^>]*>([^<]*)<`))
  if (!m) return null
  const t = m[1].trim()
  return t === '' ? null : t   // 元素已挂载但还没填值 → 当作没读到，别回传空串
}
// followers 的"已水合"判据。计数元素会**先挂载成 0 或空**、值随后才填进去，
// 而 `[^<]*` 连空串也匹配、`=== null` 的守卫又放行 "0"，两处叠加就会把一个
// 渲染中间态当成真实粉丝数回传（实测 1tb.boiz 读到 followers=0，重读为 5792；
// 若写进库就是曲线上一个断崖式假点）。所以就绪判据必须是"有值且不为 0"。
// 真·0 粉账号极罕见（竞品库里没有），宁可多轮询几次也不要写进一个假 0。
function followersHydrated(html) {
  const v = textOf(html, 'followers-count')
  return v !== null && v !== '0'
}
// 主页语言（账号的应用语言设置）。它**不在**渲染后的 DOM 上，而在 rehydration
// JSON 里 —— outerHTML 包含 script 标签，所以同一份 html 就能拿到，不必多跑一趟。
//
// 只作为「地区」的辅助参考：region 是人工维护的权威值，language 只是代理指标
// （日本团把语言设成 en 也完全可能）。所以取不到就返回 null，绝不影响本轮成败。
//
// 必须整段 JSON.parse 后按路径取，不能对整页正则 "language":"xx" —— 那份 payload
// 里 app-context / i18n 等多处都有同名 key，正则会抓错。
function languageOf(html) {
  const m = html.match(/id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    const scope = JSON.parse(m[1])?.['__DEFAULT_SCOPE__']
    const lang = scope?.['webapp.user-detail']?.userInfo?.user?.language
    return typeof lang === 'string' && lang.trim() ? lang.trim() : null
  } catch {
    return null
  }
}

function extractProfile(html) {
  const followers = textOf(html, 'followers-count')
  const following = textOf(html, 'following-count')
  const likes = textOf(html, 'likes-count')
  // 计数元素有值 = 正常主页；缺 followers-count（或值还是渲染中间态的 0）视为没渲染成功/被拦
  if (followers === null || followers === '0') {
    // 只用明确的挑战 DOM 判验证码，避免 i18n 文案误报
    if (/<[^>]+(class|id)="[^"]*captcha[^"]*"/i.test(html) || html.includes('secsdk-captcha')) return { _fail: 'captcha' }
    if (/data-e2e="[^"]*login[^"]*"/i.test(html)) return { _fail: 'login_wall' }
    return { _fail: 'counts_not_rendered' }
  }
  // bio 可能含嵌套 span，取粗文本
  const bioM = html.match(/data-e2e="user-bio"[^>]*>([\s\S]*?)<\/(?:h2|div|span)>/)
  const bio = bioM ? bioM[1].replace(/<[^>]+>/g, '').trim() : null
  // 不返回 display_name：主页 DOM 只稳定拿到 handle 而非昵称，若回传会覆盖库里已维护的好昵称。
  return {
    followers, likes, following, // 字符串，下游 parseCount；videos 主页不展示，留空
    bio: bio || undefined,
    language: languageOf(html) ?? undefined,
  }
}

async function main() {
  const conn = makeConn(await browserWs())
  await conn.ready
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' })
  // 找到该 target 的 page ws
  const list = await (await fetch(`http://localhost:${port}/json/list`)).json()
  const tab = list.find((t) => t.id === targetId)
  const page = makeConn(tab.webSocketDebuggerUrl)
  await page.ready

  const okRows = []
  const failed = []
  for (const handle of handles) {
    try {
      await page.send('Page.navigate', { url: `https://www.tiktok.com/@${handle}` })
      // 客户端渲染：轮询到 followers-count **有值且不为 0**（或超时 ~18s）。
      // 只判元素存在不够 —— 它会先挂载成 0，早退就会采到渲染中间态。
      let outerHTML = ''
      for (let i = 0; i < 9; i++) {
        await sleep(2000)
        const { root } = await page.send('DOM.getDocument', { depth: 1 })
        ;({ outerHTML } = await page.send('DOM.getOuterHTML', { nodeId: root.nodeId }))
        if (followersHydrated(outerHTML)) break
      }
      const p = extractProfile(outerHTML)
      if (p._fail) {
        failed.push({ handle, reason: p._fail })
        process.stderr.write(`✗ @${handle}: ${p._fail}\n`)
      } else {
        const row = { handle, ...p }
        if (capturedOn) row.captured_on = capturedOn
        okRows.push(row)
        process.stderr.write(`✓ @${handle}: followers=${p.followers} likes=${p.likes} videos=${p.videos}\n`)
      }
    } catch (e) {
      failed.push({ handle, reason: e.message })
      process.stderr.write(`✗ @${handle}: ${e.message}\n`)
    }
    await sleep(gap)
  }

  await conn.send('Target.closeTarget', { targetId }).catch(() => {})
  page.ws.close(); conn.ws.close()
  console.log(JSON.stringify({ ok: okRows, failed }))
}

main().catch((e) => { console.error(JSON.stringify({ error: e.message })); process.exit(1) })
