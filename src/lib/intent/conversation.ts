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
  | { kind: 'competitor_answer'; answer: string }
  | {
      kind: 'error'
      code?: 'parser_failed' | 'executor_failed' | 'bad_request' | 'unknown' | 'not_configured' | 'upstream' | 'board'
      message: string
    }

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
    case 'competitor_answer':
      return clamp(`竞品问答：${result.answer}`)
    case 'error':
      return clamp(`上一轮失败：${result.message}`)
  }
}

// 从消息流里取「上一轮」：最后一个 agent 回复，以及它前面最近的那条 user
// 输入。system 气泡（已应用/已取消）跳过——它不是对话内容。
//
// competitor_answer 同样跳过：这份 prior 只喂给支出/工时任务解析器的 prompt
// （见 parser.ts 的 priorHint），用来消解「改成 350」这类同域指代；竞品问答
// 的多轮上下文走的是完全独立的一条路（askHistoryOf 把全部相关轮次发给
// runAskConversation），从不读这里。让一段可能很长的竞品数据问答（粉丝数、
// 开播时刻……）作为"上一轮"字面拼进支出解析 prompt，只有成本（每轮多付一段
// 无关 token）没有收益——不会有真实场景需要用"改成 350"去指代竞品问答里的
// 某个数字。因此竞品回答对这份跨域上下文而言，视同不存在，继续往前找。
export function priorContextOf(turns: Turn[]): PriorContext | null {
  let agentIdx = -1
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]
    if (t.role === 'agent' && t.result.kind !== 'competitor_answer') { agentIdx = i; break }
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

export interface AskHistoryTurn {
  role:    'user' | 'assistant'
  content: string
}

/**
 * 把消息流压成竞品问答服务要的 { role, content }[] 历史——user 轮次原样
 * 映射成 role:'user'；agent 轮次只有当结果是 competitor_answer 时才映射成
 * role:'assistant'（content 取 answer），其余 agent 结果（pending/query_result/
 * clarification/venue_preview/error）与 system 气泡一律跳过，它们不是竞品
 * 问答对话的一部分。
 *
 * 每次提交都无条件带上这份历史（哪怕本轮问的是支出），服务端只在被分类为
 * competitor 时才读它——这样请求体形状统一，不用先猜分类结果再决定带不带
 * 历史。因此这里按 limit 兜住上限：即使整段对话很长，也只取最近 limit 条，
 * 默认 20 与 ask-validate.ts 的 MAX_TURNS 对齐（服务端 trimHistory 还会再裁
 * 一次，这里的裁剪只是不让非竞品场景的请求体随对话变长而线性膨胀）。
 *
 * 混入非竞品的 user 轮次（比如中途插了一笔支出）是已知的、可接受的噪音：
 * 它们会以没有配对 assistant 回复的 role:'user' 消息出现在历史里，DeepSeek
 * 走 OpenAI 兼容协议，不强制严格交替（同 ask-validate.ts trimHistory 的
 * 注释），多出来的这几条不会导致报错，只是不提供信息量。
 */
export function askHistoryOf(turns: Turn[], limit = 20): AskHistoryTurn[] {
  const out: AskHistoryTurn[] = []
  for (const t of turns) {
    if (t.role === 'user') {
      out.push({ role: 'user', content: t.text })
    } else if (t.role === 'agent' && t.result.kind === 'competitor_answer') {
      out.push({ role: 'assistant', content: t.result.answer })
    }
  }
  return out.slice(-Math.max(0, limit))
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
