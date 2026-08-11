// src/lib/competitors/shotGrid.ts
// 纯函数：把竞品截图按日期归并成一条整页共用的日期轴与窗口。

/** 无日期图片在日期轴上的占位键。 */
export const UNDATED_KEY = '—'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * shot_on 是否合法：null / undefined（表示不设置）或真实存在的 YYYY-MM-DD 日历日。
 * 用 toISOString 回读比对，挡掉 2026-02-30 这类会被 Date 自动进位的假日期。
 */
export function isValidShotDate(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'string') return false
  if (!DATE_RE.test(value)) return false
  const d = new Date(value + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === value
}
