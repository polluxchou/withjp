// 财务预测看板的月度编辑:从 FinanceForecastDashboard.tsx 原样抽出,行为不变。
// 全部是纯函数,输入一年的月份数组(或按年分组的月份),返回新的数组,不改原值。
import type { ForecastAccountInput, ForecastMonthInput } from '@/lib/finance-forecast/calculations'
import type { LifecycleApplyTargetRow } from '@/lib/finance-forecast/lifecycle-apply'

export function patchMonth(
  months: ForecastMonthInput[],
  monthIndex: number,
  patch: Partial<ForecastMonthInput>,
): ForecastMonthInput[] {
  return months.map((month, index) => index === monthIndex ? { ...month, ...patch } : month)
}

export function patchRow(
  months: ForecastMonthInput[],
  monthIndex: number,
  rowIndex: number,
  patch: Partial<ForecastAccountInput>,
): ForecastMonthInput[] {
  return months.map((month, index) => {
    if (index !== monthIndex) return month
    return {
      ...month,
      rows: month.rows.map((row, idx) => idx === rowIndex ? { ...row, ...patch } : row),
    }
  })
}

// 给某月追加一行空白账号(类型「新号」、各项为 0)。newId 只对目标月调用。
export function appendBlankRow(
  months: ForecastMonthInput[],
  monthIndex: number,
  accountName: string,
  newId: (monthKey: string) => string,
): ForecastMonthInput[] {
  return months.map((month, i) => {
    if (i !== monthIndex) return month
    const id = newId(month.month)
    return {
      ...month,
      rows: [
        ...month.rows,
        {
          id,
          account_name:           accountName,
          account_type:           'newbie',
          live_days:              0,
          avg_daily_hours:        0,
          revenue_per_minute_usd: 0,
          share_ratio_pct:        0,
        },
      ],
    }
  })
}

export function deleteRowAt(months: ForecastMonthInput[], monthIndex: number, rowIndex: number): ForecastMonthInput[] {
  return months.map((month, index) =>
    index === monthIndex
      ? { ...month, rows: month.rows.filter((_, i) => i !== rowIndex) }
      : month
  )
}

// 清空本月:账号行与备注一起清掉(实际收入保留)。
export function clearMonthAt(months: ForecastMonthInput[], monthIndex: number): ForecastMonthInput[] {
  return months.map((month, index) =>
    index === monthIndex ? { ...month, rows: [], note: '' } : month
  )
}

// 用上个月的账号行覆盖本月;行 id 加本月前缀,避免跨月重复。调用方保证 monthIndex ≥ 1。
export function copyPreviousMonthInto(months: ForecastMonthInput[], monthIndex: number): ForecastMonthInput[] {
  const previous = months[monthIndex - 1]
  const current  = months[monthIndex]
  return months.map((month, i) => {
    if (i !== monthIndex) return month
    return {
      ...month,
      rows: previous.rows.map((row) => ({ ...row, id: `${current.month}-${row.id}` })),
    }
  })
}

// 把本月的账号行顺延到之后每个月(覆盖),行 id 加各月前缀。
export function applyMonthForward(months: ForecastMonthInput[], monthIndex: number): ForecastMonthInput[] {
  const source = months[monthIndex]
  return months.map((month, index) => {
    if (index <= monthIndex) return month
    return {
      ...month,
      rows: source.rows.map((row) => ({ ...row, id: `${month.month}-${row.id}` })),
    }
  })
}

// 把生命周期模板排出来的行(可能跨年)追加到对应年份、对应月份。
// 账号名去掉首尾空白,空名用 fallbackName。
export function mergeLifecycleRows(
  byYear: Record<number, ForecastMonthInput[]>,
  planned: LifecycleApplyTargetRow[],
  accountName: string,
  fallbackName: string,
): Record<number, ForecastMonthInput[]> {
  const rowsByYear = new Map<number, LifecycleApplyTargetRow[]>()
  for (const row of planned) {
    const list = rowsByYear.get(row.year) ?? []
    list.push(row)
    rowsByYear.set(row.year, list)
  }

  const next = { ...byYear }
  for (const [year, rows] of Array.from(rowsByYear.entries())) {
    const yearMonths = byYear[year] ?? []
    next[year] = yearMonths.map((month) => {
      const additions = rows.filter((r) => r.monthKey === month.month)
      if (additions.length === 0) return month
      return {
        ...month,
        rows: [
          ...month.rows,
          ...additions.map((r) => ({
            id:                     r.rowId,
            account_name:           accountName.trim() || fallbackName,
            account_type:           r.account_type,
            live_days:              r.live_days,
            avg_daily_hours:        r.avg_daily_hours,
            revenue_per_minute_usd: r.revenue_per_minute_usd,
            share_ratio_pct:        r.share_ratio_pct,
          })),
        ],
      }
    })
  }
  return next
}
