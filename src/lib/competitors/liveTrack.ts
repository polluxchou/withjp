// 纯函数，只 import 同目录纯函数模块：供采集脚本（--experimental-strip-types）与视图共用。
// 单直播间分钟级打点的 Node 侧逻辑。页内探针源码在 liveProbe.ts，两者零依赖。

import { parseCount } from './metrics.ts'

/**
 * 页面是否已下播。
 * rehydration JSON 里 "status":2=在播、4=已结束。结束页会混入「推荐直播」信息流，
 * 那里面别人的在播卡片同样带 status 2 —— 所以只有「有 4 且没有 2」才判结束。
 * 一个状态码都读不到时返回 false：不下结论，交给看门狗的其它信号。
 */
export function roomEnded(html: string): boolean {
  const codes = new Set<number>()
  for (const m of Array.from(html.matchAll(/"(?:status|liveStatus|live_status)"\s*:\s*(\d)/g))) {
    codes.add(Number(m[1]))
  }
  return codes.has(4) && !codes.has(2)
}

/**
 * 探针每次打点报回的「各字段命中了哪个候选选择器」，没命中是 null。
 * 键是固定的四个 —— 候选表会随实测增补，但字段本身不会变，所以用闭合类型而非
 * Record<string, ...>：写错一个键名要在编译期就炸，别等到报表上少一列才发现。
 */
export type SelectorHits = {
  viewer: string | null
  followers: string | null
  likes: string | null
  chatHost: string | null
}

/** 探针从页面交回的一条原始读数。字段都可能读不到 —— 读不到就是 null。 */
export type ProbeSample = {
  /** 探针打点时刻，epoch 毫秒 */
  t: number
  viewer: string | null
  followers: string | null
  likes: string | null
  /** 本分钟弹幕条数 */
  msgs: number
  /** 本分钟去重后的发言人数 */
  speakers: number
  observerAlive: boolean
  /** 各字段实际命中了候选表里的哪个选择器；没命中是 null */
  selectorsOk: SelectorHits
}

/** 规范化后的一分钟采样点。落 JSONL 用的就是这个形状。 */
export type Sample = {
  sampled_at: string
  elapsed_seconds: number | null
  viewer_count: number | null
  follower_count: number | null
  like_total: number | null
  chat_msgs: number
  chat_speakers: number
  raw: {
    observer_alive: boolean
    selectors_ok: SelectorHits
    /** 发生了负值钳制时，记下钳之前的值；没钳制是 null */
    elapsed_before_clamp: number | null
    viewer_text: string | null
    followers_text: string | null
    likes_text: string | null
  }
}

/**
 * 探针原始读数 → 规范化采样点。
 * startedAt 为本场开播的 epoch 秒（runner 侧读到并持有）；未知时 elapsed_seconds 留 null
 * 而不是猜一个值 —— 报表 x 轴靠它，猜错整条曲线就错位。
 */
export function normalizeSample(p: ProbeSample, startedAt: number | null): Sample {
  const delta = startedAt == null ? null : Math.round(p.t / 1000) - startedAt
  return {
    sampled_at: new Date(p.t).toISOString(),
    elapsed_seconds: delta == null ? null : Math.max(0, delta),
    viewer_count: parseCount(p.viewer),
    follower_count: parseCount(p.followers),
    like_total: parseCount(p.likes),
    chat_msgs: p.msgs,
    chat_speakers: p.speakers,
    raw: {
      observer_alive: p.observerAlive,
      selectors_ok: p.selectorsOk,
      // 负值被钳到 0 时留痕。startTime 解析错会让一堆采样点全堆在 elapsed 0，
      // 而第二期入库带 unique(session_id, elapsed_seconds) —— 那时才以插入冲突
      // 的形式爆出来就太晚了。在这里记一笔，排查和报表都看得见。
      elapsed_before_clamp: delta != null && delta < 0 ? delta : null,
      viewer_text: p.viewer,
      followers_text: p.followers,
      likes_text: p.likes,
    },
  }
}

/** 一轮排空之后观察到的健康状况。 */
export type DrainHealth = {
  /** 本轮从探针取回几个采样点 */
  samples: number
  observerAlive: boolean
  hasVideo: boolean
  /** roomEnded() 的结论 */
  roomEnded: boolean
  /** 当前 tab 的 URL 仍然是目标直播间；false = 页面已被导航走 */
  onRoomUrl: boolean
}

/**
 * reinjects 的语义是「距上次健康以来连续不健康的轮数」，不是「本场累计重注入次数」——
 * 健康一次就清零。二者当前恒等，因为每个不健康轮次只有 reinject 和 end 两种去向；
 * 将来若加入第三种不重注探针的补救动作（比如整页 reload），这个字段就必须拆开。
 * ended 是收工闩：一旦为真，后续调用恒返回 end。
 */
export type WatchdogState = { reinjects: number; ended: boolean }
export type WatchdogAction = 'ok' | 'reinject' | 'end'

const MAX_REINJECTS = 2

export function initialWatchdog(): WatchdogState {
  return { reinjects: 0, ended: false }
}

/**
 * 看门狗一步。
 * status 码判结束最可靠，命中就立即收工，不浪费两轮重注入；URL 被导航走同理立即收工——
 * 页面都不在了，rehydration 读不到、探针也无处可注，慢慢耗完两轮重注入毫无意义。
 * 其余异常一律先试重注入 —— 探针掉了比直播结束常见得多（页面局部重渲染就够）。
 * 但要注意 reinject 这个动作名只对 samples===0 那种情况名副其实：observerAlive/hasVideo
 * 掉了的话重新注入探针并不能把丢失的 DOM 变回来，实际语义是「再等一轮看它能不能自愈，
 * 等不到就放弃」——结果是对的，只是动作名把因果讲得比实际笃定。
 * 重注入两次仍然没数据，才判下播。
 */
export function nextWatchdog(
  state: WatchdogState,
  h: DrainHealth,
): { state: WatchdogState; action: WatchdogAction } {
  // 吸收态优先：收工过就不再改主意
  if (state.ended) return { state, action: 'end' }
  // status 码判结束最可靠；URL 变了说明页面整个被导航走，rehydration 读不到、
  // 探针也无处可注 —— 这两种都立即收工，不浪费两轮重注入。
  if (h.roomEnded || !h.onRoomUrl) return { state: { ...state, ended: true }, action: 'end' }
  const healthy = h.samples > 0 && h.observerAlive && h.hasVideo
  if (healthy) return { state: { reinjects: 0, ended: false }, action: 'ok' }
  if (state.reinjects >= MAX_REINJECTS) return { state: { ...state, ended: true }, action: 'end' }
  return { state: { reinjects: state.reinjects + 1, ended: false }, action: 'reinject' }
}

/**
 * 目录名的时间戳按日本时间取，不用 toISOString()（那是 UTC）。
 * 竞品全是日区团播，深夜档落在 JST 次日 00:00–09:00 —— 走 UTC 会把它归到前一天，
 * 走本机时区（PDT）又会把傍晚场归到次日。同 record-live-shot.mjs 的处理。
 */
const SESSION_TZ = 'Asia/Tokyo'

function stampInTokyo(epochSec: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SESSION_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(epochSec * 1000))
  const at = (type: string) => parts.find((p) => p.type === type)!.value
  return `${at('year')}${at('month')}${at('day')}-${at('hour')}${at('minute')}`
}

export type SessionPaths = {
  dir: string
  samples: string
  frames: string
  meta: string
}

/** 一场一个目录：<base>/<handle>/<JST 时间戳>/{samples.jsonl, frames/, session.json} */
export function sessionPaths(
  baseDir: string,
  handle: string,
  startedAt: number | null,
): SessionPaths {
  const safe = handle.replace(/[^a-z0-9._-]/gi, '_')
  const stamp = startedAt == null ? 'unknown' : stampInTokyo(startedAt)
  const dir = `${baseDir}/${safe}/${stamp}`
  return {
    dir,
    samples: `${dir}/samples.jsonl`,
    frames: `${dir}/frames`,
    meta: `${dir}/session.json`,
  }
}
