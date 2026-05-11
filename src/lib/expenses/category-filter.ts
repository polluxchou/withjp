import type { ExpenseCategory } from '@/lib/types'

export function nextExpenseCategoryFilter(current: string, selected: ExpenseCategory): ExpenseCategory | '' {
  return current === selected ? '' : selected
}
