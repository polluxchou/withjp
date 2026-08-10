'use client'

import { useState, useEffect, useCallback } from 'react'
import { Link } from '@/i18n/navigation'
import { addMonths } from 'date-fns/addMonths'
import { differenceInDays } from 'date-fns/differenceInDays'
import { eachMonthOfInterval } from 'date-fns/eachMonthOfInterval'
import { endOfMonth } from 'date-fns/endOfMonth'
import { format } from 'date-fns/format'
import { startOfMonth } from 'date-fns/startOfMonth'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import { Select } from '@/components/ui/Field'
import { CountChip } from '@/components/ui/FilterChip'
import { Stat, StatBand } from '@/components/ui/Stat'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
import SectionCard from '@/components/ui/SectionCard'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'
import LoadingState from '@/components/ui/LoadingState'
import ErrorState from '@/components/ui/ErrorState'
import { toneOf } from '@/lib/ui/status-tone'
import { AXIS, GRID, seriesColor } from '@/lib/chart-theme'
import MilestoneForm from '@/components/milestones/MilestoneForm'
import NextTimelineView from '@/components/milestones/NextTimelineView'
import {
  MilestoneStatusBadge,
  MilestonePriorityBadge,
  MilestoneTypeBadge,
  MILESTONE_STATUSES,
  STATUS_LABEL_KEY,
  STATUS_FILL_CLASS,
} from '@/components/milestones/MilestoneStatusBadge'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Dot,
} from 'recharts'
import { Plus, Target, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Milestone, MilestoneStatus, MilestoneType } from '@/lib/types'
import { AT_RISK_DAYS } from '@/lib/milestones/constants'

// ── Constants ─────────────────────────────────────────────────

const TYPE_OPTION_VALUES: (MilestoneType | 'all')[] = [
  'all', 'campaign', 'launch', 'recruitment', 'finance', 'review',
]

// ── Gantt helpers ─────────────────────────────────────────────

const PX_PER_DAY  = 4
const LABEL_WIDTH = 200

function buildGanttRange(milestones: Milestone[]) {
  if (milestones.length === 0) {
    const now = new Date()
    return { rangeStart: startOfMonth(now), totalDays: 180 }
  }
  const starts = milestones.map(m => new Date(m.start_date).getTime())
  const ends   = milestones.map(m => new Date(m.target_date).getTime())
  const minDate = new Date(Math.min(...starts))
  const maxDate = new Date(Math.max(...ends))
  const rangeStart = addMonths(startOfMonth(minDate), -1)
  const rangeEnd   = addMonths(endOfMonth(maxDate),   +1)
  return {
    rangeStart,
    totalDays: Math.max(differenceInDays(rangeEnd, rangeStart), 90),
  }
}

function getBar(m: Milestone, rangeStart: Date) {
  const left  = Math.max(0, differenceInDays(new Date(m.start_date), rangeStart))  * PX_PER_DAY
  const right = Math.max(0, differenceInDays(new Date(m.target_date), rangeStart)) * PX_PER_DAY
  const width = Math.max(right - left, PX_PER_DAY * 3)
  return { left, width }
}

// ── Page component ────────────────────────────────────────────

export default function TimelinePage() {
  const t = useTranslations('timeline')
  const tCommon = useTranslations('common')
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState<string | null>(null)
  const [view, setView]             = useState<'next' | 'list' | 'gantt' | 'curve'>('next')
  const [showForm, setShowForm]     = useState(false)
  const [statusFilter, setStatusFilter] = useState<MilestoneStatus | 'all'>('all')
  const [typeFilter,   setTypeFilter]   = useState<MilestoneType   | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (typeFilter   !== 'all') params.set('type',   typeFilter)
      const res  = await fetch(`/api/milestones?${params}`)
      const json = await res.json()
      setLoadError(json.error ?? null)
      setMilestones(json.data ?? [])
    } catch (err) {
      console.error('Failed to load milestones:', err)
      setLoadError(err instanceof Error ? err.message : tCommon('loadFailed'))
      setMilestones([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter, tCommon])

  useEffect(() => { load() }, [load])

  const atRiskCount = milestones.filter(m => m.status === 'at_risk').length

  // Shared three-state gate (design-system §6.3) — loading/error/empty look
  // and behave the same across all four view tabs. `null` means "there's
  // real data, render the tab's own content instead". LoadingState keeps
  // the row-skeleton specifically for the 'list' tab (Table's real shape is
  // known there); the other three tabs (next/gantt/curve) fall back to the
  // generic spinner since their layouts vary too much to skeleton
  // meaningfully (same rationale as expenses/page.tsx's own threeState).
  const threeState = loading ? (
    <LoadingState variant={view === 'list' ? 'list' : 'plain'} />
  ) : loadError ? (
    <ErrorState title={tCommon('errorTitle')} detail={loadError} onRetry={load} />
  ) : milestones.length === 0 ? (
    <EmptyState
      icon={<Target />}
      title={t('empty')}
      action={<Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-3.5 h-3.5" /> {t('createFirst')}</Button>}
    />
  ) : null

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        tabs={
          <Tabs
            label={t('title')}
            items={[
              { value: 'next',  label: t('view.next') },
              { value: 'list',  label: t('view.list') },
              { value: 'gantt', label: t('view.gantt') },
              { value: 'curve', label: t('view.curve') },
            ]}
            value={view}
            onChange={(v) => setView(v as typeof view)}
          />
        }
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> {t('newMilestone')}
          </Button>
        }
      />

      {/* At-risk alert */}
      {atRiskCount > 0 && (
        <div className="flex items-center gap-2 mb-4 rounded-card border border-warning-border bg-warning-soft px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 text-warning-text flex-shrink-0" strokeWidth={1.5} />
          <p className="text-sm text-warning-text">
            {t.rich('atRiskAlert', {
              count: atRiskCount,
              days:  AT_RISK_DAYS,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      )}

      {/* Filters — status CountChip row (same idiom as creators/page.tsx:
          counts reflect only the currently loaded/filtered milestones since
          statusFilter drives the server fetch, not a true cross-status
          total — an existing characteristic of that reference pattern, not
          a regression introduced here) + a compact type Select. */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <CountChip
          label={tCommon('all')}
          count={milestones.length}
          tone="neutral"
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        {MILESTONE_STATUSES.map((s) => (
          <CountChip
            key={s}
            label={t(`status.${STATUS_LABEL_KEY[s]}`)}
            count={milestones.filter((m) => m.status === s).length}
            tone={toneOf('milestone', s)}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          />
        ))}
        <Select
          aria-label={t('typeFilterLabel')}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as MilestoneType | 'all')}
          className="w-44"
        >
          {TYPE_OPTION_VALUES.map(value => <option key={value} value={value}>{t(`type.${value}`)}</option>)}
        </Select>
      </div>

      {/* Content */}
      {threeState ?? (
        view === 'next' ? (
          <NextTimelineView milestones={milestones} />
        ) : view === 'list' ? (
          <ListView milestones={milestones} onUpdated={load} />
        ) : view === 'gantt' ? (
          <GanttView milestones={milestones} />
        ) : (
          <CurveView milestones={milestones} />
        )
      )}

      {/* Create modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={t('newMilestone')} width="max-w-2xl">
        <MilestoneForm
          onSuccess={() => { setShowForm(false); load() }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────

function ListView({ milestones, onUpdated }: { milestones: Milestone[]; onUpdated: () => void }) {
  const t = useTranslations('timeline')
  const handleDelete = async (id: string) => {
    if (!confirm(t('deleteConfirm'))) return
    try {
      const res = await fetch(`/api/milestones/${id}`, { method: 'DELETE' })
      if (res.ok) onUpdated()
      else console.error('Failed to delete milestone:', res.status)
    } catch (err) {
      console.error('Failed to delete milestone:', err)
    }
  }

  return (
    <SectionCard padding="none">
      <Table label={t('title')} minWidth={880}>
        <THead>
          <Tr>
            <Th>{t('table.milestone')}</Th>
            <Th>{t('table.type')}</Th>
            <Th>{t('table.status')}</Th>
            <Th>{t('table.priority')}</Th>
            <Th>{t('table.owner')}</Th>
            <Th>{t('table.start')}</Th>
            <Th>{t('table.target')}</Th>
            <Th>{t('table.daysLeft')}</Th>
            <Th />
          </Tr>
        </THead>
        <TBody>
          {milestones.map(m => {
            const daysLeft = m.days_until_target ?? 0
            const daysColor = daysLeft < 0 ? 'text-danger-text' : daysLeft <= AT_RISK_DAYS ? 'text-warning-text' : 'text-ink-500'
            return (
              <Tr key={m.id}>
                <Td>
                  <Link href={`/timeline/${m.id}`} className="font-medium text-ink-900 hover:text-primary transition-colors">
                    {m.title}
                  </Link>
                  {m.description && (
                    <p className="text-xs text-ink-400 mt-0.5 line-clamp-1">{m.description}</p>
                  )}
                </Td>
                <Td><MilestoneTypeBadge type={m.type} size="sm" /></Td>
                <Td><MilestoneStatusBadge status={m.status} size="sm" /></Td>
                <Td><MilestonePriorityBadge priority={m.priority} size="sm" /></Td>
                <Td className="text-ink-500 text-xs">
                  {(m.owner_agent as { name?: string } | null | undefined)?.name ?? t('table.ownerEmpty')}
                </Td>
                <Td className="text-ink-400 text-xs">
                  {format(new Date(m.start_date), 'MMM d, yyyy')}
                </Td>
                <Td className="text-ink-400 text-xs">
                  {format(new Date(m.target_date), 'MMM d, yyyy')}
                </Td>
                <Td className={`text-xs font-medium ${daysColor}`}>
                  {daysLeft < 0 ? t('table.overdue', { days: Math.abs(daysLeft) }) : t('table.daysShort', { days: daysLeft })}
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/timeline/${m.id}`}
                      className="text-xs text-primary font-medium hover:text-primary-hover">
                      {t('table.view')}
                    </Link>
                    <button type="button" onClick={() => handleDelete(m.id)}
                      className="text-xs text-ink-400 hover:text-danger-text transition-colors">
                      {t('table.delete')}
                    </button>
                  </div>
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
    </SectionCard>
  )
}

// ── Gantt view ────────────────────────────────────────────────

function GanttView({ milestones }: { milestones: Milestone[] }) {
  const t = useTranslations('timeline')
  const { rangeStart, totalDays } = buildGanttRange(milestones)
  const totalWidth = LABEL_WIDTH + totalDays * PX_PER_DAY

  const months = eachMonthOfInterval({
    start: rangeStart,
    end:   addMonths(rangeStart, Math.ceil(totalDays / 30) + 1),
  })

  const todayOffset = Math.max(0, differenceInDays(new Date(), rangeStart)) * PX_PER_DAY
  const ROW_H = 40
  const HEADER_H = 36
  const totalHeight = HEADER_H + milestones.length * ROW_H + 16

  return (
    <div className="bg-surface border border-line rounded-card overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalWidth, height: totalHeight, position: 'relative' }}>

          {/* Month grid lines + labels */}
          {months.map((month, i) => {
            const offset = LABEL_WIDTH + differenceInDays(month, rangeStart) * PX_PER_DAY
            return (
              <div key={i} style={{ position: 'absolute', left: offset, top: 0, bottom: 0, width: 1 }}
                className="border-l border-line-soft">
                <span style={{ position: 'absolute', top: 10, left: 6 }}
                  className="text-xs text-ink-400 whitespace-nowrap">
                  {format(month, 'MMM yyyy')}
                </span>
              </div>
            )
          })}

          {/* Today line */}
          <div style={{ position: 'absolute', left: LABEL_WIDTH + todayOffset, top: 0, bottom: 0, width: 2, zIndex: 10 }}
            className="bg-danger-dot opacity-70">
            <span style={{ position: 'absolute', top: 10, left: 4 }}
              className="text-xs text-danger-text font-medium whitespace-nowrap">{t('gantt.today')}</span>
          </div>

          {/* Milestone rows */}
          {milestones.map((m, i) => {
            const { left, width } = getBar(m, rangeStart)
            const top = HEADER_H + i * ROW_H
            const barClass = STATUS_FILL_CLASS[toneOf('milestone', m.status)]
            return (
              <div key={m.id} style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_H }}>
                {/* Row background (alternating) */}
                {i % 2 === 0 && (
                  <div style={{ position: 'absolute', inset: 0 }} className="bg-canvas" />
                )}
                {/* Label */}
                <div style={{ position: 'absolute', left: 0, width: LABEL_WIDTH - 8, top: 8, height: ROW_H - 8 }}
                  className="flex items-center pr-3 pl-4 overflow-hidden">
                  <span className="text-xs text-ink-700 truncate font-medium">{m.title}</span>
                </div>
                {/* Bar */}
                <Link href={`/timeline/${m.id}`}>
                  <div
                    style={{ position: 'absolute', left: LABEL_WIDTH + left, width, top: 8, height: 24 }}
                    className={`${barClass} rounded-field cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden`}
                    title={`${m.title} — ${format(new Date(m.start_date), 'MMM d')} → ${format(new Date(m.target_date), 'MMM d, yyyy')}`}>
                    <span className="text-white text-xs px-2 truncate leading-none">{m.title}</span>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-line-soft px-5 py-3 flex items-center gap-5 flex-wrap">
        {MILESTONE_STATUSES.map(s => (
          <Tag key={s} size="sm" variant="dot" tone={toneOf('milestone', s)} label={t(`status.${STATUS_LABEL_KEY[s]}`)} />
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-0.5 h-4 bg-danger-dot" />
          <span className="text-xs text-ink-500">{t('gantt.today')}</span>
        </div>
      </div>
    </div>
  )
}

// ── Progress curve view ────────────────────────────────────────

interface CurvePoint {
  month:     string   // 'YYYY-MM'
  planned:   number   // cumulative milestones due by this month
  completed: number   // cumulative milestones completed (status=completed) by their target_date
  active:    number   // cumulative milestones that entered active/at_risk/planned by start_date
  // individual milestone markers for this month
  markers:   Milestone[]
}

function buildCurveData(milestones: Milestone[]): CurvePoint[] {
  if (milestones.length === 0) return []

  const starts  = milestones.map(m => new Date(m.start_date).getTime())
  const targets = milestones.map(m => new Date(m.target_date).getTime())
  const minDate = startOfMonth(new Date(Math.min(...starts)))
  const maxDate = endOfMonth(addMonths(new Date(Math.max(...targets)), 1))

  const months = eachMonthOfInterval({ start: minDate, end: maxDate })

  return months.map(monthDate => {
    const monthEnd = endOfMonth(monthDate).getTime()
    const monthKey = format(monthDate, 'yyyy-MM')

    // Milestones due by end of this month (target_date <= monthEnd)
    const planned = milestones.filter(m =>
      new Date(m.target_date).getTime() <= monthEnd
    ).length

    // Milestones with status='completed' AND target_date in or before this month
    const completed = milestones.filter(m =>
      m.status === 'completed' && new Date(m.target_date).getTime() <= monthEnd
    ).length

    // Milestones in-flight this month (started by monthEnd, not yet due before monthStart)
    const monthStart = monthDate.getTime()
    const active = milestones.filter(m =>
      new Date(m.start_date).getTime() <= monthEnd &&
      new Date(m.target_date).getTime() >= monthStart
    ).length

    // Markers: milestones whose target_date falls in this month
    const markers = milestones.filter(m => {
      const td = new Date(m.target_date)
      return format(td, 'yyyy-MM') === monthKey
    })

    return { month: monthKey, planned, completed, active, markers }
  })
}

interface ChartTooltipProps {
  active?: boolean
  // eslint-disable-next-line
  payload?: any[]
  label?: string
}

// Custom tooltip for the curve chart
function CurveTooltip({ active, payload, label }: ChartTooltipProps) {
  const t = useTranslations('timeline')
  if (!active || !payload || payload.length === 0) return null

  const point = payload[0]?.payload as CurvePoint | undefined
  const markers = point?.markers ?? []

  return (
    <div className="bg-surface border border-line rounded-field shadow-pop p-3 text-xs min-w-[200px]">
      <p className="font-semibold text-ink-700 mb-2">{label}</p>
      <div className="space-y-1 mb-2">
        {payload.map((p) => (
          <p key={String(p.dataKey)} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-ink-500">{p.name}:</span>
            <span className="font-semibold text-ink-900 ml-auto pl-2">{p.value}</span>
          </p>
        ))}
      </div>
      {markers.length > 0 && (
        <div className="border-t border-line-soft pt-2 space-y-1">
          <p className="text-ink-400 mb-1">{t('curve.tooltipMonthMilestones')}</p>
          {markers.map(m => (
            <div key={m.id} className="flex items-center gap-2 justify-between">
              <span className="text-ink-700 truncate min-w-0 flex-1">{m.title}</span>
              {/* flex-none — Tag has no className prop, so the wrapping div
                  carries it (same idiom as creators/[id]/page.tsx's own
                  ACTIVITY_TONE Tag), keeping the pill from shrinking as a
                  bare flex child next to the truncating title. */}
              <div className="flex-none">
                <Tag size="sm" variant="dot" tone={toneOf('milestone', m.status)} label={t(`status.${STATUS_LABEL_KEY[m.status]}`)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CurveView({ milestones }: { milestones: Milestone[] }) {
  const t = useTranslations('timeline')
  const data    = buildCurveData(milestones)
  const today   = format(new Date(), 'yyyy-MM')
  const total   = milestones.length
  const done    = milestones.filter(m => m.status === 'completed').length
  const missed  = milestones.filter(m => m.status === 'missed').length
  const atRisk  = milestones.filter(m => m.status === 'at_risk').length

  if (milestones.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-card p-12 text-center text-sm text-ink-400">
        {t('curve.empty')}
      </div>
    )
  }

  const pct = (value: number) => total > 0 ? `${((value / total) * 100).toFixed(0)}%` : '—'

  return (
    <div className="bg-surface border border-line rounded-card p-5">
      {/* KPI row — plain ink numbers throughout (design-system §0 "色彩纪律":
          large colored KPI digits read as a rainbow, not a signal), with
          `missed` the one value that flips to danger tone since an overdue
          milestone is an unambiguous negative outcome (same convention as
          ListView's own overdue daysColor). */}
      <div className="mb-5">
        <StatBand>
          <Stat label={t('curve.kpiTotal')}     value={total}  note={pct(total)} />
          <Stat label={t('curve.kpiCompleted')} value={done}   note={pct(done)} />
          <Stat label={t('curve.kpiMissed')}    value={missed} note={pct(missed)} tone={missed > 0 ? 'danger' : 'default'} />
          <Stat label={t('curve.kpiAtRisk')}    value={atRisk} note={pct(atRisk)} />
        </StatBand>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis
            dataKey="month"
            {...AXIS}
            interval="preserveStartEnd"
          />
          <YAxis
            {...AXIS}
            allowDecimals={false}
            width={28}
          />
          <Tooltip content={<CurveTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          {/* Today marker */}
          <ReferenceLine
            x={today}
            stroke="var(--danger-dot)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: t('curve.todayLabel'), position: 'insideTopLeft', fontSize: 10, fill: 'var(--danger-dot)' }}
          />

          {/* Total capacity reference */}
          <ReferenceLine
            y={total}
            stroke="rgb(var(--ink-400) / 0.4)"
            strokeDasharray="3 3"
            label={{ value: t('curve.totalLabel', { total }), position: 'insideTopRight', fontSize: 10, fill: 'rgb(var(--ink-400) / 0.7)' }}
          />

          {/* Lines — planned/completed/active map onto CHART_SERIES[0/2/3]
              (violet/green/amber), preserving the original three-color
              intent through the shared series palette (design-system §1.5). */}
          <Line
            type="monotone"
            dataKey="planned"
            name={t('curve.seriesPlanned')}
            stroke={seriesColor(0)}
            strokeWidth={2}
            dot={false}
            strokeDasharray="6 2"
          />
          <Line
            type="monotone"
            dataKey="completed"
            name={t('curve.seriesCompleted')}
            stroke={seriesColor(2)}
            strokeWidth={2.5}
            dot={(props) => {
              // Show a dot on months that have milestone markers
              const point = props.payload as CurvePoint
              if (!point?.markers?.length) return <></>
              return (
                <Dot
                  key={`dot-${props.cx}-${props.cy}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={seriesColor(2)}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="active"
            name={t('curve.seriesActive')}
            stroke={seriesColor(3)}
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="3 3"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Gap analysis note */}
      {(() => {
        const planned = milestones.filter(m => new Date(m.target_date) <= new Date()).length
        if (done >= planned) return null
        return (
          <div className="mt-4 flex items-start gap-2 text-xs text-warning-text bg-warning-soft border border-warning-border rounded-field px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
            <span>
              {t.rich('curve.gap', {
                planned,
                done,
                gap: planned - done,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </span>
          </div>
        )
      })()}
    </div>
  )
}
