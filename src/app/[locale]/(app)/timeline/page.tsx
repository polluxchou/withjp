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
import MilestoneForm from '@/components/milestones/MilestoneForm'
import NextTimelineView from '@/components/milestones/NextTimelineView'
import {
  MilestoneStatusBadge,
  MilestonePriorityBadge,
  MilestoneTypeBadge,
  STATUS_BAR_COLOR,
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
import { Plus, List, BarChart2, TrendingUp, Target, AlertTriangle, CalendarDays } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Milestone, MilestoneStatus, MilestoneType } from '@/lib/types'
import { AT_RISK_DAYS } from '@/lib/milestones/constants'

// ── Constants ─────────────────────────────────────────────────

// Labels resolved at render time via t('status.<key>') / t('type.<key>').
const STATUS_TAB_VALUES: (MilestoneStatus | 'all')[] = [
  'all', 'planned', 'active', 'at_risk', 'completed', 'missed',
]

const TYPE_OPTION_VALUES: (MilestoneType | 'all')[] = [
  'all', 'campaign', 'launch', 'recruitment', 'finance', 'review',
]

// MilestoneStatus snake_case → camelCase key under `timeline.status`.
const STATUS_KEY: Record<MilestoneStatus | 'all', string> = {
  all:       'all',
  planned:   'planned',
  active:    'active',
  at_risk:   'atRisk',
  completed: 'completed',
  missed:    'missed',
}

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
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading]       = useState(true)
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
      setMilestones(json.data ?? [])
    } catch (err) {
      console.error('Failed to load milestones:', err)
      setMilestones([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter])

  useEffect(() => { load() }, [load])

  const atRiskCount = milestones.filter(m => m.status === 'at_risk').length

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setView('next')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'next' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                <CalendarDays className="w-3.5 h-3.5" /> 接下来 30 天
              </button>
              <button onClick={() => setView('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                <List className="w-3.5 h-3.5" /> {t('view.list')}
              </button>
              <button onClick={() => setView('gantt')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'gantt' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                <BarChart2 className="w-3.5 h-3.5" /> {t('view.gantt')}
              </button>
              <button onClick={() => setView('curve')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'curve' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                <TrendingUp className="w-3.5 h-3.5" /> {t('view.curve')}
              </button>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" /> {t('newMilestone')}
            </Button>
          </div>
        }
      />

      {/* At-risk alert */}
      {atRiskCount > 0 && (
        <div className="flex items-center gap-2 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            {t.rich('atRiskAlert', {
              count: atRiskCount,
              days:  AT_RISK_DAYS,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Status tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_TAB_VALUES.map(value => (
            <button key={value} onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              {t(`status.${STATUS_KEY[value]}`)}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as MilestoneType | 'all')}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400">
          {TYPE_OPTION_VALUES.map(value => <option key={value} value={value}>{t(`type.${value}`)}</option>)}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-12 text-center text-sm text-slate-400">{t('loading')}</div>
      ) : milestones.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl">
          <Target className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-3">{t('empty')}</p>
          <Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> {t('createFirst')}</Button>
        </div>
      ) : view === 'next' ? (
        <NextTimelineView milestones={milestones} />
      ) : view === 'list' ? (
        <ListView milestones={milestones} onUpdated={load} />
      ) : view === 'gantt' ? (
        <GanttView milestones={milestones} />
      ) : (
        <CurveView milestones={milestones} />
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
    const res = await fetch(`/api/milestones/${id}`, { method: 'DELETE' })
    if (res.ok) onUpdated()
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{t('table.milestone')}</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{t('table.type')}</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{t('table.status')}</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{t('table.priority')}</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{t('table.owner')}</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{t('table.start')}</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{t('table.target')}</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">{t('table.daysLeft')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {milestones.map(m => {
            const daysLeft = m.days_until_target ?? 0
            const daysColor = daysLeft < 0 ? 'text-red-500' : daysLeft <= AT_RISK_DAYS ? 'text-amber-600' : 'text-slate-500'
            return (
              <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/timeline/${m.id}`} className="font-medium text-slate-900 hover:text-indigo-600 transition-colors">
                    {m.title}
                  </Link>
                  {m.description && (
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{m.description}</p>
                  )}
                </td>
                <td className="px-5 py-3"><MilestoneTypeBadge type={m.type} size="sm" /></td>
                <td className="px-5 py-3"><MilestoneStatusBadge status={m.status} size="sm" /></td>
                <td className="px-5 py-3"><MilestonePriorityBadge priority={m.priority} size="sm" /></td>
                <td className="px-5 py-3 text-slate-500 text-xs">
                  {(m.owner_agent as { name?: string } | null | undefined)?.name ?? t('table.ownerEmpty')}
                </td>
                <td className="px-5 py-3 text-slate-400 text-xs">
                  {format(new Date(m.start_date), 'MMM d, yyyy')}
                </td>
                <td className="px-5 py-3 text-slate-400 text-xs">
                  {format(new Date(m.target_date), 'MMM d, yyyy')}
                </td>
                <td className={`px-5 py-3 text-xs font-medium ${daysColor}`}>
                  {daysLeft < 0 ? t('table.overdue', { days: Math.abs(daysLeft) }) : t('table.daysShort', { days: daysLeft })}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/timeline/${m.id}`}
                      className="text-xs text-indigo-600 font-medium hover:text-indigo-800">
                      {t('table.view')}
                    </Link>
                    <button type="button" onClick={() => handleDelete(m.id)}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors">
                      {t('table.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalWidth, height: totalHeight, position: 'relative' }}>

          {/* Month grid lines + labels */}
          {months.map((month, i) => {
            const offset = LABEL_WIDTH + differenceInDays(month, rangeStart) * PX_PER_DAY
            return (
              <div key={i} style={{ position: 'absolute', left: offset, top: 0, bottom: 0, width: 1 }}
                className="border-l border-slate-100">
                <span style={{ position: 'absolute', top: 10, left: 6 }}
                  className="text-xs text-slate-400 whitespace-nowrap">
                  {format(month, 'MMM yyyy')}
                </span>
              </div>
            )
          })}

          {/* Today line */}
          <div style={{ position: 'absolute', left: LABEL_WIDTH + todayOffset, top: 0, bottom: 0, width: 2, zIndex: 10 }}
            className="bg-red-400 opacity-70">
            <span style={{ position: 'absolute', top: 10, left: 4 }}
              className="text-xs text-red-500 font-medium whitespace-nowrap">{t('gantt.today')}</span>
          </div>

          {/* Milestone rows */}
          {milestones.map((m, i) => {
            const { left, width } = getBar(m, rangeStart)
            const top = HEADER_H + i * ROW_H
            const barColor = STATUS_BAR_COLOR[m.status]
            return (
              <div key={m.id} style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_H }}>
                {/* Row background (alternating) */}
                {i % 2 === 0 && (
                  <div style={{ position: 'absolute', inset: 0 }} className="bg-slate-50/50" />
                )}
                {/* Label */}
                <div style={{ position: 'absolute', left: 0, width: LABEL_WIDTH - 8, top: 8, height: ROW_H - 8 }}
                  className="flex items-center pr-3 pl-4 overflow-hidden">
                  <span className="text-xs text-slate-600 truncate font-medium">{m.title}</span>
                </div>
                {/* Bar */}
                <Link href={`/timeline/${m.id}`}>
                  <div
                    style={{ position: 'absolute', left: LABEL_WIDTH + left, width, top: 8, height: 24 }}
                    className={`${barColor} rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden`}
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
      <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-5 flex-wrap">
        {(['planned', 'active', 'at_risk', 'completed', 'missed'] as MilestoneStatus[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${STATUS_BAR_COLOR[s]}`} />
            <span className="text-xs text-slate-500">{t(`status.${STATUS_KEY[s]}`)}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-0.5 h-4 bg-red-400" />
          <span className="text-xs text-slate-500">{t('gantt.today')}</span>
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
    <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs min-w-[200px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      <div className="space-y-1 mb-2">
        {payload.map((p) => (
          <p key={String(p.dataKey)} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-slate-500">{p.name}:</span>
            <span className="font-semibold text-slate-800 ml-auto pl-2">{p.value}</span>
          </p>
        ))}
      </div>
      {markers.length > 0 && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          <p className="text-slate-400 mb-1">{t('curve.tooltipMonthMilestones')}</p>
          {markers.map(m => (
            <p key={m.id} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_BAR_COLOR[m.status]}`} />
              <span className="text-slate-700 truncate max-w-[140px]">{m.title}</span>
              <span className={`ml-auto text-xs px-1 rounded ${
                m.status === 'completed' ? 'text-green-600 bg-green-50' :
                m.status === 'missed'    ? 'text-red-600 bg-red-50' :
                m.status === 'at_risk'  ? 'text-amber-600 bg-amber-50' :
                'text-slate-500 bg-slate-50'
              }`}>{t(`status.${STATUS_KEY[m.status]}`)}</span>
            </p>
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
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-400">
        {t('curve.empty')}
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: t('curve.kpiTotal'),     value: total,  color: 'text-slate-900' },
          { label: t('curve.kpiCompleted'), value: done,   color: 'text-green-700' },
          { label: t('curve.kpiMissed'),    value: missed, color: 'text-red-600'   },
          { label: t('curve.kpiAtRisk'),    value: atRisk, color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="border border-slate-100 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 mb-0.5">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{total > 0 ? `${((value / total) * 100).toFixed(0)}%` : '—'}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={28}
          />
          <Tooltip content={<CurveTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          {/* Today marker */}
          <ReferenceLine
            x={today}
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: t('curve.todayLabel'), position: 'insideTopLeft', fontSize: 10, fill: '#ef4444' }}
          />

          {/* Total capacity reference */}
          <ReferenceLine
            y={total}
            stroke="#94a3b8"
            strokeDasharray="3 3"
            label={{ value: t('curve.totalLabel', { total }), position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }}
          />

          {/* Lines */}
          <Line
            type="monotone"
            dataKey="planned"
            name={t('curve.seriesPlanned')}
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            strokeDasharray="6 2"
          />
          <Line
            type="monotone"
            dataKey="completed"
            name={t('curve.seriesCompleted')}
            stroke="#10b981"
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
                  fill="#10b981"
                  stroke="#fff"
                  strokeWidth={2}
                />
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="active"
            name={t('curve.seriesActive')}
            stroke="#f59e0b"
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
          <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
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
