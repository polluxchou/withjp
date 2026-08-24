#!/usr/bin/env node
// 一轮竞品直播巡检：侧栏发现在播 → 过滤竞品库 → 逐个侧栏点击进房 → reload 取权威状态
// → 静音精裁截图 + 整页留证 → 停留 15–30s。只产出文件和 JSON，**不入库**
// （入库前必须人眼核实画面，见 skill competitor-live-daily-shot 第 4 步）。
//
// Run:
//   node scripts/live-watch/sweep-round.mjs --out-dir /path/round-1 [--port 9222]
//   加 --handles a,b 可跳过侧栏发现、只跑指定账号
// 输出：stdout 一行 JSON = { round_at, live:[...], skipped:[...], sidebar:[...], alert }
//
// 与 sweep-live.mjs 的差别（都是踩过的坑）：
//  1) 导航走**侧栏真实点击**（Input.dispatchMouseEvent），不拼 URL 开新 tab —— 连续拼 URL
//     像自动化任务，会抬高风控概率。见 memory feedback-live-watch-navigate-via-sidebar。
//  2) 在播判定**必须 statuses 含 2**。sweep-live.mjs 的 roomEnded() 是"含 4 且不含 2"，
//     statuses=[0] 这种会漏过去；而"已结束页的推荐流会内嵌别人的真实视频流"，靠 video
//     ready / roomId 匹配都可能是假信号（uni.chuuu 实测）。宁可漏拍，不要张冠李戴。
//  3) SPA 侧栏点击后页面里的 rehydration JSON 是**上一页残留**，所以点进去必须 reload
//     一次才能读到当前房间的 statuses（1tb.boiz 实测：点击后读到 [0,4]，reload 后 [0,2]）。

const args = process.argv.slice(2)
function opt(name, fb = null) {
  const i = args.indexOf(`--${name}`); if (i === -1) return fb
  const v = args[i + 1]; return v === undefined || v.startsWith('--') ? true : v
}
const outDir = opt('out-dir')
const forcedHandles = String(opt('handles', '')).split(',').map((s) => s.trim().replace(/^@/, '')).filter(Boolean)
// --only：允许名单（通常是竞品库顶层团），与侧栏发现结果求交集。侧栏里混着小号关注的
// 非竞品账号（实测 luckintoy/havi.20.02/servauto.my 等都不在库），不过滤就会进错房间。
const onlyList = String(opt('only', '')).split(',').map((s) => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)
if (!outDir) { console.error('usage: sweep-round.mjs --out-dir DIR [--port 9222] [--only a,b] [--handles a,b]'); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowSec = () => Math.floor(Date.now() / 1000)

function conn(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result) }
  })
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true })
  })
  const send = (method, params = {}, t = 30000) => new Promise((res, rej) => {
    const mid = ++id
    const timer = setTimeout(() => { pend.delete(mid); rej(new Error(method + ' timeout')) }, t)
    pend.set(mid, { res: (v) => { clearTimeout(timer); res(v) }, rej: (e) => { clearTimeout(timer); rej(e) } })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  return { ws, ready, send }
}

// 静音 + 按 object-fit/position 算去掉黑边的真实画面矩形（与 cdp-probe.mjs / sweep-live.mjs 同款）
const EVAL_VIDEO = `(()=>{
  const v=document.querySelector('video'); if(!v) return {hasVideo:false};
  v.muted=true; v.volume=0;
  if(v.paused) { try{ v.play(); }catch(e){} }
  const r=v.getBoundingClientRect(), cs=getComputedStyle(v); const iw=v.videoWidth, ih=v.videoHeight;
  if(!iw||!ih) return {hasVideo:true,ready:false};
  const elR=r.width/r.height, imR=iw/ih; const fit=cs.objectFit||'contain'; let cw,ch;
  if(fit==='cover'){ if(imR>elR){ch=r.height;cw=r.height*imR;}else{cw=r.width;ch=r.width/imR;} }
  else if(fit==='fill'){cw=r.width;ch=r.height;}
  else { if(imR>elR){cw=r.width;ch=r.width/imR;}else{ch=r.height;cw=r.height*imR;} }
  const p=(cs.objectPosition||'50% 50%').split(' ');
  const fx=(parseFloat(p[0])||50)/100, fy=(parseFloat(p[1])||50)/100;
  return {hasVideo:true, ready:v.readyState>=2, muted:v.muted, paused:v.paused,
    currentTime:v.currentTime, vw:iw, vh:ih,
    clip:{x:Math.round(r.x+(r.width-cw)*fx), y:Math.round(r.y+(r.height-ch)*fy),
          width:Math.round(cw), height:Math.round(ch)}};
})()`

const parseNum = (s) => {
  if (s == null) return null
  const m = String(s).replace(/,/g, '').match(/^([\d.]+)\s*([KMB])?$/i); if (!m) return null
  let n = parseFloat(m[1]); const f = (m[2] || '').toUpperCase()
  if (f === 'K') n *= 1e3; else if (f === 'M') n *= 1e6; else if (f === 'B') n *= 1e9
  return Math.round(n)
}
// 侧栏"关注中"里当前在播的账号 + 在线人数。
// 曾经用正则「name 后 400 字符内必须跟 person-count」来配对，结果**静默漏掉大量条目**：
// 没有邻近 person-count 的条目直接被跳过，实测侧栏 15 条只解析出 5 条，4 个在播竞品
// （the_re_born/nexis_boys.8/kittybell.jp/kiraria_official）连续多轮没被采集。
// 那段逻辑源自 sweep-live.mjs 的 extractLiveMeta——它是「查单个 handle 的人数」（命中即 break），
// 拿来做列表枚举是误用。改走 DOM：先枚举全部条目，人数作为可选字段附加（拿不到就 null）。
const EVAL_SIDEBAR = `(()=>{
  return [...document.querySelectorAll('[data-e2e="live-side-nav-name"]')].map(el=>{
    const name=el.textContent.trim();
    const item=el.closest('a')||el.parentElement?.parentElement||el.parentElement;
    const pc=item?item.querySelector('[data-e2e="person-count"]'):null;
    return {handle:name, viewersText: pc?pc.textContent.trim():null};
  });
})()`
function normalizeSidebar(rows) {
  return (rows || []).filter((r) => r && r.handle).map((r) => ({ handle: r.handle, viewers: parseNum(r.viewersText) }))
}
const readStatuses = (html) => [...new Set([...html.matchAll(/"(?:status|liveStatus|live_status)"\s*:\s*(\d)/g)].map((m) => Number(m[1])))]
const readRoomIds = (html) => [...new Set([...html.matchAll(/"roomId"\s*:\s*"?(\d{8,})"?/g)].map((m) => m[1]))]
const readStartTime = (html) => { const m = html.match(/"startTime":(\d{10})/); return m ? Number(m[1]) : null }

async function findPort() {
  for (const p of [Number(opt('port', 0)) || null, 9222, 9223].filter(Boolean)) {
    try {
      const r = await fetch(`http://localhost:${p}/json/version`, { signal: AbortSignal.timeout(2500) })
      if (r.ok) return p
    } catch { /* 下一个 */ }
  }
  return null
}

async function main() {
  const { writeFile, mkdir } = await import('node:fs/promises')
  await mkdir(outDir, { recursive: true })

  const port = await findPort()
  if (!port) { console.log(JSON.stringify({ alert: 'cdp_unreachable', hint: '专用 Chrome 没在跑或调试端口变了' })); process.exit(3) }

  const tabs = (await (await fetch(`http://localhost:${port}/json/list`)).json()).filter((t) => t.type === 'page')
  const tab = tabs.find((t) => t.url.includes('tiktok.com/@'))
  if (!tab) { console.log(JSON.stringify({ alert: 'no_tiktok_tab', port, tabs: tabs.map((t) => t.url) })); process.exit(4) }

  const bws = (await (await fetch(`http://localhost:${port}/json/version`)).json()).webSocketDebuggerUrl
  const bc = conn(bws); await bc.ready
  const pc = conn(tab.webSocketDebuggerUrl); await pc.ready
  const readHtml = async () => {
    const { root } = await pc.send('DOM.getDocument', { depth: 1 })
    return (await pc.send('DOM.getOuterHTML', { nodeId: root.nodeId })).outerHTML
  }

  // 1. 侧栏发现在播（零新增 TikTok 请求）
  const readSidebarDom = async () => normalizeSidebar(
    (await pc.send('Runtime.evaluate', { expression: EVAL_SIDEBAR, returnByValue: true })).result.value)

  // 1a. 先展开「See all」。侧栏可见区只放 5 条 + 一个折叠控件，折叠区的条目虽然在 DOM 里
  // （所以枚举得到），但 getBoundingClientRect 拿不到可点坐标 → 点击导航必然失败，
  // 表现为 skipped:not_in_sidebar（实测 kiraria_official 这样丢掉）。展开后才都可点。
  // 用真实点击而非 element.click()，与导航同一套反检测约束。
  const EVAL_SEEALL = `(()=>{
    const btn=[...document.querySelectorAll('button,a,div[role="button"],p,span')]
      .find(e=>/^(see all|すべて見る|全部を見る|모두 보기)$/i.test((e.textContent||'').trim()));
    if(!btn) return {found:false};
    btn.scrollIntoView({block:'center'});
    const r=btn.getBoundingClientRect();
    return {found:true, x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
  })()`
  try {
    const before = (await readSidebarDom()).length
    const se = (await pc.send('Runtime.evaluate', { expression: EVAL_SEEALL, returnByValue: true })).result.value
    if (se?.found) {
      await bc.send('Target.activateTarget', { targetId: tab.id })
      await sleep(600)
      await pc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: se.x, y: se.y, button: 'none', clickCount: 0 })
      await sleep(250)
      await pc.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: se.x, y: se.y, button: 'left', clickCount: 1 })
      await sleep(80)
      await pc.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: se.x, y: se.y, button: 'left', clickCount: 1 })
      await sleep(1500)
      process.stderr.write(`· 侧栏 See all 已点开（条目 ${before} → ${(await readSidebarDom()).length}）\n`)
    }
  } catch { /* 展不开就照常跑可见的那几条 */ }

  const sidebar = await readSidebarDom()
  const discovered = forcedHandles.length ? forcedHandles : sidebar.map((s) => s.handle)
  const targets = onlyList.length ? discovered.filter((h) => onlyList.includes(h.toLowerCase())) : discovered
  const offlist = onlyList.length ? discovered.filter((h) => !onlyList.includes(h.toLowerCase())) : []

  const live = [], skipped = []
  let alert = null

  for (const h of targets) {
    const enter = Date.now()
    const dwell = async () => {
      const target = 15000 + Math.floor(Math.random() * 15000)
      const remain = target - (Date.now() - enter)
      if (remain > 0) await sleep(remain)
    }
    try {
      // 2. 侧栏真实点击进房（不拼 URL）
      const locate = `(()=>{
        const items=[...document.querySelectorAll('[data-e2e="live-side-nav-name"]')];
        const hit=items.find(el=>el.textContent.trim().toLowerCase()===${JSON.stringify(h.toLowerCase())});
        if(!hit) return {found:false};
        hit.scrollIntoView({block:'center'});
        const a=hit.closest('a')||hit.parentElement; const r=a.getBoundingClientRect();
        return {found:true,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
      })()`
      const already = (await pc.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }))
        .result.value.toLowerCase().includes(`@${h.toLowerCase()}/live`)
      if (!already) {
        await bc.send('Target.activateTarget', { targetId: tab.id })
        await sleep(1200)
        await pc.send('Runtime.evaluate', { expression: locate, returnByValue: true }) // 触发 scrollIntoView
        await sleep(700)
        const loc = (await pc.send('Runtime.evaluate', { expression: locate, returnByValue: true })).result.value
        if (!loc?.found) { skipped.push({ handle: h, reason: 'not_in_sidebar' }); continue }
        await pc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: loc.x, y: loc.y, button: 'none', clickCount: 0 })
        await sleep(400 + Math.floor(Math.random() * 500))
        await pc.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: loc.x, y: loc.y, button: 'left', clickCount: 1 })
        await sleep(70 + Math.floor(Math.random() * 90))
        await pc.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: loc.x, y: loc.y, button: 'left', clickCount: 1 })
        let ok = false
        for (let i = 0; i < 20 && !ok; i++) {
          await sleep(1000)
          ok = (await pc.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }))
            .result.value.toLowerCase().includes(`@${h.toLowerCase()}`)
        }
        if (!ok) { skipped.push({ handle: h, reason: 'nav_failed' }); await dwell(); continue }
      } else {
        await bc.send('Target.activateTarget', { targetId: tab.id })
        await sleep(1000)
      }

      // 3. reload 取权威状态（SPA 跳转后 rehydration JSON 是上一页残留）
      await pc.send('Page.reload', { ignoreCache: false })
      await sleep(3500)

      // 4. 等 <video> 就绪（帧解码好才截，否则是黑屏加载圈）
      let info = { hasVideo: false }
      for (let i = 0; i < 20; i++) {
        const { result } = await pc.send('Runtime.evaluate', { expression: EVAL_VIDEO, returnByValue: true })
        info = result.value || { hasVideo: false }
        if (info.hasVideo && info.ready) break
        await sleep(2000)
      }

      // 5. 权威在播判定：statuses 必须含 2，不许用 video ready / roomId 去推翻
      const html = await readHtml()
      const statuses = readStatuses(html)
      if (!statuses.includes(2)) {
        skipped.push({ handle: h, reason: 'not_live', statuses, video_ready: Boolean(info.ready) })
        await dwell(); continue
      }
      if (!(info.hasVideo && info.ready && info.clip && info.clip.width > 50)) {
        skipped.push({ handle: h, reason: 'video_not_ready', statuses })
        await dwell(); continue
      }

      // 6b. 活性闸门：readyState>=2 + videoWidth>0 **不代表画面在动**。播放器被暂停时
      // （用户手动按暂停，或标签页被冻结）readyState 仍是 4、videoWidth 正常，截出来是一张
      // 冻结在若干分钟前的帧，却会配上当前时间戳入库——静默的数据污染。实测 atoz.girls
      // 被手动暂停时 currentTime 卡在 1020.25 纹丝不动，而原有闸门全部放行。
      // 唯一可靠的判据是 currentTime 真的在推进。EVAL_VIDEO 已尝试 v.play() 自动恢复。
      let advancing = false
      const t0 = info.currentTime
      for (let i = 0; i < 5 && !advancing; i++) {
        await sleep(1500)
        const { result } = await pc.send('Runtime.evaluate', { expression: EVAL_VIDEO, returnByValue: true })
        const cur = result.value || {}
        if (cur.currentTime != null && cur.currentTime - t0 > 0.3) { advancing = true; info = cur }
      }
      if (!advancing) {
        skipped.push({ handle: h, reason: 'video_frozen', statuses, paused: Boolean(info.paused), current_time: t0 })
        process.stderr.write(`– @${h}: 画面冻结（paused=${info.paused}，currentTime 不推进）→ 不截图\n`)
        await dwell(); continue
      }

      const startedAt = readStartTime(html)
      // 侧栏是异步渲染的：reload 后立刻读常常还没挂上，person-count 拿不到就是 null。
      // 最多重读 3 次（实测第 1 次几乎总是空）。
      let viewer = (await readSidebarDom()).find((s) => s.handle.toLowerCase() === h.toLowerCase())?.viewers ?? null
      for (let r = 0; r < 3 && viewer == null; r++) {
        await sleep(2000)
        try {
          viewer = (await readSidebarDom()).find((s) => s.handle.toLowerCase() === h.toLowerCase())?.viewers ?? null
        } catch { /* 读不到就下一轮 */ }
      }
      const base = h.replace(/[^a-z0-9._-]/gi, '_')
      const shotPath = `${outDir}/${base}.png`
      const fullPath = `${outDir}/${base}.full.png`
      const capturedAt = nowSec()

      // 6. 精裁截图，黑屏按字节数重试
      let buf
      for (let a = 0; a < 5; a++) {
        const { data } = await pc.send('Page.captureScreenshot', { format: 'png', clip: { ...info.clip, scale: 1 } })
        buf = Buffer.from(data, 'base64')
        if (buf.length >= 120 * 1024) break
        await sleep(3000)
      }
      await writeFile(shotPath, buf)
      try {
        const { data: fd } = await pc.send('Page.captureScreenshot', { format: 'png' })
        await writeFile(fullPath, Buffer.from(fd, 'base64'))
      } catch { /* 整页留证失败不阻塞 */ }

      live.push({ handle: h, shot: shotPath, full: fullPath, bytes: buf.length, statuses,
        room_id: readRoomIds(html)[0] ?? null, viewer_count: viewer,
        started_at: startedAt, captured_at: capturedAt,
        elapsed_min: startedAt ? Math.round((capturedAt - startedAt) / 60) : null })
      process.stderr.write(`✓ @${h} 在播 ${Math.round(buf.length / 1024)}KB 在线${viewer ?? '?'} 已播${startedAt ? Math.round((capturedAt - startedAt) / 60) + 'min' : '?'}\n`)
    } catch (e) {
      skipped.push({ handle: h, reason: e.message })
      process.stderr.write(`✗ @${h}: ${e.message}\n`)
      // 连接层挂了就别继续戳（可能是风控/浏览器异常）——熔断交给人
      if (/ws fail|timeout/.test(e.message)) { alert = `connection_trouble_at_${h}`; break }
    }
    await dwell()
  }

  pc.ws.close(); bc.ws.close()
  console.log(JSON.stringify({ round_at: nowSec(), port, sidebar, offlist, live, skipped, alert }, null, 2))
}
main().catch((e) => { console.error(JSON.stringify({ error: e.message })); process.exit(1) })
