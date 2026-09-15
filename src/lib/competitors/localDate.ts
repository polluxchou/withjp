// src/lib/competitors/localDate.ts
// 读时钟,所以不放进 shotGrid.ts（那里全是可单测的纯函数）。
import { SHOT_DATE_FUTURE_DAYS, shiftDate } from './shotGrid'

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

/**
 * 截图日期选择器的上限：今天往后 SHOT_DATE_FUTURE_DAYS 天。
 *
 * 为什么不是"今天"：见 shotGrid.ts 里 SHOT_DATE_FUTURE_DAYS 的注释 —— 简单说是
 * 时区。shot_on 记的是直播当地那一天，而这里读的是使用者浏览器的时钟。
 */
export function maxShotDate(): string {
  return shiftDate(todayLocal(), SHOT_DATE_FUTURE_DAYS)
}
