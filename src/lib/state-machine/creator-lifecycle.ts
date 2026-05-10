import type { CreatorStatus } from '@/lib/types'

// Valid transitions: forward and backward allowed
const TRANSITIONS: Record<CreatorStatus, CreatorStatus[]> = {
  prospect:    ['contacted'],
  contacted:   ['prospect', 'engaged'],
  engaged:     ['contacted', 'onboarded'],
  onboarded:   ['engaged', 'live_ready'],
  live_ready:  ['onboarded', 'live'],
  live:        ['live_ready', 'monetized'],
  monetized:   ['live'], // can roll back to live
}

export function canTransition(from: CreatorStatus, to: CreatorStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function isBackwardTransition(from: CreatorStatus, to: CreatorStatus): boolean {
  const statusOrder: CreatorStatus[] = [
    'prospect', 'contacted', 'engaged', 'onboarded', 'live_ready', 'live', 'monetized'
  ]
  const fromIndex = statusOrder.indexOf(from)
  const toIndex = statusOrder.indexOf(to)
  return toIndex < fromIndex
}

export function nextStatus(current: CreatorStatus): CreatorStatus | null {
  const statusOrder: CreatorStatus[] = [
    'prospect', 'contacted', 'engaged', 'onboarded', 'live_ready', 'live', 'monetized'
  ]
  const currentIndex = statusOrder.indexOf(current)
  if (currentIndex < 0 || currentIndex >= statusOrder.length - 1) return null
  const forward = statusOrder[currentIndex + 1]
  return canTransition(current, forward) ? forward : null
}

// Which agent role to assign when entering a given status
export const STATUS_AGENT_ROLE: Partial<Record<CreatorStatus, 'bd' | 'ops' | 'finance'>> = {
  contacted:   'bd',
  engaged:     'bd',
  onboarded:   'ops',
  live_ready:  'ops',
  live:        'ops',
  monetized:   'finance',
}

// Human-readable label
export const STATUS_LABEL: Record<CreatorStatus, string> = {
  prospect:   'Prospect',
  contacted:  'Contacted',
  engaged:    'Engaged',
  onboarded:  'Onboarded',
  live_ready: 'Live Ready',
  live:       'Live',
  monetized:  'Monetized',
}

// Tailwind color classes for each status
export const STATUS_COLOR: Record<CreatorStatus, { bg: string; text: string; dot: string }> = {
  prospect:   { bg: 'bg-slate-100',   text: 'text-slate-700',  dot: 'bg-slate-400' },
  contacted:  { bg: 'bg-blue-100',    text: 'text-blue-700',   dot: 'bg-blue-500' },
  engaged:    { bg: 'bg-cyan-100',    text: 'text-cyan-700',   dot: 'bg-cyan-500' },
  onboarded:  { bg: 'bg-purple-100',  text: 'text-purple-700', dot: 'bg-purple-500' },
  live_ready: { bg: 'bg-amber-100',   text: 'text-amber-700',  dot: 'bg-amber-500' },
  live:       { bg: 'bg-green-100',   text: 'text-green-700',  dot: 'bg-green-500' },
  monetized:  { bg: 'bg-emerald-100', text: 'text-emerald-700',dot: 'bg-emerald-500' },
}

// Which knowledge categories are most relevant per status
export const STATUS_KNOWLEDGE: Partial<Record<CreatorStatus, string[]>> = {
  contacted:  ['outreach_scripts'],
  engaged:    ['outreach_scripts', 'objection_handling'],
  onboarded:  ['onboarding_materials'],
  live_ready: ['live_strategies'],
  live:       ['live_strategies'],
  monetized:  [],
}

// Auto-generated task title when entering a status
export const STATUS_TASK_TITLE: Partial<Record<CreatorStatus, string>> = {
  contacted:  'Generate personalized outreach message',
  engaged:    'Develop creator engagement strategy',
  onboarded:  'Create onboarding plan and checklist',
  live_ready: 'Build live streaming plan and schedule',
  live:       'Monitor live session and optimize',
  monetized:  'Calculate ROI and profitability report',
}

export const ALL_STATUSES: CreatorStatus[] = [
  'prospect', 'contacted', 'engaged', 'onboarded', 'live_ready', 'live', 'monetized',
]
