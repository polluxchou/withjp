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
  return m ? m[1].trim() : null
}
function extractProfile(html) {
  const followers = textOf(html, 'followers-count')
  const following = textOf(html, 'following-count')
  const likes = textOf(html, 'likes-count')
  // 计数元素在 = 正常主页；缺 followers-count 视为没渲染成功/被拦
  if (followers === null) {
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
      // 客户端渲染：轮询到 followers-count 出现（或超时 ~18s）
      let outerHTML = ''
      for (let i = 0; i < 9; i++) {
        await sleep(2000)
        const { root } = await page.send('DOM.getDocument', { depth: 1 })
        ;({ outerHTML } = await page.send('DOM.getOuterHTML', { nodeId: root.nodeId }))
        if (outerHTML.includes('data-e2e="followers-count"')) break
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
