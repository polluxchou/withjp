#!/usr/bin/env node
// 扫描一批 handle 的直播间：单 tab 依次导航到 /@handle/live、切前台、探在播、
// 在播则静音+按 object-fit 精裁截图（黑屏字节重试）。不在播跳过。
// 复用 cdp-probe 的静音/裁剪 eval；额外做 navigate + Target.activateTarget（前台=视频才渲染）。
//
// Run:
//   node scripts/live-watch/sweep-live.mjs --handles a,b,c --out-dir /tmp/live [--port 9222] [--gap 3000]
// 输出：stdout 一行 JSON = { live:[{handle,shot,bytes,room}], notlive:[{handle,reason}] }
// 进度写 stderr。

const args = process.argv.slice(2)
function opt(name, fb = null) {
  const i = args.indexOf(`--${name}`); if (i === -1) return fb
  const v = args[i + 1]; return v === undefined || v.startsWith('--') ? true : v
}
const handles = String(opt('handles', '')).split(',').map((s) => s.trim()).filter(Boolean)
const port = Number(opt('port', '9222'))
const gap = Number(opt('gap', '3000'))
const outDir = opt('out-dir')
if (!handles.length || !outDir) { console.error('usage: sweep-live.mjs --handles a,b --out-dir DIR [--port 9222]'); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 直播结束页会展示"推荐直播"信息流，里面别人直播间的缩略视频会被下面的 <video> 检测
// 误判成目标账号本人在播（F: 2026-08-19 实测 solulune.jp/the_re_born 命中，截到别人的直播）。
// 最初想用"已结束"文案关键词拦截，但那批文案是页面预置的 i18n 模板，在真实在播页也会
// 出现（同一天实测 blank.s9/_k.queens 等在播页被误杀），关键词不可靠。改用房间状态码：
// rehydration JSON 里 "status":2=在播，"status":4=已结束（cdp-probe.mjs 同款判法），
// 只有拿到 4 且没有 2 才当真已结束。
function roomEnded(html) {
  const statuses = [...new Set([...html.matchAll(/"(?:status|liveStatus|live_status)"\s*:\s*(\d)/g)].map((m) => Number(m[1])))]
  return statuses.includes(4) && !statuses.includes(2)
}

function parseNum(s) {
  if (s == null) return null
  const m = String(s).replace(/,/g, '').match(/^([\d.]+)\s*([KMB])?$/i)
  if (!m) return null
  let n = parseFloat(m[1]); const suf = (m[2] || '').toUpperCase()
  if (suf === 'K') n *= 1e3; else if (suf === 'M') n *= 1e6; else if (suf === 'B') n *= 1e9
  return Math.round(n)
}
// 本场 startTime（页面唯一）→ 时长；当前房间在线人数 = 左侧"已关注"侧栏里 handle 匹配那项的
// person-count（右侧"观众"面板不稳定/常不渲染；侧栏项 live-side-nav-name=handle，可精确匹配）。
// 依赖：登录账号关注了该竞品（本就如此）。侧栏未加载时匹配不到 → 上层重试。
function extractLiveMeta(html, handle) {
  const sm = html.match(/"startTime":(\d{10})/)
  const re = /data-e2e="live-side-nav-name"[^>]*>([^<]+)<[\s\S]{0,400}?data-e2e="person-count"[^>]*>([\d.,KMB]+)</g
  let m, viewer = null
  while ((m = re.exec(html))) {
    if (m[1].trim().toLowerCase() === handle.toLowerCase()) { viewer = parseNum(m[2]); break }
  }
  return { started_at: sm ? Number(sm[1]) : null, viewer_count: viewer }
}
function conn(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map()
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result) } })
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true }) })
  const send = (method, params = {}, t = 20000) => new Promise((res, rej) => { const mid = ++id; const timer = setTimeout(() => { pend.delete(mid); rej(new Error(method + ' timeout')) }, t); pend.set(mid, { res: (v) => { clearTimeout(timer); res(v) }, rej: (e) => { clearTimeout(timer); rej(e) } }); ws.send(JSON.stringify({ id: mid, method, params })) })
  return { ws, ready, send }
}

// 静音 + 算真实画面矩形（object-fit contain/cover + object-position）；videoWidth>0 且 readyState>=2 才算就绪。
const EVAL = `(()=>{
  const v=document.querySelector('video'); if(!v) return {hasVideo:false};
  v.muted=true; v.volume=0;
  const r=v.getBoundingClientRect(), cs=getComputedStyle(v); const iw=v.videoWidth, ih=v.videoHeight;
  if(!iw||!ih) return {hasVideo:true,ready:false};
  const elR=r.width/r.height, imR=iw/ih; const fit=cs.objectFit||'contain'; let cw,ch;
  if(fit==='cover'){ if(imR>elR){ch=r.height;cw=r.height*imR;}else{cw=r.width;ch=r.width/imR;} }
  else if(fit==='fill'){cw=r.width;ch=r.height;}
  else { if(imR>elR){cw=r.width;ch=r.width/imR;}else{ch=r.height;cw=r.height*imR;} }
  const p=(cs.objectPosition||'50% 50%').split(' '); const fx=(parseFloat(p[0])||50)/100, fy=(parseFloat(p[1])||50)/100;
  return {hasVideo:true, ready:v.readyState>=2, muted:v.muted,
    clip:{x:Math.round(r.x+(r.width-cw)*fx), y:Math.round(r.y+(r.height-ch)*fy), width:Math.round(cw), height:Math.round(ch)}};
})()`

async function main() {
  const { writeFile, mkdir } = await import('node:fs/promises')
  await mkdir(outDir, { recursive: true })
  const ver = await (await fetch(`http://localhost:${port}/json/version`)).json()
  const bc = conn(ver.webSocketDebuggerUrl); await bc.ready
  const { targetId } = await bc.send('Target.createTarget', { url: 'about:blank' })
  const list = await (await fetch(`http://localhost:${port}/json/list`)).json()
  const pc = conn(list.find((t) => t.id === targetId).webSocketDebuggerUrl); await pc.ready

  const live = [], notlive = []
  for (const h of handles) {
    const enter = Date.now() // 进房时刻，用于凑够停留时长
    try {
      await pc.send('Page.navigate', { url: `https://www.tiktok.com/@${h}/live` })
      await bc.send('Target.activateTarget', { targetId }) // 前台，否则视频不渲染
      // 轮询就绪（~26s）
      let info = { hasVideo: false }
      for (let i = 0; i < 13; i++) {
        await sleep(2000)
        const { result } = await pc.send('Runtime.evaluate', { expression: EVAL, returnByValue: true })
        info = result.value || { hasVideo: false }
        if (info.hasVideo && info.ready) break
      }
      if (!(info.hasVideo && info.ready && info.clip && info.clip.width > 50)) {
        notlive.push({ handle: h, reason: info.hasVideo ? 'not_ready' : 'no_video' })
        process.stderr.write(`– @${h}: 未在播/未就绪\n`)
        await dwell(enter); continue // 未播也别秒退（轮询已耗时，dwell 通常已达标）
      }
      // 截图前读 startTime + 在线人数（侧栏可能还没加载，最多轮询 3 次拿人数）
      let meta = { started_at: null, viewer_count: null }
      let html = ''
      for (let r = 0; r < 3; r++) {
        try {
          const { root } = await pc.send('DOM.getDocument', { depth: 1 })
          ;({ outerHTML: html } = await pc.send('DOM.getOuterHTML', { nodeId: root.nodeId }))
          meta = extractLiveMeta(html, h)
        } catch { /* 读不到 */ }
        if (meta.viewer_count != null) break
        await sleep(2000)
      }
      // <video> 就绪但页面其实是"已结束+推荐直播"，检测到的是别人的缩略视频，不是本人画面
      if (roomEnded(html)) {
        notlive.push({ handle: h, reason: 'ended_page_video_false_positive' })
        process.stderr.write(`– @${h}: 页面已结束（拦截了一次 video 误判）\n`)
        await dwell(enter); continue
      }
      const startedAt = meta.started_at
      const base = h.replace(/[^a-z0-9._-]/gi, '_')
      const shotPath = `${outDir}/${base}.png`       // 归档用：精裁直播画面
      const fullPath = `${outDir}/${base}.full.png`   // 留证：整页（供核对在线人数）
      const capturedAt = Math.floor(Date.now() / 1000) // 截图时刻（秒）
      // 精裁图，黑屏字节重试
      let buf
      for (let a = 0; a < 5; a++) {
        const { data } = await pc.send('Page.captureScreenshot', { format: 'png', clip: { ...info.clip, scale: 1 } })
        buf = Buffer.from(data, 'base64')
        if (buf.length >= 120 * 1024) break
        await sleep(3000)
      }
      await writeFile(shotPath, buf)
      // 整页图（供人眼读在线人数）
      try {
        const { data: fd } = await pc.send('Page.captureScreenshot', { format: 'png' })
        await writeFile(fullPath, Buffer.from(fd, 'base64'))
      } catch { /* 整页失败不阻塞 */ }
      const elapsed = startedAt ? capturedAt - startedAt : null
      live.push({ handle: h, shot: shotPath, full: fullPath, bytes: buf.length, viewer_count: meta.viewer_count, started_at: startedAt, captured_at: capturedAt })
      const dur = elapsed != null ? `${Math.floor(elapsed / 3600)}:${String(Math.floor(elapsed % 3600 / 60)).padStart(2, '0')}` : '?'
      process.stderr.write(`✓ @${h}: 在播 ${Math.round(buf.length / 1024)}KB 在线${meta.viewer_count ?? '?'} 已播${dur}\n`)
    } catch (e) {
      notlive.push({ handle: h, reason: e.message })
      process.stderr.write(`✗ @${h}: ${e.message}\n`)
    }
    // 反检测：每个直播间停留够 15–30s（随机）再离开，截完也不秒退——像真观众
    await dwell(enter)
  }

  // 停留到进房满随机 15–30s；已耗时超标则不再等
  async function dwell(enter) {
    const target = 15000 + Math.floor(Math.random() * 15000)
    const remain = target - (Date.now() - enter)
    if (remain > 0) await sleep(remain)
  }
  await bc.send('Target.closeTarget', { targetId }).catch(() => {})
  pc.ws.close(); bc.ws.close()
  console.log(JSON.stringify({ live, notlive }))
}
main().catch((e) => { console.error(JSON.stringify({ error: e.message })); process.exit(1) })
