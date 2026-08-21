// 命令面板的对话状态模型与上下文派生。
//
// 放在 lib 而不是组件里，是因为这三件事（结果 → 一句话摘要、消息流 → 上一轮
// 上下文、标记待确认卡已结算）是本轮唯一能在 node --test 下真正测到的逻辑，
// 也是最容易出错的部分。组件只负责渲染。
//
// 注意：outcomeSummary 产出的中文**只进 parser 的 prompt，永不渲染给用户**，
// 所以它不走 i18n（parser.ts 的 prompt 同样是中文硬编码）。

import type { Expense } from '@/lib/types'
import type { ExpenseWritePayload } from '@/lib/intent/schema'
import type { VenueAction } from '@/venue/layoutData'

// ── 服务端返回结构（镜像 executor 的 ExecuteResult）─────────────

export interface PendingActionState {
  pendingActionId: string
  op:              'create' | 'update' | 'delete'
  preview:         string
  targetId?:       string
  expiresAt:       string
  // 仅「编辑并保存」流程需要：表单要知道原本打算写什么。
  payload?:        ExpenseWritePayload   // create
  patch?:          ExpenseWritePayload   // update
  target?:         Expense               // update / delete
}

export type ServerResult =
  | (PendingActionState & { kind: 'pending' })
  | {
      kind:        'query_result'
      breadcrumbs: string
      aggregate:   'sum_total' | 'count' | 'avg_total' | 'list'
      numerator:   { value: number; count: number }
      denominator?: { value: number; count: number; ratio: number }
      groups?:     { key: string; value: number; count: number }[]
      sample?:     Expense[]
    }
  | { kind: 'clarification'; message: string; candidates?: Expense[] }
  | { kind: 'venue_preview'; action: VenueAction }
  | { kind: 'error'; code?: 'parser_failed' | 'executor_failed' | 'bad_request' | 'unknown'; message: string }

// ── 消息流 ────────────────────────────────────────────────────

export type Turn =
  | { id: string; role: 'user';   text: string }
  | { id: string; role: 'agent';  result: ServerResult; settled?: boolean }
  | { id: string; role: 'system'; kind: 'applied' | 'cancelled' }

export interface PriorContext {
  text:    string
  outcome: string
}

// prompt 里塞太长的上一轮摘要既涨成本又冲淡当前这句话，收到 300 字。
export const MAX_PRIOR_OUTCOME_CHARS = 300

function clamp(s: string): string {
  return s.length <= MAX_PRIOR_OUTCOME_CHARS
    ? s
    : `${s.slice(0, MAX_PRIOR_OUTCOME_CHARS - 1)}…`
}

// 把一个结果压成一句话，供下一轮当上下文。
export function outcomeSummary(result: ServerResult): string {
  switch (result.kind) {
    case 'pending':
      return clamp(`已暂存一个待确认的 ${result.op} 操作：${result.preview}`)
    case 'query_result':
      return clamp(
        result.denominator
          ? `查询结果 ${(result.denominator.ratio * 100).toFixed(1)}%（${result.breadcrumbs}）`
          : `查询结果 ${result.numerator.value}（${result.breadcrumbs}）`,
      )
    case 'clarification':
      return clamp(`需要澄清：${result.message}`)
    case 'venue_preview':
      return clamp(`场地改动预览：${result.action.summary}`)
    case 'error':
      return clamp(`上一轮失败：${result.message}`)
  }
}

// 从消息流里取「上一轮」：最后一个 agent 回复，以及它前面最近的那条 user
// 输入。system 气泡（已应用/已取消）跳过——它不是对话内容。
export function priorContextOf(turns: Turn[]): PriorContext | null {
  let agentIdx = -1
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'agent') { agentIdx = i; break }
  }
  if (agentIdx < 0) return null

  const agent = turns[agentIdx]
  if (agent.role !== 'agent') return null

  for (let i = agentIdx - 1; i >= 0; i--) {
    const t = turns[i]
    if (t.role === 'user') {
      return { text: t.text, outcome: outcomeSummary(agent.result) }
    }
  }
  return null
}

// 把某条 agent turn 标成「已结算」（待确认动作已应用或已取消），渲染层据此
// 收起操作按钮，避免同一张卡被点第二次。
export function markSettled(turns: Turn[], id: string): Turn[] {
  const idx = turns.findIndex((t) => t.id === id)
  if (idx < 0) return turns
  const t = turns[idx]
  if (t.role !== 'agent') return turns
  const next = turns.slice()
  next[idx] = { ...t, settled: true }
  return next
}
