// src/lib/competitors/shotGrid.ts
// 纯函数：把竞品截图按日期归并成一条整页共用的日期轴与窗口。
import type { CompetitorShot, CompetitorWithHistory } from './types.ts'

/** 无日期图片在日期轴上的占位键。 */
export const UNDATED_KEY = '—'

/** 日期窗口列数：一屏横向对比 5 天。三处渲染必须用同一个值,否则列对不齐。 */
export const SHOT_WINDOW_SIZE = 5

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * shot_on 是否合法：null / undefined 或真实存在的 YYYY-MM-DD 日历日。
 *
 * 这是**写入前的入参守卫**，不是通用的格式判定：null 表示"显式清空日期"、
 * undefined 表示"本次不改这个字段"，两者都必须放行，所以 null 合法而空串不合法。
 * 别拿它去校验文本框输入。
 *
 * 用 toISOString 回读比对，挡掉 2026-02-30 这类会被 Date 自动进位的假日期；
 * 年份另外卡范围，否则 0020-08-10 这种手滑值会在日期轴上拉出一列两千年前的孤儿。
 */
export function isValidShotDate(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'string') return false
  if (!DATE_RE.test(value)) return false
  const year = Number(value.slice(0, 4))
  if (year < 1900 || year > 2999) return false
  const d = new Date(value + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === value
}

/**
 * 递归收集所有竞品（含 related 子主播）有图的日期，升序去重。
 * 存在 shot_on 为空的图时，末尾追加 UNDATED_KEY 作为兜底列。
 */
export function collectShotDates(competitors: CompetitorWithHistory[]): string[] {
  const dated = new Set<string>()
  let hasUndated = false
  const walk = (list: CompetitorWithHistory[]) => {
    for (const c of list) {
      for (const s of c.shots ?? []) {
        if (s.shot_on) dated.add(s.shot_on)
        else hasUndated = true
      }
      if (c.related?.length) walk(c.related)
    }
  }
  walk(competitors ?? [])
  // Array.from 而非展开：避免 Set 展开在当前 tsconfig 下触发 TS2802
  const axis = Array.from(dated).sort((a, b) => a.localeCompare(b))
  if (hasUndated) axis.push(UNDATED_KEY)
  return axis
}

/**
 * 以 anchorIndex 为中心取 size 列，夹逼到 [0, axis.length)。
 * 靠边时向另一侧补足，仍尽量取满 size 列，保证每个竞品行的列数一致。
 * anchorIndex 为 -1（anchor 不在轴上）时按贴右处理，即取轴末尾 size 列。
 */
export function windowOf(axis: string[], anchorIndex: number, size: number): string[] {
  if (!axis.length || size <= 0) return []
  if (size >= axis.length) return axis.slice()
  const anchor = anchorIndex < 0 ? axis.length - 1 : Math.min(anchorIndex, axis.length - 1)
  let start = anchor - Math.floor((size - 1) / 2)
  if (start < 0) start = 0
  if (start + size > axis.length) start = axis.length - size
  return axis.slice(start, start + size)
}

/**
 * 把用户选中的 anchor 归一化到轴上的一个真实日期。
 * 命中则原样返回；未命中（轴重算后该天消失、或初始为 null）取日历距离最近的一天，
 * 距离并列时取较新的一天。UNDATED_KEY 不参与距离计算。轴为空返回 null。
 */
export function resolveAnchor(axis: string[], anchor: string | null): string | null {
  if (!axis.length) return null
  if (anchor && axis.includes(anchor)) return anchor
  // 注意：UNDATED_KEY 被 collectShotDates 追加在轴尾，所以"最新一天"必须从
  // 过滤掉占位键的 dated 里取，不能直接拿 axis 的末位。
  const dated = axis.filter((d) => d !== UNDATED_KEY)
  const newest = dated.length ? dated[dated.length - 1] : axis[axis.length - 1]
  if (!anchor || anchor === UNDATED_KEY) return newest
  if (!dated.length) return newest
  const target = Date.parse(anchor + 'T00:00:00Z')
  if (Number.isNaN(target)) return dated[dated.length - 1]
  let best = dated[0]
  let bestDist = Infinity
  for (const d of dated) {
    const dist = Math.abs(Date.parse(d + 'T00:00:00Z') - target)
    if (dist < bestDist || (dist === bestDist && d > best)) {
      best = d
      bestDist = dist
    }
  }
  return best
}

/**
 * 按日期归组；shot_on 为空归入 UNDATED_KEY。
 * 组内按 sort_order 再 created_at 升序，首张即该日封面。
 */
export function groupShotsByDate(shots: CompetitorShot[]): Map<string, CompetitorShot[]> {
  const map = new Map<string, CompetitorShot[]>()
  for (const s of shots ?? []) {
    const key = s.shot_on || UNDATED_KEY
    const arr = map.get(key) ?? []
    arr.push(s)
    map.set(key, arr)
  }
  for (const arr of Array.from(map.values())) {
    arr.sort((a, b) => (a.sort_order - b.sort_order) || a.created_at.localeCompare(b.created_at))
  }
  return map
}

/** 灯箱一次并排显示的张数。 */
export const LIGHTBOX_VISIBLE = 3

/**
 * 把灯箱窗口起点夹逼到 [0, max(0, total - size)]。
 *
 * total <= size 时恒为 0：当天照片不够铺满窗口就不该滑动，
 * 否则会滑出一段空位，而空位会被读成「图没加载出来」。
 */
export function clampWindowStart(start: number, total: number, size: number): number {
  const max = Math.max(total - size, 0)
  if (!Number.isFinite(start) || start < 0) return 0
  return Math.min(Math.floor(start), max)
}
