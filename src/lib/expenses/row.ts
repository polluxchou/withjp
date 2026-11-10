import type { Tables } from '../supabase/database.types.ts'
import type { Expense, ExpensePaymentStatus } from '../types/index.ts'

// expenses 表行 → Expense。以前各处直接 `data as Expense`；现在 supabase client 带了
// Database 泛型，读出来就是生成的行类型，只有两列需要在这里收窄（见 types 里 Expense 的注释）。

export const EXPENSE_PAYMENT_STATUSES: readonly ExpensePaymentStatus[] = [
  'budgeted', 'ordered_unpaid', 'paid', 'refunded', 'partially_refunded',
]

export function isExpensePaymentStatus(v: unknown): v is ExpensePaymentStatus {
  return typeof v === 'string' && (EXPENSE_PAYMENT_STATUSES as readonly string[]).includes(v)
}

/**
 * 库里的 check 约束保证 payment_status 只会是上面五个值；这里还对不上，说明约束
 * 改了而代码没跟上，宁可报错也不把未知状态当成某个已知状态显示。
 */
export function toExpense(row: Tables<'expenses'>): Expense {
  const { payment_status, total_price, ...rest } = row
  if (!isExpensePaymentStatus(payment_status)) {
    throw new Error(`expenses.payment_status 出现未知取值：${payment_status}（核对 expenses_payment_status_valid 约束）`)
  }
  return {
    ...rest,
    payment_status,
    total_price: total_price ?? row.unit_price * row.quantity,
  }
}
