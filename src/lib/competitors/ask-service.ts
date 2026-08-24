// src/lib/competitors/ask-service.ts
// 竞品问答的无状态服务函数：校验请求体 → 裁剪历史 → 取看板 → 拼数据包 →
// 拼 system prompt → 调模型。
//
// 原来是 POST /api/competitors/ask 的路由体，AskPanel 抽屉下线后唯一的调用
// 方变成了 /api/intent 的 competitor 分支——同进程函数调用，不再发一次
// HTTP 自请求（同一台 Vercel serverless 实例内部再打一次 HTTP 既多一跳延迟，
// 也让 authGuard/cookie 转发这类细节徒增一层没必要的复杂度）。
//
// 相对路径 + .ts 后缀：同目录 ask-validate.ts / ask-context.ts 的既定约定，
// node --test 不解析 tsconfig 的 @/ 别名。
import { getCompetitorBoard } from './service.ts'
import { buildAskContext } from './ask-context.ts'
import { buildSystemPrompt } from './ask-prompt.ts'
import { deepseekChat } from '../llm/deepseek.ts'
import { MAX_TURNS, parseAskBody, trimHistory } from './ask-validate.ts'

export type AskServiceResult =
  | { ok: true; answer: string }
  | { ok: false; code: 'not_configured' | 'upstream' | 'board' | 'bad_request'; message: string }

/**
 * 跑一轮竞品问答对话。rawBody 是未校验的输入（{ messages, locale? }）——
 * parseAskBody 是这份数据在成为 prompt 的一部分之前唯一的校验点：role 白名单、
 * 内容长度上限、locale 白名单。调用方（/api/intent 的 competitor 分支）不得
 * 在这之前自己再做一遍更弱的校验，见本文件调用方的注释。
 */
export async function runAskConversation(userId: string, rawBody: unknown): Promise<AskServiceResult> {
  const parsed = parseAskBody(rawBody)
  if (!parsed.ok) {
    return { ok: false, code: 'bad_request', message: parsed.message }
  }
  // 历史上限见 ask-validate.ts 的 MAX_TURNS 注释：数据包本身约 15k token，
  // 再让历史无限增长会顶穿上下文窗口，也会让每轮成本随对话长度线性上涨。
  const turns = trimHistory(parsed.turns, MAX_TURNS)

  const boardRes = await getCompetitorBoard(userId)
  if (boardRes.error) {
    // 真实错误只留服务端日志——boardRes.error.message 是 Supabase/Postgrest
    // 原始报错，可能带表名、约束名等内部细节，不能透传给客户端。
    console.error('[ask-service] getCompetitorBoard failed', boardRes.error)
    return { ok: false, code: 'board', message: 'Failed to load competitor board data' }
  }

  // now 由这里注入（唯一允许读时钟的地方）——buildAskContext 的日期口径
  // 依赖 Asia/Tokyo，不能用 todayLocal()（读运行环境时区，在 Vercel 上是
  // UTC），见 ask-context.ts 顶部注释与设计文档 §7。
  const ctx = buildAskContext(boardRes.data, new Date(), parsed.locale)
  const result = await deepseekChat(buildSystemPrompt(ctx, parsed.locale), turns)

  // deepseekChat 内部已经对 message 做过凭据脱敏（见 deepseek.ts 的
  // redactCredentials），这里原样透传即可。not_configured/upstream 两个
  // code 原样向上抛，调用方决定用什么 HTTP 状态码包装它们。
  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message }
  }
  return { ok: true, answer: result.answer }
}
