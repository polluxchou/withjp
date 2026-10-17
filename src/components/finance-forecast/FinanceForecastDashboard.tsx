'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Lock } from 'lucide-react'
import {
  calculateForecastRows,
  summarizeForecast,
  type ForecastAccountInput,
  type ForecastMonthInput,
  type ForecastSummary,
} from '@/lib/finance-forecast/calculations'
import type { ForecastView } from '@/lib/finance-forecast/views'
import type { LifecycleStartingStage, LifecycleTemplateSet } from '@/lib/finance-forecast/lifecycle-template'
import { planLifecycleApplication } from '@/lib/finance-forecast/lifecycle-apply'
import {
  aggregateYears,
  buildCumulativeData,
  buildMultiYearChartData,
  findBreakevenIndex,
  monthLabelOf,
  type ChartMode,
} from '@/lib/finance-forecast/dashboard'
import {
  appendBlankRow,
  applyMonthForward,
  clearMonthAt,
  copyPreviousMonthInto,
  deleteRowAt,
  mergeLifecycleRows,
  patchMonth,
  patchRow,
} from '@/lib/finance-forecast/month-edits'
import ForecastViewBar from '@/components/finance-forecast/ForecastViewBar'
import LifecycleTemplateEditor from '@/components/finance-forecast/LifecycleTemplateEditor'
import AccountTypeContribution from './AccountTypeContribution'
import AddFromTemplateModal from './AddFromTemplateModal'
import AnnualOverview from './AnnualOverview'
import CostPlanningLinks from './CostPlanningLinks'
import ForecastChartCard from './ForecastChartCard'
import ForecastInputPanel from './ForecastInputPanel'
import ForecastKpiGrid from './ForecastKpiGrid'
import ViewModeToolbar from './ViewModeToolbar'
import type { ViewMode } from './types'
import { useForecastData } from './useForecastData'
import { useForecastViewActions } from './useForecastViewActions'

interface Props {
  views:                 ForecastView[]
  defaultViewId:         string | null
  monthsByYear:          Record<number, ForecastMonthInput[]>
  years:                 number[]
  anchorYear:            number
  initialSelectedMonth?: number
  currentUserId:         string
  isAdmin:               boolean
}

const randomSuffix = () => Math.random().toString(36).slice(2, 7)

export default function FinanceForecastDashboard({
  views: initialViews,
  defaultViewId,
  monthsByYear: initialByYear,
  years,
  anchorYear,
  initialSelectedMonth = 0,
  currentUserId,
  isAdmin,
}: Props) {
  const t = useTranslations('financeForecast')
  const [views, setViews] = useState<ForecastView[]>(initialViews)
  const [activeViewId, setActiveViewId] = useState<string | null>(defaultViewId)
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [selectedYear, setSelectedYear] = useState<number>(anchorYear)
  const [selectedMonth, setSelectedMonth] = useState<number>(initialSelectedMonth)
  const [showYearView, setShowYearView] = useState(true)
  const [chartMode, setChartMode] = useState<ChartMode>('breakdown')
  const [inputOpen, setInputOpen] = useState(true)

  const [lifecycleEditorOpen, setLifecycleEditorOpen] = useState(false)
  const [addFromTemplateOpen, setAddFromTemplateOpen] = useState(false)
  const [lifecycleSet, setLifecycleSet] = useState<LifecycleTemplateSet | null>(null)

  const activeView = views.find((v) => v.id === activeViewId) ?? null
  const canEditActive = activeView ? (isAdmin || activeView.owner_id === currentUserId) : false
  // 支出管理仅管理员可访问：非管理员的预算卡片不挂「去支出管理」链接，免得点进去是一张无权限说明。
  const expensesHref = isAdmin ? '/expenses' : undefined

  const { byYear, setByYear, setMonthsForYear, persistImmediate, fetchViewForecast, saveStatus, loadingView } =
    useForecastData({ initialByYear, years, defaultViewId, activeViewId, canEditActive })

  const { viewBarBusy, handleSelectView, handleCreateView, handleUpdateView, handleDeleteView } =
    useForecastViewActions({
      setViews,
      activeViewId,
      setActiveViewId,
      currentUserId,
      years,
      fetchViewForecast,
      setByYear,
      onOpenView: () => {
        setSelectedYear(anchorYear)
        setSelectedMonth(initialSelectedMonth)
        setShowYearView(false)
      },
    })

  // Memoised so the `?? []` fallback doesn't hand a fresh array to the
  // `summary` memo below on every render.
  const months = useMemo(() => byYear[selectedYear] ?? [], [byYear, selectedYear])
  const summary = useMemo(() => summarizeForecast(months), [months])
  const safeSelectedMonth = Math.min(Math.max(0, selectedMonth), Math.max(0, summary.months.length - 1))
  const selected = summary.months[safeSelectedMonth]
  const selectedRaw = months[safeSelectedMonth]

  const summaryByYear = useMemo(() => {
    const out: Record<number, ForecastSummary> = {}
    for (const y of years) out[y] = summarizeForecast(byYear[y] ?? [])
    return out
  }, [byYear, years])

  const aggregate = useMemo(() => aggregateYears(years, summaryByYear), [summaryByYear, years])
  const multiYearChartData = useMemo(() => buildMultiYearChartData(years, summaryByYear), [years, summaryByYear])

  const calculatedRows = useMemo(
    () => (selectedRaw ? calculateForecastRows(selectedRaw.rows) : []),
    [selectedRaw],
  )

  const cumulativeData = useMemo(() => buildCumulativeData(summary.months), [summary.months])
  const breakevenIndex = findBreakevenIndex(cumulativeData)
  const breakevenMonth = breakevenIndex >= 0 ? summary.months[breakevenIndex].month : null

  const monthCumProfit      = cumulativeData[safeSelectedMonth]?.cum_profit ?? 0
  const monthsUntilBreakeven = breakevenIndex < 0 ? null : breakevenIndex - safeSelectedMonth

  function updateSelectedMonth(patch: Partial<ForecastMonthInput>) {
    setMonthsForYear(selectedYear, (prev) => patchMonth(prev, safeSelectedMonth, patch))
  }

  function updateRow(rowIndex: number, patch: Partial<ForecastAccountInput>) {
    setMonthsForYear(selectedYear, (prev) => patchRow(prev, safeSelectedMonth, rowIndex, patch))
  }

  function addRow() {
    setMonthsForYear(selectedYear, (prev) => appendBlankRow(
      prev,
      safeSelectedMonth,
      t('newAccountName'),
      (monthKey) => `${monthKey}-${Date.now()}-${randomSuffix()}`,
    ))
  }

  function deleteRow(rowIndex: number) {
    persistImmediate(selectedYear, deleteRowAt(byYear[selectedYear] ?? [], safeSelectedMonth, rowIndex))
  }

  function clearMonth() {
    persistImmediate(selectedYear, clearMonthAt(byYear[selectedYear] ?? [], safeSelectedMonth))
  }

  function copyPreviousMonth() {
    if (safeSelectedMonth === 0) return
    setMonthsForYear(selectedYear, (prev) => copyPreviousMonthInto(prev, safeSelectedMonth))
  }

  function applyForward() {
    setMonthsForYear(selectedYear, (prev) => applyMonthForward(prev, safeSelectedMonth))
  }

  async function ensureLifecycleSet(): Promise<LifecycleTemplateSet | null> {
    if (lifecycleSet) return lifecycleSet
    try {
      const res = await fetch('/api/finance-forecast/lifecycle')
      const body = await res.json() as { data: LifecycleTemplateSet | null; error: string | null }
      if (!res.ok || !body.data) return null
      setLifecycleSet(body.data)
      return body.data
    } catch {
      return null
    }
  }

  function applyLifecycleTemplate(stage: LifecycleStartingStage, accountName: string) {
    if (!activeViewId || !canEditActive) return
    const set = lifecycleSet
    if (!set) return
    const template = set[stage]
    const planned = planLifecycleApplication({
      template,
      startYear:       selectedYear,
      startMonthIndex: safeSelectedMonth,
      horizonYears:    years,
      accountName,
      idSeed:          `${Date.now()}-${randomSuffix()}`,
    })
    if (planned.length === 0) return

    setByYear((prev) => mergeLifecycleRows(prev, planned, accountName, t('newAccountName')))

    const first = planned[0]
    if (first) {
      setSelectedYear(first.year)
      setSelectedMonth(first.monthIndex)
    }
  }

  const monthLabels = t.raw('months') as string[]
  const selectedMonthLabel = selected ? monthLabelOf(selected.month, monthLabels) : ''

  function drillIntoYear(year: number) {
    setSelectedYear(year)
    setSelectedMonth(year === anchorYear ? initialSelectedMonth : 0)
    setShowYearView(false)
    setViewMode('monthly')
  }

  function selectMonth(index: number) {
    setShowYearView(false)
    setSelectedMonth(index)
  }

  const viewMenu = (
    <ForecastViewBar
      views={views}
      activeViewId={activeViewId}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      busy={viewBarBusy || loadingView}
      onSelect={handleSelectView}
      onCreate={handleCreateView}
      onUpdate={handleUpdateView}
      onDelete={handleDeleteView}
      onOpenLifecycle={() => setLifecycleEditorOpen(true)}
    />
  )

  return (
    <>
      {!activeView ? (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {viewMenu}
            <span className="text-sm text-ink-400">{t('noViewHint')}</span>
          </div>
          <div className="bg-surface border border-dashed border-line-strong rounded-card p-10 text-center">
            <p className="text-sm text-ink-500 mb-2">{t('noViewEmpty')}</p>
            <p className="text-xs text-ink-400">{t('noViewGuide')}</p>
          </div>
        </>
      ) : (<>

      {!canEditActive && (
        <div className="mb-4 px-4 py-2.5 rounded-field bg-warning-soft border border-warning-border text-xs text-warning-text flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t('readOnlyBanner', {
            owner: activeView.owner_id === null ? t('readOnlySystem') : activeView.owner_name ?? t('readOnlyOther'),
          })}
        </div>
      )}

      <ViewModeToolbar
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        years={years}
        anchorYear={anchorYear}
        selectedYear={selectedYear}
        onChangeYear={(year) => {
          setSelectedYear(year)
          setSelectedMonth(year === anchorYear ? initialSelectedMonth : 0)
          setShowYearView(false)
        }}
        saveStatus={saveStatus}
        savingLabel={t('statusSaving')}
        savedLabel={t('statusSaved')}
        errorLabel={t('statusError')}
        loading={loadingView}
        leftSlot={viewMenu}
      />

      {viewMode === 'annual' ? (
        <AnnualOverview
          years={years}
          anchorYear={anchorYear}
          byYear={byYear}
          summaryByYear={summaryByYear}
          aggregate={aggregate}
          chartData={multiYearChartData}
          onDrillDown={drillIntoYear}
          monthLabels={monthLabels}
          expensesHref={expensesHref}
        />
      ) : (
        <>
          <ForecastKpiGrid
            showYearView={showYearView}
            selectedYear={selectedYear}
            summary={summary}
            selected={selected}
            inputOpen={inputOpen}
            onToggleInput={() => setInputOpen((o) => !o)}
            expensesHref={expensesHref}
            monthLabels={monthLabels}
            breakevenMonth={breakevenMonth}
            monthCumProfit={monthCumProfit}
            monthsUntilBreakeven={monthsUntilBreakeven}
          />

          <CostPlanningLinks />

          <ForecastInputPanel
            inputOpen={inputOpen}
            onToggleInput={() => setInputOpen((o) => !o)}
            canEdit={canEditActive}
            selectedYear={selectedYear}
            selected={selected}
            selectedMonthLabel={selectedMonthLabel}
            showYearView={showYearView}
            onToggleYearView={() => setShowYearView((v) => !v)}
            months={months}
            safeSelectedMonth={safeSelectedMonth}
            monthLabels={monthLabels}
            onSelectMonth={selectMonth}
            onCopyPreviousMonth={copyPreviousMonth}
            onApplyForward={applyForward}
            onClearMonth={clearMonth}
            selectedRaw={selectedRaw}
            onUpdateSelectedMonth={updateSelectedMonth}
            summaryMonths={summary.months}
            calculatedRows={calculatedRows}
            onUpdateRow={updateRow}
            onDeleteRow={deleteRow}
            onAddTemplate={async () => {
              await ensureLifecycleSet()
              setAddFromTemplateOpen(true)
            }}
            onAddBlank={addRow}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <ForecastChartCard
              selectedYear={selectedYear}
              months={summary.months}
              chartMode={chartMode}
              onChartModeChange={setChartMode}
              cumulativeData={cumulativeData}
              breakevenIndex={breakevenIndex}
            />

            <AccountTypeContribution
              selectedYear={selectedYear}
              byAccountType={summary.by_account_type}
              selected={selected}
            />
          </div>
        </>
      )}
      </>)}

      <LifecycleTemplateEditor
        open={lifecycleEditorOpen}
        onClose={() => setLifecycleEditorOpen(false)}
        onSaved={(set) => setLifecycleSet(set)}
      />

      {addFromTemplateOpen && (
        <AddFromTemplateModal
          lifecycleSet={lifecycleSet}
          startLabel={selected?.month ?? `${selectedYear}-${String(safeSelectedMonth + 1).padStart(2, '0')}`}
          horizonYears={years}
          onOpenEditor={() => {
            setAddFromTemplateOpen(false)
            setLifecycleEditorOpen(true)
          }}
          onCancel={() => setAddFromTemplateOpen(false)}
          onConfirm={(stage, name) => {
            applyLifecycleTemplate(stage, name)
            setAddFromTemplateOpen(false)
          }}
        />
      )}
    </>
  )
}
