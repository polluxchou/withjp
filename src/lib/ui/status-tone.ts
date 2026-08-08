// src/lib/ui/status-tone.ts — 状态枚举→Tag tone 唯一登记处（docs/design-system.md §1.3）
//
// MAP 按域声明为 Record<真实枚举, Tone>（type-only import，
// --experimental-strip-types 下无运行时代价），因此枚举改名/新增值会在
// 这里直接编译报错，逼迫同步更新映射，而不是静默漏登记。
//   creator   → CreatorStatus         (src/lib/types/index.ts)
//   task      → TaskStatus            (src/lib/types/index.ts)
//   work_task → WorkTaskStatus        (src/lib/types/index.ts)
//   expense   → ExpensePaymentStatus  (src/lib/types/index.ts) —— 五态完整
//               登记于 design-system.md §1.3「支出」行：已退款(refunded)
//               视为资金回流的提示性状态 → info；部分退款
//               (partially_refunded) 尚有未结部分 → warning。
//   milestone → MilestoneStatus       (src/lib/types/index.ts)
//   item      → ItemStatus            (src/lib/items/types.ts)
import type {
  CreatorStatus,
  TaskStatus,
  WorkTaskStatus,
  ExpensePaymentStatus,
  MilestoneStatus,
} from '@/lib/types'
import type { ItemStatus } from '@/lib/items/types'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet'
export type Domain = 'creator' | 'task' | 'work_task' | 'expense' | 'milestone' | 'item'

interface ToneMap {
  creator: Record<CreatorStatus, Tone>
  task: Record<TaskStatus, Tone>
  work_task: Record<WorkTaskStatus, Tone>
  expense: Record<ExpensePaymentStatus, Tone>
  milestone: Record<MilestoneStatus, Tone>
  item: Record<ItemStatus, Tone>
}

const MAP: ToneMap = {
  creator: {
    prospect: 'neutral', contacted: 'info', engaged: 'info', onboarded: 'violet',
    live_ready: 'warning', live: 'success', monetized: 'success', terminated: 'danger',
  },
  task: { pending: 'warning', running: 'info', done: 'success', failed: 'danger' },
  work_task: { planned: 'neutral', doing: 'info', done: 'success', cancelled: 'neutral' },
  expense: {
    budgeted: 'info', ordered_unpaid: 'warning', paid: 'success',
    refunded: 'info', partially_refunded: 'warning',
  },
  milestone: { planned: 'neutral', active: 'info', at_risk: 'warning', completed: 'success', missed: 'danger' },
  item: { in_use: 'success', in_storage: 'neutral', under_repair: 'warning', disposed: 'danger' },
}

// 调用侧保持宽松 string：外部数据（DB 行、URL 参数等）在编译期未必能收窄到
// 具体枚举字面量。用 Object.hasOwn 而非 `in` / 直接索引，避免
// 'toString' / '__proto__' 等原型链上的键被当成"已登记"而误判。
export function toneOf(domain: Domain, status: string): Tone {
  // domain 轴同理会遇到原型链键（如 '__proto__' / 'toString'）：调用侧传入
  // 的 domain 在运行时可能比类型更宽（外部数据、`as Domain` 强转等），
  // 用 Object.hasOwn 而非 `in`/直接索引先判是否为 MAP 自身可枚举键，
  // 避免把原型链上的方法名误判为"已登记域"。此 cast 是刻意为之，勿删。
  const domainMap = Object.hasOwn(MAP, domain) ? (MAP[domain] as Record<string, Tone>) : undefined
  return domainMap && Object.hasOwn(domainMap, status) ? domainMap[status] : 'neutral'
}
