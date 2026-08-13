'use client'

import { useTranslations } from 'next-intl'
import Tag from '@/components/ui/Tag'
import { toneOf, type Tone } from '@/lib/ui/status-tone'
import type { MilestoneStatus, MilestonePriority, MilestoneType, RiskLevel } from '@/lib/types'

// ── Shared enum registrations ────────────────────────────────
//
// MilestoneStatus is the one enum registered in status-tone.ts (design-system
// §1.3 "战略节点" row) — toneOf('milestone', status) is the source of truth
// for its tone. Priority/Type/RiskLevel are categorical dimensions, not
// lifecycle-status enums, so (same idiom as creators/[id]/page.tsx's local
// ACTIVITY_TONE) they get their own local tone maps here instead of a
// status-tone.ts entry. Colors below preserve the original visual encoding
// (high/at_risk-ish = danger, medium = warning, …) just expressed as tones.

export const MILESTONE_STATUSES: MilestoneStatus[] = ['planned', 'active', 'at_risk', 'completed', 'missed']

// snake_case enum value → i18n key under `timeline.status` (at_risk → atRisk
// is the one case that isn't a straight identity mapping). Shared with
// timeline/page.tsx's status CountChip row so both stay in sync off one map.
export const STATUS_LABEL_KEY: Record<MilestoneStatus, string> = {
  planned: 'planned', active: 'active', at_risk: 'atRisk', completed: 'completed', missed: 'missed',
}

const PRIORITY_TONE: Record<MilestonePriority, Tone> = { high: 'danger', medium: 'warning', low: 'neutral' }
const RISK_TONE: Record<RiskLevel, Tone> = { low: 'success', medium: 'warning', high: 'danger' }
const TYPE_TONE: Record<MilestoneType, Tone> = {
  campaign: 'violet', launch: 'info', recruitment: 'success', finance: 'warning', review: 'neutral',
}

// Large-area fills (Gantt bars: a full-width rect with white text inside) —
// design-system §1.3 flags danger-dot as failing WCAG AA for white text
// (3.77:1) and requires danger-strong (4.83:1) for big fills; the other
// tones' -dot values stay dark enough to keep white text legible.
export const STATUS_FILL_CLASS: Record<Tone, string> = {
  success: 'bg-success-dot', warning: 'bg-warning-dot', danger: 'bg-danger-strong',
  info: 'bg-info-dot', neutral: 'bg-muted-dot', violet: 'bg-primary',
}

// ── Badge components ──────────────────────────────────────────
// External props are frozen (timeline pages call these the same way as
// before) — only the internal rendering moved onto Tag (+ toneOf for the
// one registered enum), same migration shape as LifecycleBadge.

export function MilestoneStatusBadge({
  status, size,
}: { status: MilestoneStatus; size?: 'sm' | 'md' }) {
  const t = useTranslations('timeline')
  return <Tag tone={toneOf('milestone', status)} label={t(`status.${STATUS_LABEL_KEY[status]}`)} size={size} />
}

export function MilestonePriorityBadge({
  priority, size,
}: { priority: MilestonePriority; size?: 'sm' | 'md' }) {
  const t = useTranslations('timeline')
  return <Tag tone={PRIORITY_TONE[priority]} label={t(`form.priorityValue.${priority}`)} size={size} />
}

export function MilestoneTypeBadge({
  type, size,
}: { type: MilestoneType; size?: 'sm' | 'md' }) {
  const t = useTranslations('timeline')
  return <Tag tone={TYPE_TONE[type]} label={t(`type.${type}`)} size={size} />
}

export function MilestoneRiskBadge({
  risk, size,
}: { risk: RiskLevel; size?: 'sm' | 'md' }) {
  const t = useTranslations('timeline')
  // Dedicated `riskBadge.*` copy ("Low risk"/"High risk"), not the bare
  // `form.riskValue.*` ("Low"/"High") shared with MilestonePriorityBadge —
  // both badges render side by side (see timeline/[id]/page.tsx), and bare
  // "High"/"High" for two different dimensions would be indistinguishable.
  return <Tag tone={RISK_TONE[risk]} label={t(`riskBadge.${risk}`)} size={size} />
}
