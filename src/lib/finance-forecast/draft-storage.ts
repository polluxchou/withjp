// 财务预测的本机草稿(localStorage):每个视角 × 年份一份。
// 从 FinanceForecastDashboard.tsx 原样抽出,行为不变。
import type { ForecastDraft, ForecastMonthInput } from '@/lib/finance-forecast/calculations'

const STORAGE_KEY_PREFIX = 'finance-forecast:draft'

export function buildStorageKey(viewId: string, year: number | string): string {
  return `${STORAGE_KEY_PREFIX}:${viewId}:${year}`
}

// 草稿只存可编辑字段;预算是从支出管理同步来的,不进草稿。
export function serializeDraft(months: ForecastMonthInput[]): ForecastDraft {
  return {
    version: 1,
    months: months.map((month) => ({
      month:              month.month,
      rows:               month.rows,
      actual_revenue_usd: month.actual_revenue_usd,
      note:               month.note,
    })),
  }
}

export function readDraft(storageKey: string): ForecastDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) as ForecastDraft : null
  } catch {
    return null
  }
}

export function writeDraft(storageKey: string, months: ForecastMonthInput[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey, JSON.stringify(serializeDraft(months)))
}

// 服务端数据里是否已有人工输入(账号行/实际收入/备注任一)。有就不拿草稿覆盖。
export function hasForecastInputs(months: ForecastMonthInput[]): boolean {
  return months.some((month) =>
    month.rows.length > 0 ||
    month.actual_revenue_usd > 0 ||
    Boolean(month.note?.trim())
  )
}
