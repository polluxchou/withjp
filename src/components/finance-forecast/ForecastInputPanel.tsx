'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown, Copy, RotateCcw } from 'lucide-react'
import { Field, Input } from '@/components/ui/Field'
import { FOCUS_RING } from '@/lib/ui/recipes'
import type {
  ForecastAccountInput,
  ForecastMonthInput,
  ForecastMonthResult,
  ForecastRowResult,
} from '@/lib/finance-forecast/calculations'
import { monthLabelOf } from '@/lib/finance-forecast/dashboard'
import AccountRowsTable from './AccountRowsTable'
import AddAccountMenu from './AddAccountMenu'
import NumberInput from './NumberInput'
import YearSummaryTable from './YearSummaryTable'
import { PILL_ACTIVE, PILL_BASE, PILL_IDLE, READONLY_INPUT, TOOL_BTN } from './dashboard-styles'
import { useForecastFormatter } from './useForecastFormatter'

// 收入录入面板:月份药丸 + 「全年」切换、行级动作、单月字段、账号输入表(或全年明细)。
export default function ForecastInputPanel({
  inputOpen,
  onToggleInput,
  canEdit,
  selectedYear,
  selected,
  selectedMonthLabel,
  showYearView,
  onToggleYearView,
  months,
  safeSelectedMonth,
  monthLabels,
  onSelectMonth,
  onCopyPreviousMonth,
  onApplyForward,
  onClearMonth,
  selectedRaw,
  onUpdateSelectedMonth,
  summaryMonths,
  calculatedRows,
  onUpdateRow,
  onDeleteRow,
  onAddTemplate,
  onAddBlank,
}: {
  inputOpen:             boolean
  onToggleInput:         () => void
  canEdit:               boolean
  selectedYear:          number
  selected:              ForecastMonthResult | undefined
  selectedMonthLabel:    string
  showYearView:          boolean
  onToggleYearView:      () => void
  months:                ForecastMonthInput[]
  safeSelectedMonth:     number
  monthLabels:           string[]
  onSelectMonth:         (index: number) => void
  onCopyPreviousMonth:   () => void
  onApplyForward:        () => void
  onClearMonth:          () => void
  selectedRaw:           ForecastMonthInput | undefined
  onUpdateSelectedMonth: (patch: Partial<ForecastMonthInput>) => void
  summaryMonths:         ForecastMonthResult[]
  calculatedRows:        ForecastRowResult[]
  onUpdateRow:           (rowIndex: number, patch: Partial<ForecastAccountInput>) => void
  onDeleteRow:           (rowIndex: number) => void
  onAddTemplate:         () => void
  onAddBlank:            () => void
}) {
  const t = useTranslations('financeForecast')
  const fmtForecast = useForecastFormatter()

  return (
    <section className="bg-surface border border-line rounded-card shadow-card overflow-hidden mb-4">
      <div className={`flex items-center justify-between gap-4 px-5 py-3.5 ${inputOpen ? 'border-b border-line-soft' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          {/* 刻意不套 §2 区块标题配方（lg/600/tracking-section）：这行不是
              普通卡头，而是整个编辑面板的"当前年·当前月"定位锚——年份与
              月份是用户在月份药丸行上反复切换的对象，需要比同屏其它卡头
              更强的展示层级，故用 xl/700/tracking-title（§2 二级页头档）
              并把月份染主色。同屏兄弟卡头（图表卡/贡献卡/年度图表卡）保持
              lg/600/tracking-section 不变。 */}
          <h2 className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-xl font-bold text-ink-900 tabular-nums tracking-title">
              {selected?.month.slice(0, 4) ?? selectedYear}
            </span>
            {!showYearView && (
              <>
                <span aria-hidden className="text-xl font-bold text-ink-400">·</span>
                <span className="text-xl font-bold text-primary tabular-nums tracking-title">
                  {selectedMonthLabel}
                </span>
              </>
            )}
            <span className="text-sm font-medium text-ink-500 ml-1.5">{t('revenueTitle')}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {inputOpen && canEdit && (
            <AddAccountMenu
              onAddTemplate={onAddTemplate}
              onAddBlank={onAddBlank}
            />
          )}
          <button
            type="button"
            onClick={onToggleInput}
            aria-label={inputOpen ? t('ariaCollapse') : t('ariaExpand')}
            className={`p-1.5 rounded-field text-ink-400 hover:text-ink-700 hover:bg-line-soft transition-colors ${FOCUS_RING}`}
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${inputOpen ? '' : '-rotate-90'}`} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {inputOpen && (
        <>
          <div className="px-5 pt-4">
            <div className="flex items-center gap-3 flex-wrap mb-4 justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1 flex-wrap">
                  {months.map((month, index) => {
                    const label = monthLabelOf(month.month, monthLabels)
                    const active = !showYearView && index === safeSelectedMonth
                    return (
                      <button
                        key={month.month}
                        type="button"
                        onClick={() => onSelectMonth(index)}
                        className={`min-w-[2.25rem] px-2.5 py-1.5 ${PILL_BASE} ${FOCUS_RING} ${active ? PILL_ACTIVE : PILL_IDLE}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={onToggleYearView}
                  className={`px-3 py-1.5 ${PILL_BASE} ${FOCUS_RING} ${showYearView ? PILL_ACTIVE : PILL_IDLE}`}
                >
                  {t('allYear')}
                </button>
              </div>

              {!showYearView && canEdit && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onCopyPreviousMonth}
                    disabled={safeSelectedMonth === 0}
                    className={`${TOOL_BTN} ${FOCUS_RING} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Copy className="w-3 h-3" strokeWidth={1.5} /> {t('copyPrevMonth')}
                  </button>
                  <button
                    type="button"
                    onClick={onApplyForward}
                    className={`${TOOL_BTN} ${FOCUS_RING}`}
                  >
                    <Copy className="w-3 h-3" strokeWidth={1.5} /> {t('applyForward')}
                  </button>
                  <button
                    type="button"
                    onClick={onClearMonth}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-field border border-line-strong bg-surface text-xs font-medium text-ink-500 hover:border-danger-border hover:text-danger-text transition-colors ${FOCUS_RING}`}
                  >
                    <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> {t('clearMonth')}
                  </button>
                </div>
              )}
            </div>

            {!showYearView && selectedRaw && <div className="grid gap-3 md:grid-cols-3 mb-4">
              <Field label={t('actualRevenueLabel')}>
                <NumberInput
                  value={selectedRaw.actual_revenue_usd}
                  onChange={(actual_revenue_usd) => onUpdateSelectedMonth({ actual_revenue_usd })}
                  step={1000}
                  disabled={!canEdit}
                />
              </Field>
              <Field label={t('budgetSyncLabel')} hint={t('budgetSyncNote')}>
                <Input value={fmtForecast(selectedRaw.budget_cost_usd)} readOnly className={READONLY_INPUT} />
              </Field>
              <Field label={t('noteLabel')}>
                <Input
                  value={selectedRaw.note ?? ''}
                  onChange={(event) => onUpdateSelectedMonth({ note: event.target.value })}
                  readOnly={!canEdit}
                  className={READONLY_INPUT}
                />
              </Field>
            </div>}
          </div>

          {showYearView ? (
            <YearSummaryTable months={summaryMonths} onSelectMonth={onSelectMonth} monthLabels={monthLabels} />
          ) : (
            <>
              <AccountRowsTable
                rows={calculatedRows}
                isEmpty={!selectedRaw || selectedRaw.rows.length === 0}
                canEdit={canEdit}
                onUpdateRow={onUpdateRow}
                onDeleteRow={onDeleteRow}
              />

              <div className="m-5 rounded-card border border-dashed border-primary-border bg-primary-soft px-4 py-3 text-sm text-primary-hover">
                {t('formula')}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
