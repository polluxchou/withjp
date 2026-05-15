import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_STATUS_LABELS,
} from '@/lib/expenses/costs'
import type { Expense } from '@/lib/types'
import type {
  ExpenseCreateIntent,
  ExpenseDeleteIntent,
  ExpenseFilters,
  ExpenseQueryIntent,
  ExpenseUpdateIntent,
  ExpenseWritePayload,
  WorkTaskCreateIntent,
} from './schema'

// ── Human-readable previews ───────────────────────────────────

export function previewCreate(intent: ExpenseCreateIntent): string {
  const p = intent.payload
  const lines: string[] = ['【新增支出】', ...renderPayload(p)]
  if (intent.ambiguities?.length) {
    lines.push('', '⚠ 不确定项：', ...intent.ambiguities.map(s => `  · ${s}`))
  }
  return lines.join('\n')
}

export function previewUpdate(intent: ExpenseUpdateIntent, target: Expense): string {
  const diff = diffPayload(target, intent.patch)
  const lines: string[] = [
    '【更新支出】',
    `命中：${target.item_name}（${target.expense_date}，¥${target.total_price}）`,
    '',
    '变更：',
    ...diff,
  ]
  if (intent.ambiguities?.length) {
    lines.push('', '⚠ 不确定项：', ...intent.ambiguities.map(s => `  · ${s}`))
  }
  return lines.join('\n')
}

export function previewDelete(intent: ExpenseDeleteIntent, target: Expense): string {
  const lines: string[] = [
    '【删除支出】',
    `将删除：${target.item_name}`,
    `  类别：${EXPENSE_CATEGORY_LABELS[target.expense_category]}`,
    `  日期：${target.expense_date}`,
    `  金额：¥${target.total_price}`,
    target.user_name ? `  使用人：${target.user_name}` : '',
    target.buyer_name ? `  经办人：${target.buyer_name}` : '',
    '',
    '此操作不可撤销。',
  ].filter(Boolean)
  if (intent.ambiguities?.length) {
    lines.push('', '⚠ 不确定项：', ...intent.ambiguities.map(s => `  · ${s}`))
  }
  return lines.join('\n')
}

export function previewQuery(intent: ExpenseQueryIntent): string {
  return intent.breadcrumbs || describeFilters(intent.filters)
}

// ── Internals ─────────────────────────────────────────────────

function renderPayload(p: ExpenseWritePayload): string[] {
  const out: string[] = []
  if (p.expense_category) out.push(`  类别：${EXPENSE_CATEGORY_LABELS[p.expense_category]}`)
  if (p.item_name)        out.push(`  名称：${p.item_name}`)
  if (p.unit_price !== undefined || p.quantity !== undefined) {
    const u = p.unit_price ?? 0
    const q = p.quantity   ?? 1
    out.push(`  单价 × 数量：¥${u} × ${q} = ¥${(Number(u) * Number(q)).toFixed(2)}`)
  }
  if (p.expense_date)     out.push(`  日期：${p.expense_date}`)
  if (p.period)           out.push(`  归属周期：${p.period}`)
  if (p.user_name)        out.push(`  使用人：${p.user_name}`)
  if (p.buyer_name)       out.push(`  经办人：${p.buyer_name}`)
  if (p.payment_method)   out.push(`  支付方式：${EXPENSE_PAYMENT_METHOD_LABELS[p.payment_method]}`)
  if (p.payment_status)   out.push(`  状态：${EXPENSE_PAYMENT_STATUS_LABELS[p.payment_status]}`)
  if (p.location)         out.push(`  地点：${p.location}`)
  if (p.purpose)          out.push(`  用途：${p.purpose}`)
  if (p.notes)            out.push(`  备注：${p.notes}`)
  return out
}

function diffPayload(before: Expense, patch: ExpenseWritePayload): string[] {
  const lines: string[] = []
  const push = (label: string, oldVal: unknown, newVal: unknown) => {
    lines.push(`  ${label}：${fmt(oldVal)} → ${fmt(newVal)}`)
  }

  if (patch.expense_category && patch.expense_category !== before.expense_category) {
    push('类别',
      EXPENSE_CATEGORY_LABELS[before.expense_category],
      EXPENSE_CATEGORY_LABELS[patch.expense_category])
  }
  if (patch.item_name    && patch.item_name    !== before.item_name)    push('名称',    before.item_name,    patch.item_name)
  if (patch.unit_price   !== undefined && patch.unit_price   !== Number(before.unit_price))   push('单价',    before.unit_price,   patch.unit_price)
  if (patch.quantity     !== undefined && patch.quantity     !== before.quantity)             push('数量',    before.quantity,     patch.quantity)
  if (patch.expense_date && patch.expense_date !== before.expense_date) push('日期',    before.expense_date, patch.expense_date)
  if ('period' in patch  && patch.period       !== before.period)       push('归属周期', before.period ?? '—', patch.period ?? '—')
  if (patch.user_name    !== undefined && patch.user_name    !== before.user_name)            push('使用人',  before.user_name,    patch.user_name)
  if (patch.buyer_name   !== undefined && patch.buyer_name   !== before.buyer_name)           push('经办人',  before.buyer_name,   patch.buyer_name)
  if ('payment_method' in patch && patch.payment_method !== before.payment_method) {
    push('支付方式',
      before.payment_method ? EXPENSE_PAYMENT_METHOD_LABELS[before.payment_method] : '—',
      patch.payment_method  ? EXPENSE_PAYMENT_METHOD_LABELS[patch.payment_method]  : '—')
  }
  if (patch.payment_status && patch.payment_status !== before.payment_status) {
    push('状态',
      EXPENSE_PAYMENT_STATUS_LABELS[before.payment_status],
      EXPENSE_PAYMENT_STATUS_LABELS[patch.payment_status])
  }
  if (patch.location !== undefined && patch.location !== before.location) push('地点', before.location, patch.location)
  if (patch.purpose  !== undefined && patch.purpose  !== before.purpose)  push('用途', before.purpose,  patch.purpose)
  if ('notes' in patch && patch.notes !== before.notes)                   push('备注', before.notes ?? '—', patch.notes ?? '—')

  return lines.length ? lines : ['  （无字段变更）']
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

// ── Work task previews ────────────────────────────────────────

export function previewWorkTaskCreate(intent: WorkTaskCreateIntent): string {
  const p = intent.payload
  const DEPT_LABELS: Record<string, string> = {
    bd: 'BD', ops: '运营', finance: '财务', content: '内容', growth: '增长', legal: '法务',
  }
  const INTERVAL_LABELS: Record<string, string> = {
    daily: '每日', weekly: '每周', biweekly: '每两周', monthly: '每月',
  }
  const lines: string[] = ['【新建任务】']
  lines.push(`  标题：${p.title}`)
  if (p.task_type)           lines.push(`  类型：${p.task_type === 'fixed' ? '固定（周期）' : '临时'}`)
  if (p.department)          lines.push(`  部门：${DEPT_LABELS[p.department] ?? p.department}`)
  if (p.owner_name)          lines.push(`  主负责人：${p.owner_name}`)
  if (p.reviewer_name)       lines.push(`  审核人：${p.reviewer_name}`)
  if (p.executor_names?.length) lines.push(`  执行人：${p.executor_names.join('、')}`)
  if (p.task_date)           lines.push(`  开始日期：${p.task_date}`)
  if (p.due_date)            lines.push(`  截止日期：${p.due_date}`)
  if (p.effort_hours)        lines.push(`  工时：${p.effort_hours}h`)
  if (p.repeat_interval)     lines.push(`  重复周期：${INTERVAL_LABELS[p.repeat_interval] ?? p.repeat_interval}`)
  if (p.completion_criteria) lines.push(`  完成标准：${p.completion_criteria}`)
  if (p.notes)               lines.push(`  备注：${p.notes}`)
  if (intent.ambiguities?.length) {
    lines.push('', '⚠ 不确定项：', ...intent.ambiguities.map(s => `  · ${s}`))
  }
  return lines.join('\n')
}

export function describeFilters(f: ExpenseFilters): string {
  const parts: string[] = []
  if (f.expense_category?.length) {
    parts.push(`类别=${f.expense_category.map(c => EXPENSE_CATEGORY_LABELS[c]).join('/')}`)
  }
  if (f.period_in?.length)       parts.push(`周期∈[${f.period_in.join(',')}]`)
  if (f.date_range?.from || f.date_range?.to) {
    parts.push(`日期 ${f.date_range?.from ?? '*'} ~ ${f.date_range?.to ?? '*'}`)
  }
  if (f.payment_status?.length) parts.push(`状态=${f.payment_status.join('/')}`)
  if (f.payment_method?.length) parts.push(`支付=${f.payment_method.join('/')}`)
  if (f.user_name_contains)     parts.push(`使用人含"${f.user_name_contains}"`)
  if (f.buyer_name_contains)    parts.push(`经办人含"${f.buyer_name_contains}"`)
  if (f.item_name_contains)     parts.push(`名称含"${f.item_name_contains}"`)
  if (f.purpose_contains)       parts.push(`用途含"${f.purpose_contains}"`)
  return parts.join(' · ') || '（无筛选）'
}
