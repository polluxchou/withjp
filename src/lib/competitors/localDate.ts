// src/lib/competitors/localDate.ts
// 读时钟,所以不放进 shotGrid.ts（那里全是可单测的纯函数）。

/**
 * 本地时区的今天，YYYY-MM-DD。
 * 不能用 toISOString——那是 UTC，对 UTC+8 团队每天 08:00 前会算成昨天，
 * 而 shot_on 是整个日期轴的主键，差一天就会把截图塞进错误的列。
 */
export function todayLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
