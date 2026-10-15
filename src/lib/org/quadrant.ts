// src/lib/org/quadrant.ts — 业务分工「四象限」视图的判定、分组、统计与写入校验。
//
// 口径见 docs/superpowers/specs/2026-10-15-org-quadrant-board-design.md 第 2 节。
// 本仓没有 DOM 测试环境，凡是能算的都放在这里，组件只负责渲染。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。
import type { TaskItemStatus } from '../types/index.ts'

/** 截止日距今天 ≤ 这么多天（含当天、含已逾期）即算紧急。 */
export const URGENT_WITHIN_DAYS = 7

/** 「今天」按东京业务日算，与 src/lib/milestones/completion.ts 同一约定。 */
const BUSINESS_ZONE = 'Asia/Tokyo'

export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'
export type Bucket = Quadrant | 'unrated' | 'done'
export const QUADRANTS: Quadrant[] = ['q1', 'q2', 'q3', 'q4']

/** 判定只看这三个字段。迁移未跑时快照里没有新列，读出来是 undefined，按「待评估」处理。 */
export interface QuadrantItemInput {
  is_important: boolean | null | undefined
  due_date: string | null | undefined
  status: TaskItemStatus | null | undefined
}

/** 东京业务日 'YYYY-MM-DD'。now 可注入，便于测试。 */
export function tokyoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

function utcMidnight(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** due − today 的天数差（可为负）。两者都是 'YYYY-MM-DD'，按 UTC 零点相减，不经过本地时区。 */
export function daysUntil(due: string, today: string): number {
  return Math.round((utcMidnight(due) - utcMidnight(today)) / 86_400_000)
}

export function isUrgent(item: QuadrantItemInput, today: string): boolean {
  return !!item.due_date && daysUntil(item.due_date, today) <= URGENT_WITHIN_DAYS
}

export function bucketOf(item: QuadrantItemInput, today: string): Bucket {
  if (item.status === 'done') return 'done'
  if (item.is_important === null || item.is_important === undefined) return 'unrated'
  const urgent = isUrgent(item, today)
  if (item.is_important) return urgent ? 'q1' : 'q2'
  return urgent ? 'q3' : 'q4'
}

export type DueBadge =
  | { kind: 'overdue'; days: number; tone: 'danger' }
  | { kind: 'today'; tone: 'warning' }
  | { kind: 'soon'; days: number; date: string; tone: 'warning' }
  | { kind: 'date'; date: string; tone: 'muted' }

/** 卡片上的截止日徽标（spec 2.3）。文案由组件按 i18n 拼；date 为 'MM-DD'。 */
export function dueBadge(item: QuadrantItemInput, today: string): DueBadge | null {
  if (!item.due_date || item.status === 'done') return null
  const d = daysUntil(item.due_date, today)
  const date = item.due_date.slice(5)
  if (d < 0) return { kind: 'overdue', days: -d, tone: 'danger' }
  if (d === 0) return { kind: 'today', tone: 'warning' }
  if (d <= 3) return { kind: 'soon', days: d, date, tone: 'warning' }
  return { kind: 'date', date, tone: 'muted' }
}
