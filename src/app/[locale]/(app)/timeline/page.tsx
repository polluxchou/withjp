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
import {
  MilestoneStatusBadge,
  MilestonePriorityBadge,
  MilestoneTypeBadge,
  STATUS_BAR_COLOR,
} from '@/components/milestones/MilestoneStatusBadge'
import { Plus, List, BarChart2, Target, AlertTriangle } from 'lucide-react'
import type { Milestone, MilestoneStatus, MilestoneType } from '@/lib/types'

// ── Constants ─────────────────────────────────────────────────

const STATUS_TABS: { value: MilestoneStatus | 'all'; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'planned',   label: 'Planned' },
  { value: 'active',    label: 'Active' },
  { value: 'at_risk',   label: 'At Risk' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed',    label: 'Missed' },
]

const TYPE_OPTIONS: { value: MilestoneType | 'all'; label: string }[] = [
  { value: 'all',         label: 'All Types' },
  { value: 'campaign',    label: 'Campaign' },
  { value: 'launch',      label: 'Launch' },
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'finance',     label: 'Finance' },
  { value: 'review',      label: 'Review' },
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
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading]       = useState(true)
  const [view, setView]             = useState<'list' | 'gantt'>('list')
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
        title="Master Timeline"
        subtitle="Company-level strategic milestones and execution plan"
        actions={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setView('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                <List className="w-3.5 h-3.5" /> List
              </button>
              <button onClick={() => setView('gantt')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'gantt' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                <BarChart2 className="w-3.5 h-3.5" /> Timeline
              </button>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" /> New Milestone
            </Button>
          </div>
        }
      />

      {/* At-risk alert */}
      {atRiskCount > 0 && (
        <div className="flex items-center gap-2 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{atRiskCount}</strong> milestone{atRiskCount > 1 ? 's are' : ' is'} at risk — target date approaching within 7 days.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Status tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_TABS.map(t => (
            <button key={t.value} onClick={() => setStatusFilter(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === t.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as MilestoneType | 'all')}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400">
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-12 text-center text-sm text-slate-400">Loading milestones…</div>
      ) : milestones.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl">
          <Target className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-3">No milestones found.</p>
          <Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Create your first milestone</Button>
        </div>
      ) : view === 'list' ? (
        <ListView milestones={milestones} onUpdated={load} />
      ) : (
        <GanttView milestones={milestones} />
      )}

      {/* Create modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Milestone" width="max-w-2xl">
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
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this milestone?')) return
    await fetch(`/api/milestones/${id}`, { method: 'DELETE' })
    onUpdated()
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Milestone</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Type</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Status</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Priority</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Owner</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Start</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Target</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Days left</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {milestones.map(m => {
            const daysLeft = m.days_until_target ?? 0
            const daysColor = daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-600' : 'text-slate-500'
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
                  {(m.owner_agent as { name?: string } | null | undefined)?.name ?? '—'}
                </td>
                <td className="px-5 py-3 text-slate-400 text-xs">
                  {format(new Date(m.start_date), 'MMM d, yyyy')}
                </td>
                <td className="px-5 py-3 text-slate-400 text-xs">
                  {format(new Date(m.target_date), 'MMM d, yyyy')}
                </td>
                <td className={`px-5 py-3 text-xs font-medium ${daysColor}`}>
                  {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/timeline/${m.id}`}
                      className="text-xs text-indigo-600 font-medium hover:text-indigo-800">
                      View →
                    </Link>
                    <button onClick={() => handleDelete(m.id)}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors">
                      Delete
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
              className="text-xs text-red-500 font-medium whitespace-nowrap">Today</span>
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
            <span className="text-xs text-slate-500 capitalize">{s.replace('_', ' ')}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-0.5 h-4 bg-red-400" />
          <span className="text-xs text-slate-500">Today</span>
        </div>
      </div>
    </div>
  )
}
