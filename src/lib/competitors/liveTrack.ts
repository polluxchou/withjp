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
