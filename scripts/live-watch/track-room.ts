// 单直播间分钟级打点采集器。人工启动，跟到下播自动收工。
// 全程只读页面已有内容，不发弹幕/不点赞/不关注。
//
// 前置：专用 Chrome 已带 --remote-debugging-port=9222 启动。
// Run:
//   node --experimental-strip-types scripts/live-watch/track-room.ts \
//     --handle <handle> [--port 9222] [--base-dir ~/live-watch] [--shot-every 150]
//
// 产出：<base-dir>/<handle>/<JST 时间戳>/{samples.jsonl, frames/*.png, session.json}
// 本期不写数据库 —— 入库是第二期的事。

import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'

import {
  initialWatchdog, nextWatchdog, normalizeSample, roomEnded, sessionPaths,
  type ProbeSample, type WatchdogState,
} from '../../src/lib/competitors/liveTrack.ts'
import { clipSource, defaultProbeConfig, probeSource } from '../../src/lib/competitors/liveProbe.ts'

const args = process.argv.slice(2)
function opt(name: string, fallback: string | null = null): string | null {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? 'true' : v
}

const handle = opt('handle')
const port = Number(opt('port', '9222'))
const baseDir = opt('base-dir', `${homedir()}/live-watch`)!
const shotEvery = Number(opt('shot-every', '150')) * 1000
const drainEvery = 60_000

if (!handle) {
  console.error('usage: track-room.ts --handle <handle> [--port 9222] [--base-dir DIR] [--shot-every 150]')
  process.exit(2)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---- 极简 CDP 客户端（同 sweep-live 的写法，不引 puppeteer）--------------------
type Conn = { ws: WebSocket; ready: Promise<void>; send: (m: string, p?: object, t?: number) => Promise<any> }
function conn(wsUrl: string): Conn {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pend = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(String((e as MessageEvent).data))
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id)!
      pend.delete(m.id)
      m.error ? rej(new Error(m.error.message)) : res(m.result)
    }
  })
  const ready = new Promise<void>((res, rej) => {
    ws.addEventListener('open', () => res(), { once: true })
    ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true })
  })
  const send = (method: string, params: object = {}, t = 20_000) =>
    new Promise<any>((res, rej) => {
      const mid = ++id
      const timer = setTimeout(() => { pend.delete(mid); rej(new Error(method + ' timeout')) }, t)
      pend.set(mid, {
        res: (v) => { clearTimeout(timer); res(v) },
        rej: (e) => { clearTimeout(timer); rej(e) },
      })
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  return { ws, ready, send }
}

async function evaluate(pc: Conn, expression: string): Promise<any> {
  const { result } = await pc.send('Runtime.evaluate', { expression, returnByValue: true })
  return result?.value ?? null
}

/** 整页 HTML —— 下播判定与开播时间都从这里取。较重，所以只在需要时读。 */
async function pageHtml(pc: Conn): Promise<string> {
  const { root } = await pc.send('DOM.getDocument', { depth: 1 })
  const { outerHTML } = await pc.send('DOM.getOuterHTML', { nodeId: root.nodeId })
  return outerHTML as string
}

function readStartTime(html: string): number | null {
  const m = html.match(/"startTime":(\d{10})/)
  return m ? Number(m[1]) : null
}

/** 「不在播」不是异常，是正常结果 —— 用它把早退和真错误区分开，退出码也不同。 */
class NotLive extends Error {}

// ---- 主流程 -----------------------------------------------------------------
async function main() {
  const ver = await (await fetch(`http://localhost:${port}/json/version`)).json()
  const bc = conn(ver.webSocketDebuggerUrl)
  await bc.ready
  const { targetId } = await bc.send('Target.createTarget', { url: 'about:blank' })
  const list = await (await fetch(`http://localhost:${port}/json/list`)).json()
  const pc = conn(list.find((t: any) => t.id === targetId).webSocketDebuggerUrl)
  await pc.ready

  try {
    await pc.send('Page.navigate', { url: `https://www.tiktok.com/@${handle}/live` })
    // 前台，否则视频不渲染、页内定时器还会被节流
    await bc.send('Target.activateTarget', { targetId })

    // 等 video 就绪（最多 ~26s）
    let clip: any = null
    for (let i = 0; i < 13; i++) {
      await sleep(2000)
      const info = await evaluate(pc, clipSource())
      if (info?.hasVideo && info.ready && info.clip?.width > 50) { clip = info.clip; break }
    }
    if (!clip) throw new NotLive('未在播或视频未就绪')

    const html0 = await pageHtml(pc)
    if (roomEnded(html0)) throw new NotLive('页面已结束（拦下一次 video 误判）')
    const startedAt = readStartTime(html0)
    const paths = sessionPaths(baseDir, handle!, startedAt)
    await mkdir(paths.frames, { recursive: true })
    console.error(`✓ @${handle}: 开始跟踪 → ${paths.dir}`)

    await evaluate(pc, probeSource(defaultProbeConfig()))

    let wd: WatchdogState = initialWatchdog()
    let total = 0
    let lastShotAt = 0
    // 精裁算式假设 object-fit 是 cover/contain/fill、object-position 回来的是百分比。
    // 这两条都没在真实页面上验过，所以原样记进 session.json，让第一场把它们坐实。
    let objectFit: string | null = null
    let objectPosition: string | null = null
    const startedTracking = Date.now()
    // 整页 HTML 读一次很贵（几 MB），10 分钟一次就够。用墙上时间判 ——
    // total 是累计采样点数不是轮数：一轮抓到两条会跨过 10 的倍数（该读的那次被跳过），
    // 一轮抓到零条又会在同一个数上连续命中（连读两次整页），首轮 total=0 还会立刻触发。
    const HEAVY_EVERY = 10 * 60_000
    let lastHeavyAt = Date.now() // 进循环前刚读过 html0，从那时起算

    for (;;) {
      await sleep(drainEvery)

      const batch: ProbeSample[] = (await evaluate(pc, 'window.__lw ? window.__lw.drain() : []')) ?? []
      for (const p of batch) {
        const s = normalizeSample(p, startedAt)
        await appendFile(paths.samples, JSON.stringify(s) + '\n')
        total += 1
        console.error(
          `  ${s.elapsed_seconds ?? '?'}s 在线${s.viewer_count ?? '?'} 粉${s.follower_count ?? '?'} 弹幕${s.chat_msgs}/${s.chat_speakers}人`,
        )
      }

      const heavy = Date.now() - lastHeavyAt >= HEAVY_EVERY
      const html = heavy ? await pageHtml(pc) : ''
      if (heavy) lastHeavyAt = Date.now()
      const info = await evaluate(pc, clipSource())
      // 必须同时看 ready：视频拿到尺寸但还没画出第一帧时，拿那个矩形去截就是黑帧
      if (info?.ready && info.clip?.width > 50) clip = info.clip
      if (info?.fit) { objectFit = info.fit; objectPosition = info.pos ?? null }

      if (heavy && startedAt != null && readStartTime(html) !== startedAt) {
        console.error('！开播时间变了 —— 对方重开了一场，本场收工（新场次请重新启动）')
        break
      }

      const alive = (await evaluate(pc, 'window.__lw ? window.__lw.alive() : false')) === true
      // 页面被整个导航走时 rehydration JSON 读不到，roomEnded 会一直是 false，
      // 只能落到三轮不健康的慢路上 —— 中间两轮还在往没有直播间 DOM 的页面里重注探针。
      // URL 是这种情况下唯一还可信的信号，每轮都读，很便宜。
      const href = String((await evaluate(pc, 'location.href')) ?? '')
      const step = nextWatchdog(wd, {
        samples: batch.length,
        observerAlive: alive,
        hasVideo: !!info?.hasVideo,
        roomEnded: heavy ? roomEnded(html) : false,
        onRoomUrl: href.includes(`/@${handle}/live`),
      })
      wd = step.state
      if (step.action === 'reinject') {
        // 注意不能直接重 eval probeSource：版本号相同时工厂会 reused:true 原样返回，
        // 什么都不做 —— 那样两次「重注入」全是空转，恢复路径等于没有。
        // 先让页内的探针自己重挂 observer；只有 __lw 整个没了（页面刷新过）才整份重注。
        console.error('！探针失联，重挂')
        const reattached = await evaluate(pc, 'window.__lw ? (window.__lw.reattach(), true) : false')
        if (!reattached) await evaluate(pc, probeSource(defaultProbeConfig()))
      } else if (step.action === 'end') {
        console.error('✓ 判定下播，收工')
        break
      }
    }

    await writeFile(paths.meta, JSON.stringify({
      handle,
      stream_started_at: startedAt,
      tracking_started_at: new Date(startedTracking).toISOString(),
      tracking_ended_at: new Date().toISOString(),
      sample_count: total,
      expected_count: Math.round((Date.now() - startedTracking) / drainEvery),
      object_fit: objectFit,
      object_position: objectPosition,
    }, null, 2))
    console.error(`✓ 收工：${total} 个采样点 → ${paths.samples}`)
  } finally {
    // 早退也必须关掉 tab：Target.createTarget 开的是真 tab，而 process.exit 不会
    // 回来跑收尾。每次对着没在播的 handle 跑一次就积一个挂在竞品直播页上的孤儿 tab,
    // 既是资源泄漏,也是白白多出来的暴露面。
    await bc.send('Target.closeTarget', { targetId }).catch(() => {})
    pc.ws.close()
    bc.ws.close()
  }
}

main().catch((e) => {
  if (e instanceof NotLive) { console.error(`✗ @${handle}: ${e.message}，退出`); process.exit(3) }
  console.error('✗', e.message)
  process.exit(1)
})
