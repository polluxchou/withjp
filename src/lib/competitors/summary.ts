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
  /** 直播截图，这里只用 shot_on；未标日期（null）的不参与日期比较。 */
  shots?: { shot_on: string | null }[]
  /** 下钻的子主播：只有截图日期会往上冒泡，账号数与粉丝总量不含它们。 */
  related?: SummaryInput[]
}

export interface BoardSummary {
  /** 主竞品账号数（不含下钻的子主播）。 */
  tracked: number
  /** 有最新快照且 followers 非空的账号数——totalFollowers 的覆盖面。 */
  withData: number
  totalFollowers: number
  /**
   * 看板上最新的一次采集：指标快照与直播截图取较大者。
   * 两条采集链路是分开跑的（主页指标周采 / 直播截图当天截），只报其中一条会
   * 让另一条刚跑完的当天看起来像"还停在昨天"。
   */
  latestCapturedOn: string | null
  /** 只看主页指标快照的最新一天——粉丝总量与「待更新」的新鲜度基准。 */
  latestMetricsOn: string | null
  /** 只看直播截图的最新一天（含子主播；未标日期的不算）。 */
  latestShotOn: string | null
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
 *
 * 导出给 ask-context.ts 复用——同样的日期差计算不该在两个文件里各写一份，
 * 那样两份实现将来会悄悄跑偏。
 */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z')
  const b = Date.parse(to + 'T00:00:00Z')
  return Math.round((b - a) / DAY_MS)
}

/**
 * 递归取最新的 shot_on。子主播的截图照算：这里是取最大值，不像账号数和
 * 粉丝总量那样会被子账号稀释，漏掉它们只会让"最近采集"报得比实际旧。
 */
function maxShotOn(list: SummaryInput[], acc: string | null): string | null {
  let latest = acc
  for (const c of list) {
    for (const s of c.shots ?? []) {
      // YYYY-MM-DD 定长零填充，字符串比较即日期比较。
      if (s.shot_on && (latest == null || s.shot_on > latest)) latest = s.shot_on
    }
    if (c.related?.length) latest = maxShotOn(c.related, latest)
  }
  return latest
}

/** 显示名三级回退：快照名 → 竞品名 → handle。与卡片标题保持一致。 */
export function competitorName(c: SummaryInput): string {
  return c.latest?.display_name ?? c.display_name ?? c.handle
}

export function summarizeBoard(competitors: SummaryInput[], today: string): BoardSummary {
  let withData = 0
  let totalFollowers = 0
  let latestMetricsOn: string | null = null
  const staleNames: string[] = []

  for (const c of competitors) {
    const latest = c.latest
    if (latest?.followers != null) {
      withData += 1
      totalFollowers += latest.followers
    }
    // YYYY-MM-DD 定长零填充，字符串比较即日期比较。
    if (latest?.captured_on && (latestMetricsOn == null || latest.captured_on > latestMetricsOn)) {
      latestMetricsOn = latest.captured_on
    }
    // 陈旧只看指标快照：截图再新也不代表粉丝数被重新读过，
    // 「待更新」要指的就是"该跑一轮主页指标了"。
    // 从没采集过 = 最陈旧的一档，和「很久没更新」一起提示。
    if (!latest?.captured_on || daysBetween(latest.captured_on, today) > STALE_DAYS) {
      staleNames.push(competitorName(c))
    }
  }

  const latestShotOn = maxShotOn(competitors, null)
  const latestCapturedOn =
    latestMetricsOn == null || (latestShotOn != null && latestShotOn > latestMetricsOn)
      ? latestShotOn
      : latestMetricsOn

  return {
    tracked: competitors.length,
    withData,
    totalFollowers,
    latestCapturedOn,
    latestMetricsOn,
    latestShotOn,
    daysSinceLatest: latestCapturedOn ? daysBetween(latestCapturedOn, today) : null,
    staleCount: staleNames.length,
    staleNames,
  }
}
