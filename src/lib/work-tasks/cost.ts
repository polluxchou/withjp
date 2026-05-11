import type { WorkTask, WorkTaskStatus, WorkTaskType, AgentRole, UserWorkload } from '@/lib/types'

// ── Constants ─────────────────────────────────────────────────

/** Assumed working days per month for salary → daily rate conversion */
export const WORKING_DAYS_PER_MONTH = 22

/** Working hours per day */
export const WORKING_HOURS_PER_DAY = 8

// ── Labels ────────────────────────────────────────────────────

export const WORK_TASK_TYPE_LABELS: Record<WorkTaskType, string> = {
  fixed: '固定任务',
  adhoc: '临时任务',
}

export const WORK_TASK_STATUS_LABELS: Record<WorkTaskStatus, string> = {
  planned:   '计划中',
  doing:     '进行中',
  done:      '已完成',
  cancelled: '已取消',
}

export const WORK_TASK_STATUS_OPTIONS: { value: WorkTaskStatus; label: string }[] = [
  { value: 'planned',   label: '计划中' },
  { value: 'doing',     label: '进行中' },
  { value: 'done',      label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]

export const DEPARTMENT_LABELS: Record<AgentRole, string> = {
  bd:      'BD',
  ops:     '运营',
  finance: '财务',
  content: '内容',
  growth:  '增长',
  legal:   '法务',
}

export const DEPARTMENT_OPTIONS: { value: AgentRole; label: string }[] = [
  { value: 'bd',      label: 'BD' },
  { value: 'ops',     label: '运营' },
  { value: 'finance', label: '财务' },
  { value: 'content', label: '内容' },
  { value: 'growth',  label: '增长' },
  { value: 'legal',   label: '法务' },
]

export const EFFORT_LABELS: Record<number, string> = {
  2: '2h（半天）',
  4: '4h（半天）',
  8: '8h（全天）',
}

// ── Cost calculation ──────────────────────────────────────────

/** Hourly rate from monthly salary */
export function hourlyRate(monthlySalary: number): number {
  return monthlySalary / WORKING_DAYS_PER_MONTH / WORKING_HOURS_PER_DAY
}

/**
 * Labour cost for a single work task.
 * Both owner + executors contribute effort.
 */
export function taskLabourCost(
  effortHours: number,
  peopleCount: number,   // owner(1) + executors
  monthlySalary: number, // average or per-person salary
): number {
  return hourlyRate(monthlySalary) * effortHours * peopleCount
}

// ── Date utilities ────────────────────────────────────────────

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getWeekDates(refDate: Date): Date[] {
  const d = new Date(refDate)
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1  // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d)
    dd.setDate(d.getDate() + i)
    return dd
  })
}

export function getWeekLabel(dates: Date[]): string {
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(dates[0])} – ${fmt(dates[6])}`
}

export function getMonthWeeks(year: number, month: number): Date[][] {
  // Returns array of week-start dates (Mon) that overlap the month
  const first = new Date(year, month - 1, 1)
  const last  = new Date(year, month, 0)
  const weeks: Date[][] = []

  let cursor = new Date(first)
  // rewind to Monday
  const dow = cursor.getDay() === 0 ? 6 : cursor.getDay() - 1
  cursor.setDate(cursor.getDate() - dow)

  while (cursor <= last) {
    weeks.push(getWeekDates(new Date(cursor)))
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

// ── Workload aggregation ──────────────────────────────────────

export interface WorkloadSummary {
  totalHours:       number
  totalPeople:      number
  totalLabourCost:  number
  byDepartment:     Partial<Record<AgentRole, { hours: number; cost: number }>>
}

/** Aggregate a flat list of work tasks into a workload summary */
export function aggregateWorkload(
  tasks: WorkTask[],
  salaryMap: Record<string, number>,  // user_id → monthly_salary
): WorkloadSummary {
  const byDept: Partial<Record<AgentRole, { hours: number; cost: number }>> = {}
  let totalHours      = 0
  let totalLabourCost = 0

  for (const t of tasks) {
    if (t.status === 'cancelled') continue
    const people    = 1 + t.executor_ids.length
    const allIds    = [t.owner_user_id, ...t.executor_ids]
    const avgSalary = allIds.reduce((s, id) => s + (salaryMap[id] ?? 0), 0) / allIds.length
    const cost      = taskLabourCost(t.effort_hours, people, avgSalary)
    const hours     = t.effort_hours * people

    totalHours      += hours
    totalLabourCost += cost

    const dept = byDept[t.department] ?? { hours: 0, cost: 0 }
    byDept[t.department] = { hours: dept.hours + hours, cost: dept.cost + cost }
  }

  const people = new Set<string>()
  tasks.forEach((t) => {
    if (t.status !== 'cancelled') {
      people.add(t.owner_user_id)
      t.executor_ids.forEach((id) => people.add(id))
    }
  })

  return {
    totalHours,
    totalPeople:     people.size,
    totalLabourCost,
    byDepartment:    byDept,
  }
}

/**
 * Build per-user workload rows for a given set of tasks + a date.
 * salaryMap: user_id → monthly_salary
 */
export function buildUserWorkloads(
  tasks: WorkTask[],
  salaryMap: Record<string, number>,
  userMeta: Record<string, { name: string; user_code: string; role: AgentRole }>,
): UserWorkload[] {
  const map = new Map<string, { tasks: WorkTask[]; hours: number }>()

  for (const t of tasks) {
    if (t.status === 'cancelled') continue
    const participants = [t.owner_user_id, ...t.executor_ids]
    for (const uid of participants) {
      const prev = map.get(uid) ?? { tasks: [], hours: 0 }
      if (!prev.tasks.find((x) => x.id === t.id)) prev.tasks.push(t)
      prev.hours += t.effort_hours
      map.set(uid, prev)
    }
  }

  return Array.from(map.entries()).map(([uid, { tasks, hours }]) => {
    const meta     = userMeta[uid]
    const salary   = salaryMap[uid] ?? 0
    const dailyCost = salary / WORKING_DAYS_PER_MONTH

    return {
      user_id:     uid,
      user_name:   meta?.name ?? uid,
      user_code:   meta?.user_code ?? '',
      department:  meta?.role ?? 'ops',
      total_hours: hours,
      tasks,
      daily_cost:  dailyCost,
    }
  }).sort((a, b) => b.total_hours - a.total_hours)
}

/** Utilisation colour based on daily hours */
export function utilisationColor(hours: number): string {
  if (hours === 0)  return 'bg-slate-100 text-slate-400'
  if (hours <= 4)   return 'bg-green-100 text-green-700'
  if (hours <= 6)   return 'bg-yellow-100 text-yellow-700'
  if (hours === 8)  return 'bg-blue-100 text-blue-700'
  return 'bg-red-100 text-red-700'  // overloaded
}
