'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { PILL_ACTIVE, PILL_BASE, PILL_IDLE } from './dashboard-styles'
import type { SaveStatus, ViewMode } from './types'

export default function ViewModeToolbar({
  viewMode,
  onChangeViewMode,
  years,
  anchorYear,
  selectedYear,
  onChangeYear,
  saveStatus,
  savingLabel,
  savedLabel,
  errorLabel,
  loading,
  leftSlot,
}: {
  viewMode:         ViewMode
  onChangeViewMode: (mode: ViewMode) => void
  years:            number[]
  anchorYear:       number
  selectedYear:     number
  onChangeYear:     (year: number) => void
  saveStatus:       SaveStatus
  savingLabel:      string
  savedLabel:       string
  errorLabel:       string
  loading?:         boolean
  leftSlot?:        ReactNode
}) {
  const t = useTranslations('financeForecast')
  const statusText = loading
    ? t('loadingView')
    : saveStatus === 'saving' ? savingLabel
    : saveStatus === 'saved'  ? savedLabel
    : saveStatus === 'error'  ? errorLabel
    : ''
  const statusClass = loading ? 'text-ink-500' : saveStatusClass(saveStatus)

  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        {leftSlot}
        <ViewScopeSelector
          viewMode={viewMode}
          onChangeViewMode={onChangeViewMode}
          years={years}
          anchorYear={anchorYear}
          selectedYear={selectedYear}
          onChangeYear={onChangeYear}
        />
      </div>

      <span className={`text-xs font-medium ${statusClass}`}>{statusText}</span>
    </div>
  )
}

function saveStatusClass(status: SaveStatus): string {
  if (status === 'saved') return 'text-success-text'
  if (status === 'error') return 'text-danger-text'
  if (status === 'saving') return 'text-ink-500'
  return 'text-transparent'
}

function ViewScopeSelector({
  viewMode,
  onChangeViewMode,
  years,
  anchorYear,
  selectedYear,
  onChangeYear,
}: {
  viewMode:         ViewMode
  onChangeViewMode: (mode: ViewMode) => void
  years:            number[]
  anchorYear:       number
  selectedYear:     number
  onChangeYear:     (year: number) => void
}) {
  const t = useTranslations('financeForecast')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pickAnnual() {
    onChangeViewMode('annual')
    setOpen(false)
  }
  function pickYear(year: number) {
    if (viewMode !== 'monthly') onChangeViewMode('monthly')
    onChangeYear(year)
    setOpen(false)
  }

  const triggerLabel = viewMode === 'annual'
    ? t('annualView')
    : `${selectedYear}${selectedYear === anchorYear ? t('currentYearSuffix') : ''}`

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${PILL_BASE} ${FOCUS_RING} ${open ? PILL_ACTIVE : PILL_IDLE}`}
      >
        <span className="text-micro font-medium uppercase tracking-wider opacity-80">{t('viewLabel')}</span>
        <span className="tabular-nums">{triggerLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          className="absolute top-full left-0 mt-2 min-w-[180px] bg-surface border border-line rounded-card shadow-pop z-40 p-1"
        >
          <ScopeOption
            label={t('annualView')}
            sub={t('annualSub')}
            active={viewMode === 'annual'}
            onClick={pickAnnual}
          />
          <div className="my-1 border-t border-line-soft" />
          {years.map((year) => (
            <ScopeOption
              key={year}
              label={`${year}${year === anchorYear ? t('currentYearSuffix') : ''}`}
              sub={t('monthlySub')}
              active={viewMode === 'monthly' && year === selectedYear}
              onClick={() => pickYear(year)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ScopeOption({
  label,
  sub,
  active,
  onClick,
}: {
  label:   string
  sub:     string
  active:  boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      // ring-inset：选项在 p-1 的窄弹层里，外扩 offset 环会被面板边缘裁掉（§4 第二配方 ③）
      className={`w-full text-left px-3 py-2 rounded-field text-xs font-semibold transition-colors flex items-center justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
        active
          ? 'bg-primary-soft text-primary'
          : 'text-ink-700 hover:bg-line-soft'
      }`}
    >
      <span className="tabular-nums">{label}</span>
      <span className={`text-micro font-normal ${active ? 'text-primary' : 'text-ink-400'}`}>{sub}</span>
    </button>
  )
}
