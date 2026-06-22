import type { MilestoneStatus, MilestonePriority, MilestoneType, RiskLevel } from '@/lib/types'

// ── Color maps ────────────────────────────────────────────────

const STATUS_CFG: Record<MilestoneStatus, { label: string; cls: string }> = {
  planned:   { label: 'Planned',   cls: 'bg-zinc-100 text-zinc-700' },
  active:    { label: 'Active',    cls: 'bg-blue-100 text-blue-700' },
  at_risk:   { label: 'At Risk',   cls: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  missed:    { label: 'Missed',    cls: 'bg-red-100 text-red-700' },
}

const PRIORITY_CFG: Record<MilestonePriority, { label: string; cls: string }> = {
  high:   { label: 'High',   cls: 'bg-red-50 text-red-600 border border-red-200' },
  medium: { label: 'Medium', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  low:    { label: 'Low',    cls: 'bg-zinc-50 text-zinc-500 border border-zinc-200' },
}

const TYPE_CFG: Record<MilestoneType, { label: string; cls: string }> = {
  campaign:    { label: 'Campaign',    cls: 'bg-purple-100 text-purple-700' },
  launch:      { label: 'Launch',      cls: 'bg-blue-100 text-blue-700' },
  recruitment: { label: 'Recruitment', cls: 'bg-green-100 text-green-700' },
  finance:     { label: 'Finance',     cls: 'bg-amber-100 text-amber-700' },
  review:      { label: 'Review',      cls: 'bg-zinc-100 text-zinc-600' },
}

const RISK_CFG: Record<RiskLevel, { label: string; cls: string }> = {
  low:    { label: 'Low Risk',    cls: 'bg-green-50 text-green-700' },
  medium: { label: 'Medium Risk', cls: 'bg-amber-50 text-amber-700' },
  high:   { label: 'High Risk',   cls: 'bg-red-50 text-red-600' },
}

// ── Bar colors for Gantt timeline ─────────────────────────────

export const STATUS_BAR_COLOR: Record<MilestoneStatus, string> = {
  planned:   'bg-zinc-400',
  active:    'bg-blue-500',
  at_risk:   'bg-amber-500',
  completed: 'bg-green-500',
  missed:    'bg-red-500',
}

// ── Badge components ──────────────────────────────────────────

const px = (size?: 'sm' | 'md') =>
  size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'

export function MilestoneStatusBadge({
  status, size,
}: { status: MilestoneStatus; size?: 'sm' | 'md' }) {
  const c = STATUS_CFG[status]
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${c.cls} ${px(size)}`}>
      {c.label}
    </span>
  )
}

export function MilestonePriorityBadge({
  priority, size,
}: { priority: MilestonePriority; size?: 'sm' | 'md' }) {
  const c = PRIORITY_CFG[priority]
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${c.cls} ${px(size)}`}>
      {c.label}
    </span>
  )
}

export function MilestoneTypeBadge({
  type, size,
}: { type: MilestoneType; size?: 'sm' | 'md' }) {
  const c = TYPE_CFG[type]
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${c.cls} ${px(size)}`}>
      {c.label}
    </span>
  )
}

export function MilestoneRiskBadge({
  risk, size,
}: { risk: RiskLevel; size?: 'sm' | 'md' }) {
  const c = RISK_CFG[risk]
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${c.cls} ${px(size)}`}>
      {c.label}
    </span>
  )
}
