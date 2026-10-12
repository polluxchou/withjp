#!/usr/bin/env node
// 批量抓竞品主页头像（零依赖，Node >= 22）。连专用 Chrome（--remote-debugging-port），
// 单 tab 依次导航到 tiktok.com/@handle，从 rehydration JSON 读 avatarMedium，下载字节。
// 主页读取不需要切前台（不涉及视频渲染），与 read-profiles.mjs 同风险等级（无社交暴露）。
//
// Run:
//   node scripts/live-watch/fetch-avatars.mjs --handles a,b,c [--port 9222] [--gap 3000]
// 输出：stdout 一行 JSON = { ok:[{handle, bytes:base64, contentType}], failed:[{handle,reason}] }

const args = process.argv.slice(2)
function opt(name, fallback = null) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

const handles = String(opt('handles', '')).split(',').map((s) => s.trim()).filter(Boolean)
const port = Number(opt('port', '9222'))
const gap = Number(opt('gap', '3000'))
const outDir = opt('out-dir', '/tmp/avatars')

if (!handles.length) {
  console.error('usage: fetch-avatars.mjs --handles a,b,c [--port 9222] [--gap 3000] [--out-dir /tmp/avatars]')
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

const EVAL = `(()=>{
  const el=document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
  if(!el) return {found:false};
  const u=JSON.parse(el.textContent)?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
  if(!u) return {found:false};
  return {found:true, avatarMedium:u.avatarMedium, avatarLarger:u.avatarLarger};
})()`

// 直连 CDN 从本机沙箱网络会被拒(403/超时)，改在页面自己的网络栈里 fetch+转 base64 再传回，
// 只走本地 CDP websocket，不依赖沙箱出网。
const FETCH_AS_BASE64 = (url) => `(async()=>{
  const res = await fetch(${JSON.stringify(url)});
  if(!res.ok) return {ok:false, status:res.status};
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return {ok:true, contentType: res.headers.get('content-type') || 'image/jpeg', base64: btoa(bin)};
})()`

async function main() {
  const { writeFile, mkdir } = await import('node:fs/promises')
  await mkdir(outDir, { recursive: true })
  const conn = makeConn(await browserWs())
  await conn.ready
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' })
  const list = await (await fetch(`http://localhost:${port}/json/list`)).json()
  const tab = list.find((t) => t.id === targetId)
  const page = makeConn(tab.webSocketDebuggerUrl)
  await page.ready

  const ok = []
  const failed = []
  for (const handle of handles) {
    try {
      await page.send('Page.navigate', { url: `https://www.tiktok.com/@${handle}` })
      let info = { found: false }
      for (let i = 0; i < 8; i++) {
        await sleep(2000)
        const { result } = await page.send('Runtime.evaluate', { expression: EVAL, returnByValue: true })
        info = result.value || { found: false }
        if (info.found && info.avatarMedium) break
      }
      if (!info.found || !info.avatarMedium) {
        failed.push({ handle, reason: 'no_avatar_field' })
        process.stderr.write(`✗ @${handle}: 未读到头像字段\n`)
        continue
      }
      const { result: dl } = await page.send('Runtime.evaluate', {
        expression: FETCH_AS_BASE64(info.avatarMedium), returnByValue: true, awaitPromise: true,
      })
      const d = dl.value
      if (!d || !d.ok) { failed.push({ handle, reason: `download_${d?.status ?? 'unknown'}` }); process.stderr.write(`✗ @${handle}: 页面内下载失败 ${d?.status ?? ''}\n`); continue }
      const contentType = d.contentType
      const buf = Buffer.from(d.base64, 'base64')
      const ext = contentType.includes('png') ? 'png' : 'jpeg'
      const base = handle.replace(/[^a-z0-9._-]/gi, '_')
      const path = `${outDir}/${base}.${ext}`
      await writeFile(path, buf)
      ok.push({ handle, path, contentType, bytes: buf.length })
      process.stderr.write(`✓ @${handle}: ${(buf.length / 1024).toFixed(0)}KB → ${path}\n`)
    } catch (e) {
      failed.push({ handle, reason: e.message })
      process.stderr.write(`✗ @${handle}: ${e.message}\n`)
    }
    await sleep(gap)
  }

  await conn.send('Target.closeTarget', { targetId }).catch(() => {})
  page.ws.close(); conn.ws.close()
  console.log(JSON.stringify({ ok, failed }))
}

main().catch((e) => { console.error(JSON.stringify({ error: e.message })); process.exit(1) })
