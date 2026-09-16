import type { Milestone } from '../types/index.ts'
import { tokyoDayStamp } from './completion.ts'
import { AT_RISK_DAYS } from './constants.ts'

const DAY_MS = 86_400_000
type ListMilestone = Pick<Milestone, 'id' | 'status' | 'target_date' | 'completed_date'>
export type MilestoneListGroupKey = 'overdue' | 'due' | 'active' | 'planned' | 'completed'
const GROUP_ORDER: MilestoneListGroupKey[] = ['overdue', 'due', 'active', 'planned', 'completed']

function dayTime(iso: string): number {
  const date = new Date(iso)
  return date.setUTCHours(0, 0, 0, 0)
}

export function getMilestoneDaysLeft(targetDate: string, now = new Date()): number {
  const target = dayTime(targetDate)
  return Number.isFinite(target) ? Math.round((target - dayTime(tokyoDayStamp(now))) / DAY_MS) : 0
}

export function formatMilestoneDate(iso: string | null | undefined, locale: string, now = new Date(), fullYear = false): string {
  if (!iso || !Number.isFinite(dayTime(iso))) return '—'
  const date = new Date(iso)
  const currentYear = new Date(tokyoDayStamp(now)).getUTCFullYear()
  const includeYear = fullYear || date.getUTCFullYear() !== currentYear
  if (locale.startsWith('zh') || locale.startsWith('ja')) {
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${includeYear ? `${date.getUTCFullYear()}年` : ''}${month}月${day}日`
  }
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: locale.startsWith('en') ? 'short' : '2-digit',
    day: locale.startsWith('en') ? 'numeric' : '2-digit',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  }).format(date)
}

export function groupMilestonesForList<T extends ListMilestone>(milestones: T[], now = new Date()): { key: MilestoneListGroupKey; milestones: T[] }[] {
  const groups = new Map<MilestoneListGroupKey, T[]>()
  for (const milestone of milestones) {
    const daysLeft = getMilestoneDaysLeft(milestone.target_date, now)
    const validTarget = Number.isFinite(dayTime(milestone.target_date))
    const key: MilestoneListGroupKey = milestone.completed_date || milestone.status === 'completed' ? 'completed'
      : milestone.status === 'missed' || (validTarget && daysLeft < 0) ? 'overdue'
      : milestone.status === 'at_risk' || (validTarget && daysLeft <= AT_RISK_DAYS) ? 'due'
      : milestone.status === 'active' ? 'active' : 'planned'
    groups.set(key, [...(groups.get(key) ?? []), milestone])
  }
  return GROUP_ORDER.flatMap(key => {
    const items = groups.get(key)
    if (!items) return []
    items.sort((a, b) => {
      const dateA = dayTime(key === 'completed' ? a.completed_date ?? a.target_date : a.target_date)
      const dateB = dayTime(key === 'completed' ? b.completed_date ?? b.target_date : b.target_date)
      const comparison = (Number.isFinite(dateA) ? dateA : Infinity) - (Number.isFinite(dateB) ? dateB : Infinity)
      return (key === 'completed' ? -comparison : comparison) || a.id.localeCompare(b.id)
    })
    return [{ key, milestones: items }]
  })
}

export function buildMilestoneOverview<T extends Pick<Milestone, 'id' | 'target_date'>>(milestones: T[], now = new Date()) {
  const sorted = milestones.filter(m => Number.isFinite(dayTime(m.target_date)))
    .sort((a, b) => dayTime(a.target_date) - dayTime(b.target_date) || a.id.localeCompare(b.id))
  const today = dayTime(tokyoDayStamp(now))
  const earliest = Math.min(today, ...sorted.map(m => dayTime(m.target_date)))
  const latest = Math.max(today, ...sorted.map(m => dayTime(m.target_date)))
  const span = Math.max(30 * DAY_MS, latest - earliest + 14 * DAY_MS)
  const start = earliest - 7 * DAY_MS
  const end = start + span
  const position = (time: number) => 5 + ((time - start) / span) * 90
  const numbers: Record<string, number> = {}
  const groups: { id: string; x: number; milestones: T[] }[] = []
  sorted.forEach((milestone, index) => {
    numbers[milestone.id] = index + 1
    const x = position(dayTime(milestone.target_date))
    const previous = groups[groups.length - 1]
    // Keep the first marker as the anchor; averaging can move clusters close
    // enough to overlap. Eight percent gives 51px between 44px hit targets.
    if (previous && x - previous.x < 8) previous.milestones.push(milestone)
    else groups.push({ id: milestone.id, x, milestones: [milestone] })
  })
  const first = new Date(start)
  first.setUTCDate(1)
  if (first.getTime() < start) first.setUTCMonth(first.getUTCMonth() + 1)
  const last = new Date(end)
  const monthCount = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1
  const step = Math.max(1, Math.ceil(monthCount / 7))
  const ticks: { date: string; x: number }[] = []
  while (first.getTime() <= end) {
    ticks.push({ date: first.toISOString(), x: position(first.getTime()) })
    first.setUTCMonth(first.getUTCMonth() + step)
  }
  return { groups, numbers, ticks, todayX: position(today) }
}
