#!/usr/bin/env node
// 直播 tab 探测/截图（零依赖，Node >= 22：内置 fetch + WebSocket）。
// 连接用户专用 Chrome（--remote-debugging-port），按 handle 找 /@handle/live tab，
// 读取状态信号并可选截图。主要用 CDP 的 Target/DOM/Page 域；截图时用一次性
// Runtime.evaluate 静音并按 object-fit 算出真实画面矩形（见下方就绪/截图段落，
// 有检测面权衡，详见 docs 评审 5.7）。tab 必须处于前台，否则 <video> 不渲染。
//
// Run:
//   node scripts/live-watch/cdp-probe.mjs --handle <handle> [--port 9222]
//        [--wait-for <sec>] [--shot <out.png>] [--reload] [--dump <page.html>]
//
// 输出：单行 JSON（含 video.found/ready/muted/box、shot.bytes 等），供上层判断在播与场次。

const args = process.argv.slice(2)
function opt(name, fallback = null) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

const handle = opt('handle')
const port = Number(opt('port', '9222'))
const shotPath = opt('shot')
const dumpPath = opt('dump')
const doReload = opt('reload') === true

if (!handle) {
  console.error('usage: cdp-probe.mjs --handle <handle> [--port 9222] [--shot out.png] [--reload] [--dump page.html]')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 新版 Chrome（>=~130）有 DNS-rebinding 保护，DevTools HTTP 端点只认 Host: localhost，
// 用 127.0.0.1 会 404。websocket 端点不受此限。
async function listTabs() {
  const res = await fetch(`http://localhost:${port}/json/list`, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`CDP http ${res.status}`)
  return (await res.json()).filter((t) => t.type === 'page')
}

function matchTab(tabs, h) {
  const needle = `/@${h.toLowerCase()}/live`
  const exact = tabs.filter((t) => {
    try { return new URL(t.url).pathname.toLowerCase().startsWith(needle) } catch { return false }
  })
  const related = tabs.filter((t) => t.url.toLowerCase().includes(`@${h.toLowerCase()}`))
  return { exact, related }
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.id = 0
    this.pending = new Map()
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(`${msg.error.message} (${msg.error.code})`)) : resolve(msg.result)
      }
    })
  }
  ready() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', () => reject(new Error('ws connect failed')), { once: true })
    })
  }
  send(method, params = {}, timeoutMs = 15000) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timeout`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { try { this.ws.close() } catch { /* noop */ } }
}

// 从整页 HTML 里抽状态信号。TikTok live 页的 rehydration JSON 里
// status: 2=在播, 4=已结束（实测为准，试运行阶段用 --dump 校正）。
function extractSignals(html) {
  const roomIds = [...new Set([...html.matchAll(/"roomId"\s*:\s*"?(\d{8,})"?/g)].map((m) => m[1]))]
  const statuses = [...new Set([...html.matchAll(/"(?:status|liveStatus|live_status)"\s*:\s*(\d)/g)].map((m) => Number(m[1])))]
  const markers = {
    universalData: html.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__'),
    sigiState: html.includes('SIGI_STATE'),
    endedText: /直播已结束|LIVE has ended|live has ended|ライブは終了/i.test(html),
    captchaHint: /captcha|verify to continue|安全验证|セキュリティ認証/i.test(html),
    loginWall: /login-modal|请登录|ログインして/i.test(html),
  }
  return { roomIds, statuses, markers }
}

async function main() {
  const tabs = await listTabs()
  const { exact, related } = matchTab(tabs, handle)
  if (exact.length === 0) {
    console.log(JSON.stringify({
      ok: false, reason: 'tab_not_found', handle,
      relatedTabs: related.map((t) => ({ url: t.url, title: t.title })),
      allTabs: tabs.map((t) => t.url),
    }))
    process.exit(3)
  }

  const tab = exact[0]
  const cdp = new Cdp(tab.webSocketDebuggerUrl)
  await cdp.ready()

  const waitFor = Number(opt('wait-for', '0')) // 秒：轮询到 <video> 出现或超时（仅 DOM 域，不注入 JS）
  try {
    if (doReload) {
      await cdp.send('Page.reload', { ignoreCache: false })
      await sleep(3000)
    }

    // 读视频状态 + 静音 + 算真实渲染区。用 Runtime.evaluate（一次性 JS 读，非 Runtime.enable
    // 常开）：静音、拿 videoWidth/Height + object-fit/position 算出去掉黑边的真实画面矩形。
    // 纯 DOM.getBoxModel 只能拿到带黑边的 <video> 元素框，无法得到内在画面区，故必须走这里。
    const evalExpr = `(()=>{
      const v=document.querySelector('video');
      if(!v) return {hasVideo:false};
      v.muted=true; v.volume=0;
      const r=v.getBoundingClientRect(), cs=getComputedStyle(v);
      const iw=v.videoWidth, ih=v.videoHeight;
      if(!iw||!ih) return {hasVideo:true, ready:false};
      const elR=r.width/r.height, imR=iw/ih; const fit=cs.objectFit||'contain';
      let cw,ch;
      if(fit==='cover'){ if(imR>elR){ch=r.height;cw=r.height*imR;}else{cw=r.width;ch=r.width/imR;} }
      else if(fit==='fill'){cw=r.width;ch=r.height;}
      else { if(imR>elR){cw=r.width;ch=r.width/imR;}else{ch=r.height;cw=r.height*imR;} }
      const p=(cs.objectPosition||'50% 50%').split(' ');
      const fx=(parseFloat(p[0])||50)/100, fy=(parseFloat(p[1])||50)/100;
      return {hasVideo:true, ready:v.readyState>=2, muted:v.muted, vw:iw, vh:ih,
        clip:{x:Math.round(r.x+(r.width-cw)*fx), y:Math.round(r.y+(r.height-ch)*fy),
              width:Math.round(cw), height:Math.round(ch)}};
    })()`
    async function readVideo() {
      const { result } = await cdp.send('Runtime.evaluate', { expression: evalExpr, returnByValue: true })
      return result.value || { hasVideo: false }
    }

    // 轮询就绪：直播页异步拉流，<video> 挂载 + metadata（videoWidth>0）+ readyState>=2 才算就绪。
    let vinfo = await readVideo()
    const deadline = Date.now() + waitFor * 1000
    while (waitFor > 0 && !(vinfo.hasVideo && vinfo.ready) && Date.now() < deadline) {
      await sleep(2000)
      vinfo = await readVideo()
    }

    const { root } = await cdp.send('DOM.getDocument', { depth: 1 })
    const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId: root.nodeId })
    const signals = extractSignals(outerHTML)
    if (dumpPath) {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(dumpPath, outerHTML)
    }

    const video = vinfo.hasVideo
      ? { found: true, ready: Boolean(vinfo.ready), muted: Boolean(vinfo.muted), vw: vinfo.vw, vh: vinfo.vh, box: vinfo.clip }
      : { found: false }

    let shot = null
    if (shotPath) {
      const { writeFile } = await import('node:fs/promises')
      const hasClip = video.found && video.box && video.box.width > 50 && video.box.height > 50
      // 黑屏重试：<video> 已挂载但帧还没解码时截出来是黑的（字节数极小）。最多重试几次到字节数达标。
      const MIN_BYTES = 120 * 1024
      let data, buf
      for (let attempt = 0; attempt < 5; attempt++) {
        const params = hasClip ? { format: 'png', clip: { ...video.box, scale: 1 } } : { format: 'png' }
        try {
          ;({ data } = await cdp.send('Page.captureScreenshot', params))
        } catch {
          ;({ data } = await cdp.send('Page.captureScreenshot', { format: 'png' }))
        }
        buf = Buffer.from(data, 'base64')
        if (buf.length >= MIN_BYTES || !hasClip) break
        await sleep(3000)
      }
      await writeFile(shotPath, buf)
      shot = { path: shotPath, clipped: hasClip, bytes: buf.length }
    }

    console.log(JSON.stringify({
      ok: true,
      tab: { url: tab.url, title: tab.title },
      reloaded: doReload,
      ...signals,
      video,
      shot,
      htmlBytes: outerHTML.length,
    }))
  } finally {
    cdp.close()
  }
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, reason: 'error', message: e.message }))
  process.exit(1)
})
