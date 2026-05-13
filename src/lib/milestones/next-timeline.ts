export const DAY_MS = 86_400_000

export type TimelineStatus = 'planned' | 'active' | 'at_risk' | 'completed' | 'missed'
export type TimelinePriority = 'high' | 'medium' | 'low'
export type TimelineRisk = 'low' | 'medium' | 'high'
export type TimelineTone = 'danger' | 'warning' | 'success' | 'neutral'

export interface TimelineMilestone {
  id: string
  title: string
  target_date: string
  status: TimelineStatus
  priority: TimelinePriority
  risk_level: TimelineRisk
  owner_agent_id: string | null
}

export interface UpcomingRange {
  start: Date
  end: Date
  days: number
}

export interface TimelineVisual {
  tone: TimelineTone
  hollow: boolean
  label: string
}

export interface TimelineGroup<T extends TimelineMilestone = TimelineMilestone> {
  id: string
  x: number
  milestones: T[]
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function buildUpcomingRange(now: Date = new Date(), days = 30): UpcomingRange {
  const start = startOfLocalDay(now)
  return { start, end: new Date(start.getTime() + days * DAY_MS), days }
}

export function filterUpcomingMilestones<T extends TimelineMilestone>(
  milestones: T[],
  range: UpcomingRange,
): T[] {
  return milestones
    .filter((m) => {
      const time = new Date(m.target_date).getTime()
      return Number.isFinite(time) && time >= range.start.getTime() && time <= range.end.getTime()
    })
    .sort((a, b) => new Date(a.target_date).getTime() - new Date(b.target_date).getTime())
}

export function getTimelinePosition(targetDate: string, range: UpcomingRange): number {
  const total = range.end.getTime() - range.start.getTime()
  if (total <= 0) return 0

  const raw = ((new Date(targetDate).getTime() - range.start.getTime()) / total) * 100
  return Math.max(0, Math.min(100, Math.round(raw * 100) / 100))
}

export function getDaysLeft(targetDate: string, now: Date = new Date()): number {
  const today = startOfLocalDay(now).getTime()
  const target = startOfLocalDay(new Date(targetDate)).getTime()
  return Math.ceil((target - today) / DAY_MS)
}

export function getTimelineVisual(milestone: TimelineMilestone, now: Date = new Date()): TimelineVisual {
  const daysLeft = getDaysLeft(milestone.target_date, now)
  const hollow = !milestone.owner_agent_id

  if (milestone.status === 'missed' || daysLeft < 0 || milestone.status === 'at_risk' || milestone.risk_level === 'high') {
    return { tone: 'danger', hollow, label: '高风险' }
  }
  if (milestone.status === 'completed') {
    return { tone: 'success', hollow, label: '已完成' }
  }
  if (milestone.priority === 'high' || milestone.risk_level === 'medium' || daysLeft <= 7) {
    return { tone: 'warning', hollow, label: '需注意' }
  }
  return { tone: 'neutral', hollow, label: '计划中' }
}

export function groupTimelineItems<T extends TimelineMilestone>(
  milestones: T[],
  range: UpcomingRange,
  thresholdPct = 3,
): TimelineGroup<T>[] {
  const groups: TimelineGroup<T>[] = []

  for (const milestone of milestones) {
    const x = getTimelinePosition(milestone.target_date, range)
    const last = groups[groups.length - 1]
    if (last && Math.abs(last.x - x) <= thresholdPct) {
      last.milestones.push(milestone)
      last.x = Math.round(((last.x + x) / 2) * 100) / 100
    } else {
      groups.push({ id: milestone.id, x, milestones: [milestone] })
    }
  }

  return groups
}
