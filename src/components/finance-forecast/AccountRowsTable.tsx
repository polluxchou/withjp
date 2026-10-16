'use client'

import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
import Tag from '@/components/ui/Tag'
import { Input, Select } from '@/components/ui/Field'
import { FOCUS_RING } from '@/lib/ui/recipes'
import {
  FORECAST_ACCOUNT_TYPES,
  type ForecastAccountInput,
  type ForecastAccountType,
  type ForecastRowResult,
} from '@/lib/finance-forecast/calculations'
import { revenueTier } from '@/lib/finance-forecast/dashboard'
import NumberInput from './NumberInput'
import { READONLY_INPUT, TH_LEFT, TH_RIGHT } from './dashboard-styles'
import { useAccountTypeLabels } from './useAccountTypeLabels'
import { useForecastFormatter } from './useForecastFormatter'

// 单月的账号输入表:每格都是可编辑控件,末列删除行。只读时控件变灰、不显示删除。
export default function AccountRowsTable({
  rows,
  isEmpty,
  canEdit,
  onUpdateRow,
  onDeleteRow,
}: {
  rows:        ForecastRowResult[]
  isEmpty:     boolean
  canEdit:     boolean
  onUpdateRow: (rowIndex: number, patch: Partial<ForecastAccountInput>) => void
  onDeleteRow: (rowIndex: number) => void
}) {
  const t = useTranslations('financeForecast')
  const fmtForecast = useForecastFormatter()
  const accountTypeLabels = useAccountTypeLabels()

  return (
    // 递延：未迁 Table 原语。blocker 不是样式而是交互契约——
    // 本表每格都是可编辑控件、且末列有行删除按钮，迁移本身可行；
    // 真正卡住的是 YearSummaryTable 的整行点击（<tr onClick>），
    // Tr 契约明确不提供 onClick（<tr> 无原生键盘可达性），要迁就
    // 得先把"点整行选月份"改造成行内 Link/button，属交互重设计而非
    // 换皮。两张表一起迁才不会出现"半边 Table 原语 + 半边手写"的混用（§6）。
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[1120px]">
        <thead>
          <tr className="border-y border-line bg-canvas">
            <th className={TH_LEFT}>{t('colAccount')}</th>
            <th className={TH_LEFT}>{t('colType')}</th>
            <th className={TH_LEFT}>{t('colLiveDays')}</th>
            <th className={TH_LEFT}>{t('colAvgHours')}</th>
            <th className={TH_LEFT}>{t('colRevPerMin')}</th>
            <th className={TH_LEFT}>{t('colShareRatio')}</th>
            <th className={TH_RIGHT}>{t('colMonthRevenue')}</th>
            <th className={TH_LEFT}>{t('colStatus')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-400">
                {t('emptyMonth')}
              </td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={row.id} className="border-b border-line-soft hover:bg-row-hover transition-colors">
              <td className="px-4 py-3">
                <Input
                  value={row.account_name}
                  onChange={(event) => onUpdateRow(index, { account_name: event.target.value })}
                  readOnly={!canEdit}
                  className={READONLY_INPUT}
                />
              </td>
              <td className="px-4 py-3">
                <Select
                  value={row.account_type}
                  onChange={(event) => onUpdateRow(index, { account_type: event.target.value as ForecastAccountType })}
                  disabled={!canEdit}
                >
                  {FORECAST_ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>{accountTypeLabels[type]}</option>
                  ))}
                </Select>
              </td>
              <td className="px-4 py-3">
                <NumberInput disabled={!canEdit} value={row.live_days} onChange={(live_days) => onUpdateRow(index, { live_days })} max={31} />
              </td>
              <td className="px-4 py-3">
                <NumberInput disabled={!canEdit} value={row.avg_daily_hours} onChange={(avg_daily_hours) => onUpdateRow(index, { avg_daily_hours })} step={0.5} max={24} />
              </td>
              <td className="px-4 py-3">
                <NumberInput disabled={!canEdit} value={row.revenue_per_minute_usd} onChange={(revenue_per_minute_usd) => onUpdateRow(index, { revenue_per_minute_usd })} step={0.01} max={10000} />
              </td>
              <td className="px-4 py-3">
                <NumberInput disabled={!canEdit} value={row.share_ratio_pct} onChange={(share_ratio_pct) => onUpdateRow(index, { share_ratio_pct })} step={0.1} max={100} />
              </td>
              <td className="px-4 py-3 text-right font-semibold text-ink-900 whitespace-nowrap tabular-nums bg-canvas border-l border-line-soft">{fmtForecast(row.monthly_revenue_usd)}</td>
              <td className="px-4 py-3">
                <StatusBadge revenue={row.monthly_revenue_usd} />
              </td>
              <td className="px-4 py-3 text-right">
                {canEdit && (<button
                  type="button"
                  aria-label={t('ariaDeleteRow')}
                  onClick={() => onDeleteRow(index)}
                  className={`inline-flex items-center rounded-field p-1 text-xs font-medium text-ink-400 hover:text-danger-text transition-colors ${FOCUS_RING}`}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 收入档 → tone 映射登记在 design-system §1.3 状态枚举表（财务预测账号收入档）。
function StatusBadge({ revenue }: { revenue: number }) {
  const t = useTranslations('financeForecast')
  const tier = revenueTier(revenue)
  if (tier === 'priority') return <Tag label={t('statusPriority')} tone="success" size="sm" />
  if (tier === 'stable') return <Tag label={t('statusStable')} tone="violet" size="sm" />
  return <Tag label={t('statusWatch')} tone="warning" size="sm" />
}
