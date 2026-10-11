// src/lib/competitors/liveSummaries.ts
// 「开播时段」页「趋势总结」视图的纯函数：类型、写入前的校验、排序与选中。
// 读库在 service.ts（getLiveSummaries），写库在 scripts/live-watch/record-live-summary.mjs，
// 两边共用这里的校验，同一个上限不各写一遍。

/**
 * 一份开播时段趋势总结（competitor_live_summaries 一行）。
 * 全局一份、不挂在某个竞品上：总结本来就是跨号比较（谁挤在 19:00、谁错峰）。
 */
export interface LiveSummary {
  id: string
  /**
   * 生成日期 YYYY-MM-DD，由写入方显式给出，不等于入库时间（同 competitor_descriptions.generated_on）。
   * URL 上的 day 参数按它选中。
   */
  generated_on: string
  title: string
  /** 一行范围说明，列表里标题下面那行小字（如「N 个号 · 起止日期 · N 场」）；可为空。 */
  subtitle: string
  /** markdown 正文，界面用 lib/markdown/miniMarkdown 解析后渲染成 React 元素。 */
  body: string
  /** 'auto' = 本地脚本按请求生成（每天一份，重跑覆盖）；'manual' = 手写补充。 */
  source: 'auto' | 'manual'
  created_at: string
  updated_at: string
}

/**
 * 正文上限（字符数）。一份覆盖三个视图的总结实测约 5000 字，50000 留了十倍余量；
 * 设上限是为了挡住把整份原始 LLM 输出（思维链、整张原始数据表）误写进来，
 * 也顺带限住页面一次下发的体积（全部总结的正文都随页面给到浏览器，见 service.getLiveSummaries）。
 */
export const SUMMARY_BODY_MAX_CHARS = 50_000
/** 标题、副标题都是单行，列表里一行放得下的长度；超了多半是把正文误传进了这个参数。 */
export const SUMMARY_LINE_MAX_CHARS = 120

/**
 * 去首尾空白后的正文；空、非字符串、超长一律返回 null（= 不可写入）。
 * 内部的换行原样保留：markdown 靠空行分段、靠缩进分嵌套。
 *
 * 超长返回 null 而不是截断（同 descriptions.normalizeDescriptionBody）：截断会把总结拦腰砍掉
 * 且事后看不出被砍过，让写入失败才是能被发现的失败。
 */
export function normalizeSummaryBody(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const body = input.trim()
  if (body === '') return null
  // Array.from 而不是 .length：按码点算，一个 emoji 不该顶掉两个字的额度。
  if (Array.from(body).length > SUMMARY_BODY_MAX_CHARS) return null
  return body
}

/**
 * 单行文本（标题、副标题）：空白折成一个空格、去首尾；没给（undefined / null）算空串。
 * 非字符串或超长返回 null。空串是合法值——标题空时由调用方补默认值，副标题空就不显示。
 */
function normalizeLine(input: unknown): string | null {
  if (input == null) return ''
  if (typeof input !== 'string') return null
  const line = input.replace(/\s+/g, ' ').trim()
  if (Array.from(line).length > SUMMARY_LINE_MAX_CHARS) return null
  return line
}

export const normalizeSummaryTitle = normalizeLine
export const normalizeSummarySubtitle = normalizeLine

/**
 * 按生成日期倒序（最新在前），同一天再按入库时间倒序。
 * 日期用字符串比较而不是 new Date()：定宽 YYYY-MM-DD 的字典序就是时间序，解析成 Date 反而引入时区。
 * 不改动入参。
 */
export function sortSummaries(rows: readonly LiveSummary[]): LiveSummary[] {
  return rows.slice().sort((a, b) => {
    const byDay = b.generated_on.localeCompare(a.generated_on)
    return byDay !== 0 ? byDay : b.created_at.localeCompare(a.created_at)
  })
}

/**
 * 当前该显示哪一份：URL 上的 day 命中就取那天，否则取最新一份；空列表返回 null。
 *
 * day 是链接里人读得懂的那一半，绝大多数时候一天只有一份（自动路径每天唯一）。
 * 只有同一天还有手写的那份时才需要 id 区分：id 必须落在 day 那天才认，对不上以 day 为准，
 * 免得一个拼坏的链接把人带到另一天去。day 没命中（写坏了、那份被删了）就回落到最新一份，
 * 不显示空白——与本页其它视图收敛非法 URL 参数的做法一致。
 *
 * 入参顺序无所谓，这里自己排一遍。
 */
export function pickSummary(
  list: readonly LiveSummary[],
  day: string | null,
  id: string | null = null,
): LiveSummary | null {
  const sorted = sortSummaries(list)
  if (sorted.length === 0) return null
  const sameDay = day ? sorted.filter((s) => s.generated_on === day) : sorted
  const pool = sameDay.length > 0 ? sameDay : sorted
  return (id ? pool.find((s) => s.id === id) : undefined) ?? pool[0]
}
