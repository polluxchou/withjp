// src/lib/ui/status-tone.ts — 状态枚举→Tag tone 唯一登记处（docs/design-system.md §1.3）
//
// key 取自真实枚举定义，而非臆造：
//   creator   → CreatorStatus         (src/lib/types/index.ts)
//   task      → TaskStatus            (src/lib/types/index.ts)
//   expense   → ExpensePaymentStatus  (src/lib/types/index.ts) —— 五态完整
//               登记于 design-system.md §1.3「支出」行：已退款(refunded)
//               视为资金回流的提示性状态 → info；部分退款
//               (partially_refunded) 尚有未结部分 → warning。
//   milestone → MilestoneStatus       (src/lib/types/index.ts)
//   item      → ItemStatus            (src/lib/items/types.ts)
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet'
type Domain = 'creator' | 'task' | 'expense' | 'milestone' | 'item'

const MAP: Record<Domain, Record<string, Tone>> = {
  creator: {
    prospect: 'neutral', contacted: 'info', engaged: 'info', onboarded: 'violet',
    live_ready: 'warning', live: 'success', monetized: 'success', terminated: 'danger',
  },
  task: { pending: 'warning', running: 'info', done: 'success', failed: 'danger' },
  expense: {
    budgeted: 'info', ordered_unpaid: 'warning', paid: 'success',
    refunded: 'info', partially_refunded: 'warning',
  },
  milestone: { planned: 'neutral', active: 'info', at_risk: 'warning', completed: 'success', missed: 'danger' },
  item: { in_use: 'success', in_storage: 'neutral', under_repair: 'warning', disposed: 'danger' },
}

export function toneOf(domain: Domain, status: string): Tone {
  return MAP[domain]?.[status] ?? 'neutral'
}
