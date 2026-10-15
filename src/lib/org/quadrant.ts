// src/lib/org/quadrant.ts — 业务分工「四象限」视图的判定、分组、统计与写入校验。
//
// 口径见 docs/superpowers/specs/2026-10-15-org-quadrant-board-design.md 第 2 节。
// 本仓没有 DOM 测试环境，凡是能算的都放在这里，组件只负责渲染。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。
import type { OrgSnapshot, TaskItemStatus } from '../types/index.ts'

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

// ── 拍平、分组、统计、筛选 ────────────────────────────────

/** 负责人标识：带类型前缀，员工与主播的 id 各自成域，不会撞。 */
export type OwnerKey = `user:${string}` | `creator:${string}` | 'none'
export type OwnerFilter = OwnerKey | 'all'

export function ownerKeyOf(item: {
  owner_member_type: 'user' | 'creator' | null
  owner_user_id: string | null
  owner_creator_id: string | null
}): OwnerKey {
  if (item.owner_member_type === 'user' && item.owner_user_id) return `user:${item.owner_user_id}`
  if (item.owner_member_type === 'creator' && item.owner_creator_id) return `creator:${item.owner_creator_id}`
  return 'none'
}

/** 拍平后的一行事项：判定字段 + 展示所需的业务/任务信息 + 稳定排序键。 */
export interface QuadrantRow {
  id: string
  name: string
  status: TaskItemStatus
  is_important: boolean | null
  due_date: string | null
  ownerKey: OwnerKey
  ownerName: string | null
  businessName: string
  taskName: string
  positionIds: string[]
  /** [业务 sort_order, 任务 sort_order, 事项 sort_order] */
  order: [number, number, number]
}

export function flattenItems(snapshot: OrgSnapshot): QuadrantRow[] {
  const rows: QuadrantRow[] = []
  for (const b of snapshot.businesses) {
    for (const t of b.tasks) {
      for (const it of t.items) {
        rows.push({
          id: it.id,
          name: it.name,
          // 迁移未跑时新列缺失：按「未开始 / 待评估 / 无截止日」兜底
          status: it.status ?? 'todo',
          is_important: it.is_important ?? null,
          due_date: it.due_date ?? null,
          ownerKey: ownerKeyOf(it),
          ownerName: it.owner_name ?? null,
          businessName: b.name,
          taskName: t.name,
          positionIds: t.position_ids,
          order: [b.sort_order, t.sort_order, it.sort_order],
        })
      }
    }
  }
  return rows
}

function compareRows(a: QuadrantRow, b: QuadrantRow): number {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date < b.due_date ? -1 : 1
  }
  return a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2]
}

function matchesOwner(row: QuadrantRow, owner: OwnerFilter): boolean {
  return owner === 'all' || row.ownerKey === owner
}

export type QuadrantGroups = Record<Bucket, QuadrantRow[]>

/** 按负责人筛选后分桶，每桶按 spec 2.4 排序。 */
export function groupItems(rows: QuadrantRow[], today: string, owner: OwnerFilter): QuadrantGroups {
  const groups: QuadrantGroups = { q1: [], q2: [], q3: [], q4: [], unrated: [], done: [] }
  for (const row of rows) {
    if (matchesOwner(row, owner)) groups[bucketOf(row, today)].push(row)
  }
  for (const key of Object.keys(groups) as Bucket[]) groups[key].sort(compareRows)
  return groups
}

export interface QuadrantStats {
  open: number
  overdue: number
  blocked: number
  unrated: number
  unassigned: number
}

/** spec 2.5 的统计；groups 已是筛选后的结果。 */
export function quadrantStats(groups: QuadrantGroups, today: string): QuadrantStats {
  const open = [...QUADRANTS.flatMap((q) => groups[q]), ...groups.unrated]
  return {
    open: open.length,
    overdue: open.filter((r) => !!r.due_date && daysUntil(r.due_date, today) < 0).length,
    blocked: open.filter((r) => r.status === 'blocked').length,
    unrated: groups.unrated.length,
    unassigned: open.filter((r) => r.ownerKey === 'none').length,
  }
}

export interface OwnerOption {
  key: OwnerFilter
  name: string | null
  count: number
}

/**
 * 负责人筛选项（spec 2.6）：「全部」+ 至少负责一个事项的人（按姓名）+「未指派」（有才出现）。
 * scope = 'open' 时计数为未完成事项数；scope 为某个桶时只数这个桶里的。
 */
export function ownerOptions(rows: QuadrantRow[], today: string, scope: Bucket | 'open'): OwnerOption[] {
  const inScope = (r: QuadrantRow) => (scope === 'open' ? r.status !== 'done' : bucketOf(r, today) === scope)
  const people = new Map<OwnerKey, string>()
  let hasUnassigned = false
  for (const r of rows) {
    if (r.ownerKey === 'none') hasUnassigned = true
    else if (!people.has(r.ownerKey)) people.set(r.ownerKey, r.ownerName ?? '')
  }
  const count = (key: OwnerFilter) => rows.filter((r) => inScope(r) && matchesOwner(r, key)).length
  const options: OwnerOption[] = [{ key: 'all', name: null, count: count('all') }]
  // 按 UTF-16 码元比较而不用 localeCompare：后者依赖运行环境的 ICU 默认语言，SSR 与浏览器顺序不一致会触发水合错位。
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const sorted = Array.from(people.entries()).sort((a, b) => cmp(a[1], b[1]) || cmp(a[0], b[0]))
  for (const [key, name] of sorted) options.push({ key, name, count: count(key) })
  if (hasUnassigned) options.push({ key: 'none', name: null, count: count('none') })
  return options
}

/** URL 的 owner 参数 → 筛选值。格式不对、或这个人已不在任何事项上 → 'all'。 */
export function parseOwnerFilter(raw: string | null, rows: QuadrantRow[]): OwnerFilter {
  if (!raw || raw === 'all') return 'all'
  return rows.some((r) => r.ownerKey === raw) ? (raw as OwnerKey) : 'all'
}

const BUCKETS: Bucket[] = ['q1', 'q2', 'q3', 'q4', 'unrated', 'done']

/** URL 的 q 参数（手机列表层）→ 桶；缺省或非法 → null（首层）。 */
export function parseLevel(raw: string | null): Bucket | null {
  return BUCKETS.includes(raw as Bucket) ? (raw as Bucket) : null
}

/** 页面停在哪一层（视图 + 手机层级），以及当时 URL 上的负责人筛选（缺省与 'all' 都记成 null）。 */
export interface PageStop {
  layer: string
  owner: string | null
}

export function pageStop(params: { get(name: string): string | null }): PageStop {
  // 与 OrgPageView 同一口径：只有 'structure' 是结构视图；结构视图不看 q
  const view = params.get('view') === 'structure' ? 'structure' : 'quadrant'
  const level = view === 'quadrant' ? parseLevel(params.get('q')) : null
  const owner = params.get('owner')
  return { layer: level ? `${view}:${level}` : view, owner: owner && owner !== 'all' ? owner : null }
}

/**
 * 换层后要不要把负责人筛选带过去（spec 6.3）。改筛选用 replaceState，只改当前这条历史；
 * 返回 / 前进手势落到的那条历史还记着旧筛选。筛选是整页共用的，换层时应沿用换层前生效的值。
 * 返回要回写到 URL 的 owner（null = 清掉，即「全部」）；层没变或筛选本来一致 → undefined（不写）。
 */
export function ownerToCarry(prev: PageStop, next: PageStop): string | null | undefined {
  if (prev.layer === next.layer || prev.owner === next.owner) return undefined
  return prev.owner
}

// ── 写入校验 ──────────────────────────────────────────────

export const ITEM_STATUSES: TaskItemStatus[] = ['todo', 'doing', 'blocked', 'done']

export interface ItemPatch {
  is_important?: boolean | null
  due_date?: string | null
  status?: TaskItemStatus
}

/**
 * 'YYYY-MM-DD'，是真实存在的日历日（拒绝 2026-02-30），且年份在 2000–2099。
 * 年份限制挡的是日期框改年份时逐键产生的 0002-10-20 这类合法但荒谬的值。
 */
export function isCalendarDate(s: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(s)) return false
  return new Date(utcMidnight(s)).toISOString().slice(0, 10) === s
}

/**
 * PATCH 入参里四象限相关的三个字段。只看这三个键，其余键（name/owner 由 updateItem 另行处理）忽略。
 * 出现即覆盖；null 表示清空（status 不可为 null）。
 */
export function validateItemPatch(input: unknown): { ok: true; value: ItemPatch } | { ok: false; message: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, message: 'body must be an object' }
  const src = input as Record<string, unknown>
  const value: ItemPatch = {}
  if ('is_important' in src) {
    if (src.is_important !== null && typeof src.is_important !== 'boolean') {
      return { ok: false, message: 'is_important must be boolean or null' }
    }
    value.is_important = src.is_important as boolean | null
  }
  if ('due_date' in src) {
    if (src.due_date !== null && (typeof src.due_date !== 'string' || !isCalendarDate(src.due_date))) {
      return { ok: false, message: 'due_date must be YYYY-MM-DD or null' }
    }
    value.due_date = src.due_date as string | null
  }
  if ('status' in src) {
    if (!ITEM_STATUSES.includes(src.status as TaskItemStatus)) {
      return { ok: false, message: 'status must be one of todo/doing/blocked/done' }
    }
    value.status = src.status as TaskItemStatus
  }
  return { ok: true, value }
}

/**
 * 日期输入框的值 → 要提交的补丁。没填完（空串）或荒谬年份一律不提交；
 * 清空只走「清除」按钮，避免把已有截止日误清掉。
 */
export function dueInputToPatch(value: string): ItemPatch | null {
  return isCalendarDate(value) ? { due_date: value } : null
}

// ── 拖放（spec: 2026-10-15-org-quadrant-drag-design.md 第 2 节）────────────

/** 'YYYY-MM-DD' + n 天，UTC 零点计算，不经过本地时区。 */
export function addDays(ymd: string, n: number): string {
  return new Date(utcMidnight(ymd) + n * 86_400_000).toISOString().slice(0, 10)
}

export type DropTarget = Bucket

export type DropPlan =
  | { kind: 'noop' }
  | { kind: 'patch'; patch: ItemPatch; autoDue: string | null }
  | { kind: 'askDate'; base: ItemPatch; minDate: string }

/**
 * 把事项放进某个区要写什么。横向（紧急 ↔ 不紧急）等于改截止日：
 * 拖进紧急列且当前不紧急 → 截止日自动设为 today+7（紧急窗口最后一天）；
 * 拖进不紧急列且当前紧急 → 先问日期（下限 today+8）。从已完成拖出来一律重开为 todo。
 */
export function planDrop(row: QuadrantRow, target: DropTarget, today: string): DropPlan {
  if (target === bucketOf(row, today)) return { kind: 'noop' }
  if (target === 'done') return { kind: 'patch', patch: { status: 'done' }, autoDue: null }
  const reopen: ItemPatch = row.status === 'done' ? { status: 'todo' } : {}
  if (target === 'unrated') return { kind: 'patch', patch: { ...reopen, is_important: null }, autoDue: null }
  const base: ItemPatch = { ...reopen, is_important: target === 'q1' || target === 'q2' }
  const wantUrgent = target === 'q1' || target === 'q3'
  const urgentNow = isUrgent(row, today)
  if (wantUrgent) {
    if (urgentNow) return { kind: 'patch', patch: base, autoDue: null }
    const due = addDays(today, URGENT_WITHIN_DAYS)
    return { kind: 'patch', patch: { ...base, due_date: due }, autoDue: due }
  }
  if (urgentNow) return { kind: 'askDate', base, minDate: addDays(today, URGENT_WITHIN_DAYS + 1) }
  return { kind: 'patch', patch: base, autoDue: null }
}

/** 询问框里填的日期 → 最终补丁；非法日期或早于下限返回 null。 */
export function confirmAskedDate(plan: { base: ItemPatch; minDate: string }, value: string): ItemPatch | null {
  if (!isCalendarDate(value) || value < plan.minDate) return null
  return { ...plan.base, due_date: value }
}

export type DropNoticeKind =
  | { key: 'dropDone' }
  | { key: 'dropReopened' | 'dropMoved' }
  | { key: 'dropReopenedDue' | 'dropMovedDue'; date: string }

/** 拖放后提示条用哪条文案（spec 2.2 / 4.2）。date 为 'MM-DD'。 */
export function dropNoticeKind(target: DropTarget, wasDone: boolean, autoDue: string | null): DropNoticeKind {
  if (target === 'done') return { key: 'dropDone' }
  if (wasDone) return autoDue ? { key: 'dropReopenedDue', date: autoDue.slice(5) } : { key: 'dropReopened' }
  return autoDue ? { key: 'dropMovedDue', date: autoDue.slice(5) } : { key: 'dropMoved' }
}
