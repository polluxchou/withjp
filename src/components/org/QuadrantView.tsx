'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Stat, StatBand } from '@/components/ui/Stat'
import ItemDetailPanel from './ItemDetailPanel'
import OwnerFilter from './OwnerFilter'
import { writeSearchParams } from './searchParams'
import {
  QUADRANTS, URGENT_WITHIN_DAYS, dueBadge, flattenItems, groupItems, ownerOptions,
  parseLevel, parseOwnerFilter, quadrantStats,
} from '@/lib/org/quadrant'
import type { Bucket, DueBadge, ItemPatch, OwnerFilter as OwnerFilterValue, Quadrant, QuadrantRow } from '@/lib/org/quadrant'
import type { OrgSnapshot } from '@/lib/types'

// 四格色调：① danger ② info ③ warning ④ muted（spec 6.2）。整串类名写死，Tailwind 才扫得到。
const TONE: Record<Quadrant, { dot: string; text: string; tile: string }> = {
  q1: { dot: 'bg-danger-dot', text: 'text-danger-text', tile: 'border-danger-border bg-danger-soft' },
  q2: { dot: 'bg-info-dot', text: 'text-info-text', tile: 'border-info-border bg-info-soft' },
  q3: { dot: 'bg-warning-dot', text: 'text-warning-text', tile: 'border-warning-border bg-surface' },
  q4: { dot: 'bg-muted-dot', text: 'text-muted-text', tile: 'border-line bg-surface' },
}
const BADGE_TONE: Record<DueBadge['tone'], string> = {
  danger: 'bg-danger-soft text-danger-text',
  warning: 'bg-warning-soft text-warning-text',
  muted: 'bg-muted-soft text-muted-text',
}
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring'

interface Props {
  snapshot: OrgSnapshot
  today: string
  onUpdateItem: (itemId: string, fields: ItemPatch) => void
  onPickOwner: (itemId: string) => void
}

export default function QuadrantView({ snapshot, today, onUpdateItem, onPickOwner }: Props) {
  const t = useTranslations('team')
  const params = useSearchParams()
  const rows = useMemo(() => flattenItems(snapshot), [snapshot])
  const owner = parseOwnerFilter(params.get('owner'), rows)
  const level = parseLevel(params.get('q'))
  const groups = useMemo(() => groupItems(rows, today, owner), [rows, today, owner])
  const stats = quadrantStats(groups, today)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  // 本页内从首层点进来的才用 history.back()；直接打开带 ?q= 的链接时，返回要留在本页。
  const pushedLevel = useRef(false)
  // 稳定引用：面板的 Escape 监听以它为依赖，每次渲染换新函数会反复重绑监听。
  const closePanel = useCallback(() => setSelectedId(null), [])
  // 按 id 找、不按格内位置找：改完重要/截止日后事项会换格，面板跟着这个事项走。
  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null
  const positionName = (id: string) => snapshot.positions.find((p) => p.id === id)?.name ?? id

  const setOwner = (v: OwnerFilterValue) => writeSearchParams({ owner: v === 'all' ? null : v }, 'replace')
  const openLevel = (b: Bucket) => { pushedLevel.current = true; writeSearchParams({ q: b }, 'push') }
  const backHome = () => {
    if (pushedLevel.current) { pushedLevel.current = false; window.history.back() }
    else writeSearchParams({ q: null }, 'replace')
  }

  const title = (b: Bucket) =>
    b === 'q1' ? t('org.q1Title') : b === 'q2' ? t('org.q2Title') : b === 'q3' ? t('org.q3Title')
      : b === 'q4' ? t('org.q4Title') : b === 'unrated' ? t('org.unratedTitle') : t('org.doneTitle')
  const sub = (q: Quadrant) =>
    q === 'q1' ? t('org.q1Sub') : q === 'q2' ? t('org.q2Sub') : q === 'q3' ? t('org.q3Sub') : t('org.q4Sub')
  const dueText = (b: DueBadge) =>
    b.kind === 'overdue' ? t('org.dueOverdue', { days: b.days })
      : b.kind === 'today' ? t('org.dueToday')
        : b.kind === 'soon' ? t('org.dueSoon', { date: b.date, days: b.days })
          : b.date
  const ownerLabel = (row: QuadrantRow) => row.ownerName ?? t('org.statUnassigned')

  const badges = (row: QuadrantRow) => {
    const due = dueBadge(row, today)
    return (
      <span className="inline-flex flex-none items-center gap-1">
        {row.status === 'blocked' && (
          <span className="rounded-btn bg-danger-soft px-1.5 py-px text-micro font-semibold text-danger-text">{t('org.statusBlocked')}</span>
        )}
        {due && (
          <span className={`whitespace-nowrap rounded-btn px-1.5 py-px text-micro font-semibold tabular-nums ${BADGE_TONE[due.tone]}`}>{dueText(due)}</span>
        )}
      </span>
    )
  }

  // ── 桌面 ────────────────────────────────────────────────
  const desktopRow = (row: QuadrantRow) => (
    <li key={row.id}>
      <button
        type="button"
        onClick={() => setSelectedId(row.id)}
        title={`${row.businessName} › ${row.taskName}`}
        className={`flex w-full items-center gap-2.5 rounded-field px-2 py-2 text-left text-sm hover:bg-row-hover ${FOCUS}`}
      >
        <span className={`min-w-0 flex-1 truncate ${row.status === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{row.name}</span>
        <span className={`max-w-[7rem] flex-none truncate text-xs ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-500'}`}>{ownerLabel(row)}</span>
        {badges(row)}
      </button>
    </li>
  )

  const quadrantCard = (q: Quadrant) => (
    <section key={q} aria-label={title(q)} className="flex h-[420px] min-h-0 flex-col rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
        <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[q].dot}`} />
        <h3 className={`text-md font-semibold ${TONE[q].text}`}>{title(q)}</h3>
        <span className="text-xs text-ink-500">{sub(q)}</span>
        <span className="ml-auto rounded-btn bg-line-soft px-2 py-px text-xs font-semibold tabular-nums text-ink-700">{groups[q].length}</span>
      </header>
      {groups[q].length === 0
        ? <p className="m-auto text-xs text-ink-400">{t('org.emptyQuadrant')}</p>
        : <ul className="min-h-0 flex-1 overflow-y-auto p-2">{groups[q].map(desktopRow)}</ul>}
    </section>
  )

  const desktop = (
    <div className="hidden flex-col gap-4 md:flex">
      <StatBand>
        <Stat label={t('org.statOpen')} value={stats.open} />
        <Stat label={t('org.statOverdue')} value={stats.overdue} tone={stats.overdue ? 'danger' : 'default'} />
        <Stat label={t('org.statBlocked')} value={stats.blocked} tone={stats.blocked ? 'danger' : 'default'} />
        <Stat label={t('org.unratedTitle')} value={stats.unrated} />
        <Stat label={t('org.statUnassigned')} value={stats.unassigned} />
      </StatBand>

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <span className="text-xs text-ink-500">{t('org.owner')}</span>
        <OwnerFilter options={ownerOptions(rows, today, 'open')} value={owner} onChange={setOwner} />
        <span className="ml-auto text-xs text-ink-400">{t('org.filterCountHint')}</span>
      </div>

      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <span />
        <span className="text-center text-xs font-semibold text-ink-700">{t('org.axisUrgent')}</span>
        <span className="text-center text-xs font-semibold text-ink-500">{t('org.axisNotUrgent')}</span>
        <span className="self-center justify-self-center text-xs font-semibold tracking-widest text-ink-700 [writing-mode:vertical-rl]">{t('org.axisImportant')}</span>
        {quadrantCard('q1')}
        {quadrantCard('q2')}
        <span className="self-center justify-self-center text-xs font-semibold tracking-widest text-ink-500 [writing-mode:vertical-rl]">{t('org.axisNotImportant')}</span>
        {quadrantCard('q3')}
        {quadrantCard('q4')}
      </div>

      <section aria-label={t('org.unratedTitle')} className="rounded-card border border-dashed border-line-strong bg-surface p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-ink-900">{t('org.unratedTitle')} <span className="tabular-nums">{groups.unrated.length}</span></h3>
          <span className="text-xs text-ink-500">{t('org.unratedHint')}</span>
        </div>
        {groups.unrated.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {groups.unrated.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-btn bg-line-soft px-3 text-xs text-ink-900 hover:bg-row-hover ${FOCUS}`}
                >
                  <span className="max-w-[16rem] truncate">{row.name}</span>
                  <span className={row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-500'}>{ownerLabel(row)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('org.doneTitle')} className="rounded-card border border-line bg-surface">
        <button
          type="button"
          aria-expanded={doneOpen}
          onClick={() => setDoneOpen((v) => !v)}
          className={`flex w-full items-center gap-2 rounded-card px-4 py-3 text-left text-sm ${FOCUS}`}
        >
          <span aria-hidden className="h-2 w-2 rounded-full bg-success-dot" />
          <span className="font-semibold text-ink-900">{t('org.doneTitle')}</span>
          <span className="font-semibold tabular-nums text-success-text">{groups.done.length}</span>
          <span className="ml-auto text-xs text-primary">{doneOpen ? t('org.hide') : t('org.show')}</span>
        </button>
        {doneOpen && groups.done.length > 0 && <ul className="px-2 pb-2">{groups.done.map(desktopRow)}</ul>}
      </section>
    </div>
  )

  // ── 手机 ────────────────────────────────────────────────
  const tile = (q: Quadrant) => {
    const list = groups[q]
    const late = list.filter((r) => dueBadge(r, today)?.kind === 'overdue').length
    const blocked = list.filter((r) => r.status === 'blocked').length
    const alerts = [
      late ? t('org.alertOverdue', { count: late }) : null,
      blocked ? t('org.alertBlocked', { count: blocked }) : null,
    ].filter(Boolean).join(' · ')
    return (
      <button
        key={q}
        type="button"
        onClick={() => openLevel(q)}
        aria-label={`${title(q)} ${sub(q)} ${t('org.countItems', { count: list.length })}`}
        className={`flex min-h-[168px] flex-col items-start gap-1.5 rounded-card border p-3.5 text-left ${TONE[q].tile} ${FOCUS}`}
      >
        <span className="flex w-full items-center gap-1.5">
          <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[q].dot}`} />
          <span className={`text-lg font-bold ${TONE[q].text}`}>{title(q)}</span>
          <ChevronRight aria-hidden className="ml-auto h-3.5 w-3.5 text-ink-400" strokeWidth={1.5} />
        </span>
        <span className="text-xs text-ink-500">{sub(q)}</span>
        <span className={`mt-auto text-[40px] font-semibold leading-none tabular-nums ${TONE[q].text}`}>{list.length}</span>
        <span className={`text-xs ${alerts ? 'font-semibold text-danger-text' : 'text-ink-500'}`}>{alerts || t('org.noOverdue')}</span>
      </button>
    )
  }

  const mobileCard = (row: QuadrantRow) => (
    <li key={row.id}>
      <button
        type="button"
        onClick={() => setSelectedId(row.id)}
        className={`flex w-full flex-col gap-2 rounded-card border border-line bg-surface p-3.5 text-left shadow-card ${FOCUS}`}
      >
        <span className="w-full truncate text-xs text-ink-500">{row.businessName} › {row.taskName}</span>
        <span className={`text-md font-medium leading-snug ${row.status === 'done' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{row.name}</span>
        <span className="flex w-full items-center justify-between gap-2">
          <span className={`truncate text-xs ${row.ownerKey === 'none' ? 'font-semibold text-warning-text' : 'text-ink-700'}`}>{ownerLabel(row)}</span>
          {badges(row)}
        </span>
      </button>
    </li>
  )

  const mobileHome = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-500">{t('org.mobileSummary', { open: stats.open, overdue: stats.overdue, blocked: stats.blocked })}</p>
      <OwnerFilter options={ownerOptions(rows, today, 'open')} value={owner} onChange={setOwner} scroll />
      <div className="grid grid-cols-2 gap-2.5">
        <span className="text-center text-xs font-semibold text-ink-700">{t('org.axisUrgent')}</span>
        <span className="text-center text-xs font-semibold text-ink-500">{t('org.axisNotUrgent')}</span>
        {QUADRANTS.map(tile)}
      </div>
      <button
        type="button"
        onClick={() => openLevel('unrated')}
        className={`flex min-h-[56px] items-center gap-2.5 rounded-card border border-dashed border-line-strong bg-surface px-3.5 text-left ${FOCUS}`}
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-muted-dot" />
        <span className="flex flex-col">
          <span className="text-md font-semibold text-ink-900">{t('org.unratedTitle')}</span>
          <span className="text-xs text-ink-500">{t('org.unratedHint')}</span>
        </span>
        <span className="ml-auto text-xl font-semibold tabular-nums text-ink-700">{groups.unrated.length}</span>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => openLevel('done')}
        className={`flex min-h-[48px] items-center gap-2.5 rounded-card px-3.5 text-left ${FOCUS}`}
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-success-dot" />
        <span className="text-md text-ink-700">{t('org.doneTitle')}</span>
        <span className="ml-auto text-md font-semibold tabular-nums text-success-text">{groups.done.length}</span>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.5} />
      </button>
      <p className="text-xs leading-relaxed text-ink-500">{t('org.urgencyRule', { days: URGENT_WITHIN_DAYS })}</p>
    </div>
  )

  const mobileList = level && (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={backHome}
        className={`-ml-2 inline-flex h-11 items-center gap-0.5 self-start rounded-field px-2 text-md text-primary hover:bg-primary-soft ${FOCUS}`}
      >
        <ChevronLeft aria-hidden className="h-4 w-4" strokeWidth={1.5} />
        {t('org.viewQuadrant')}
      </button>
      <div className="flex items-center gap-2">
        <h2 className={`text-xl font-semibold ${level === 'unrated' ? 'text-ink-900' : level === 'done' ? 'text-success-text' : TONE[level].text}`}>
          {title(level)}
        </h2>
        {level !== 'unrated' && level !== 'done' && <span className="text-sm text-ink-500">{sub(level)}</span>}
        <span className="ml-auto rounded-btn bg-line-soft px-2.5 py-0.5 text-sm font-semibold tabular-nums text-ink-700">
          {t('org.countItems', { count: groups[level].length })}
        </span>
      </div>
      <OwnerFilter options={ownerOptions(rows, today, level)} value={owner} onChange={setOwner} scroll />
      {groups[level].length === 0
        ? <p className="py-10 text-center text-sm text-ink-500">{t('org.emptyQuadrant')}</p>
        : <ul className="flex flex-col gap-2.5">{groups[level].map(mobileCard)}</ul>}
    </div>
  )

  return (
    <div>
      {desktop}
      <div className="md:hidden">{level ? mobileList : mobileHome}</div>
      {selected && (
        <ItemDetailPanel
          row={selected}
          today={today}
          canEdit={snapshot.canEdit}
          positionName={positionName}
          onClose={closePanel}
          onUpdate={(fields) => onUpdateItem(selected.id, fields)}
          onPickOwner={() => onPickOwner(selected.id)}
        />
      )}
    </div>
  )
}
