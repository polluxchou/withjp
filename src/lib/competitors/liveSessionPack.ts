// src/lib/competitors/liveSessionPack.ts
// 开播记录（LIVE History 导入）在看板里的下发格式：每个账号一份，按列存放，时刻存成数字。
//
// 为什么不直接下发库行：整表 select('*') 时每场约 344 字节，约七成是没有消费方读的列
// （id / competitor_id / source / created_at / updated_at），时刻又是 25 个字符的字符串；
// 开播记录占了整个看板的八成以上，还按每月约 1000 场增长。只查用得到的列、按列存、时刻存数字后，
// 看板约为原来的四分之一（设计：docs/superpowers/specs/2026-10-12-competitor-live-session-pack-design.md）。
//
// 无损：消费方读到的都是毫秒时刻（Date.parse 之后）。本账号全部开播、下播都是整分钟时按分钟存
// （导入的原文只到分钟，实际都走这条）；只要有一行带秒或毫秒（校验器只要求开播整分钟，下播允许带秒），
// 整个账号退回按毫秒存。
//
// 读开播记录只经 liveSessionRows(c)：解包后的形状就是 liveSpansOf 的 live_sessions 入参。
// 组件与 lib 里别直接读 liveSessionPack 的数组。纯函数、不读时钟，可单测。

const MINUTE_MS = 60_000

/** 一个账号的开播记录，按列存放：第 i 场 = 各数组的第 i 个元素；顺序就是打包时的输入顺序。 */
export interface LiveSessionPack {
  /** 时刻单位（毫秒）：本账号全部开播、下播都是整分钟时为 60000，否则为 1。 */
  unitMs: 60000 | 1
  /** 开播时刻 = epoch 毫秒 ÷ unitMs。 */
  start: number[]
  /** 时长 = (下播 − 开播) 毫秒 ÷ unitMs。库里有约束 ended_at >= started_at，恒 ≥ 0。 */
  dur: number[]
  likes: (number | null)[]
  title: string[]
}

/** 一场开播记录里看板用得到的字段；也就是 liveSpansOf 的 live_sessions 入参形状。 */
export interface LiveSessionFields {
  started_at: string
  ended_at: string
  likes: number | null
  title: string
}

/**
 * 打包一个账号的开播记录，保持输入顺序（看板传进来时已按开播时刻倒序）。
 * 读不出时刻的行跳过，与 liveSpansOf 的处理一致——库里两列都是 not null timestamptz，实际不会出现。
 */
export function packLiveSessions(rows: readonly LiveSessionFields[]): LiveSessionPack {
  const kept: { start: number; end: number; likes: number | null; title: string }[] = []
  for (const r of rows) {
    const start = Date.parse(r.started_at)
    const end = Date.parse(r.ended_at)
    if (Number.isNaN(start) || Number.isNaN(end)) continue
    kept.push({ start, end, likes: r.likes ?? null, title: r.title ?? '' })
  }
  const unitMs: LiveSessionPack['unitMs'] =
    kept.every((r) => r.start % MINUTE_MS === 0 && r.end % MINUTE_MS === 0) ? MINUTE_MS : 1
  return {
    unitMs,
    start: kept.map((r) => r.start / unitMs),
    dur: kept.map((r) => (r.end - r.start) / unitMs),
    likes: kept.map((r) => r.likes),
    title: kept.map((r) => r.title),
  }
}

/**
 * 还原成行，时刻写成 toISOString()。写法与库里读回来的（+00:00）不同无妨：
 * 下游都按时刻比（liveSpansOf 统一成 toISOString，导入预览用 getTime）。
 */
export function unpackLiveSessions(pack: LiveSessionPack): LiveSessionFields[] {
  const out: LiveSessionFields[] = []
  for (let i = 0; i < pack.start.length; i += 1) {
    const start = pack.start[i] * pack.unitMs
    out.push({
      started_at: new Date(start).toISOString(),
      ended_at: new Date(start + pack.dur[i] * pack.unitMs).toISOString(),
      likes: pack.likes[i] ?? null,
      title: pack.title[i] ?? '',
    })
  }
  return out
}

/**
 * 一个账号的开播记录（顺序同打包时：看板里是按开播时刻倒序）。读开播记录只经这里。
 * 缺包（null / 没有这个字段）当没有开播记录：地区标尺的入参允许不带。
 */
export function liveSessionRows(c: { liveSessionPack?: LiveSessionPack | null }): LiveSessionFields[] {
  return c.liveSessionPack ? unpackLiveSessions(c.liveSessionPack) : []
}
