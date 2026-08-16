// src/lib/competitors/summary.ts
// 纯函数：把看板上的顶层主竞品聚合成一条总览统计。零 IO、零时钟——
// today 由调用方注入（见 localDate.ts 的 todayLocal），才能被单测钉死。

/** 超过这个天数没有新快照就算「待更新」。正好等于不算。 */
export const STALE_DAYS = 7

/**
 * 只声明统计需要的字段，而不是收 CompetitorWithHistory：
 * 真实竞品对象结构上满足它，测试也就不用为了两个数字造出整棵档案树。
 */
export interface SummaryInput {
  handle: string
  display_name: string | null
  latest: { captured_on: string; followers: number | null; display_name: string | null } | null
}

export interface BoardSummary {
  /** 主竞品账号数（不含下钻的子主播）。 */
  tracked: number
  /** 有最新快照且 followers 非空的账号数——totalFollowers 的覆盖面。 */
  withData: number
  totalFollowers: number
  /** 全体 latest.captured_on 的最大值；无人采集过时为 null。 */
  latestCapturedOn: string | null
  daysSinceLatest: number | null
  staleCount: number
  /** 陈旧账号显示名，按输入顺序。 */
  staleNames: string[]
}

const DAY_MS = 86_400_000

/**
 * 两个 YYYY-MM-DD 相差的整天数。
 * 走 Date.UTC 而不是 new Date(str)：后者按本地时区解析，跨夏令时的地区
 * 会多出/少掉一小时，除以 86400000 取整后就是 ±1 天的误差。
 */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z')
  const b = Date.parse(to + 'T00:00:00Z')
  return Math.round((b - a) / DAY_MS)
}

/** 显示名三级回退：快照名 → 竞品名 → handle。与卡片标题保持一致。 */
export function competitorName(c: SummaryInput): string {
  return c.latest?.display_name ?? c.display_name ?? c.handle
}

export function summarizeBoard(competitors: SummaryInput[], today: string): BoardSummary {
  let withData = 0
  let totalFollowers = 0
  let latestCapturedOn: string | null = null
  const staleNames: string[] = []

  for (const c of competitors) {
    const latest = c.latest
    if (latest?.followers != null) {
      withData += 1
      totalFollowers += latest.followers
    }
    // YYYY-MM-DD 定长零填充，字符串比较即日期比较。
    if (latest?.captured_on && (latestCapturedOn == null || latest.captured_on > latestCapturedOn)) {
      latestCapturedOn = latest.captured_on
    }
    // 从没采集过 = 最陈旧的一档，和「很久没更新」一起提示。
    if (!latest?.captured_on || daysBetween(latest.captured_on, today) > STALE_DAYS) {
      staleNames.push(competitorName(c))
    }
  }

  return {
    tracked: competitors.length,
    withData,
    totalFollowers,
    latestCapturedOn,
    daysSinceLatest: latestCapturedOn ? daysBetween(latestCapturedOn, today) : null,
    staleCount: staleNames.length,
    staleNames,
  }
}
