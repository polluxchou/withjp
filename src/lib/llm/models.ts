// 意图解析用的模型档位。
//
// 快档（分类 + 查询抽取）与强档（写操作抽取、工时任务、解析失败后的降级）
// 默认都走 deepseek-chat —— 2026-08 生产的 Gemini 项目月度消费上限耗尽后，
// 凡升到 gemini-2.5-pro 的解析全部 429。两档各有 env 开关可独立退回 Gemini。
//
// DeepSeek 没有更强的 JSON 档可用：deepseek-reasoner 不保证 json_object 且
// 延迟差一个量级，交互式面板用不起。所以强档的 deepseek 形态仍是 deepseek-chat，
// 「强」体现在梯子里排后面兜底，而不是模型本身更大。
//
// 跨供应商兜底收在 modelLadder：不管两档怎么配，梯子里始终有另一家供应商，
// 单家整体不可用（429/宕机/缺 key）时自动换家重试。
//
// resolve* 收 env 值当参数而不是直接读 process.env，是为了让默认、显式回退、
// 非法值三条路径都测得到。

import { describeModel, type LlmModel } from './json.ts'

export const FAST_DEEPSEEK: LlmModel = { provider: 'deepseek', model: 'deepseek-chat' }
export const FAST_GEMINI:   LlmModel = { provider: 'gemini',   model: 'gemini-2.5-flash' }

export const STRONG_DEEPSEEK: LlmModel = { provider: 'deepseek', model: 'deepseek-chat' }
export const STRONG_GEMINI:   LlmModel = { provider: 'gemini',   model: 'gemini-2.5-pro' }

// INTENT_FAST_PROVIDER / INTENT_STRONG_PROVIDER: 'deepseek'（默认）| 'gemini'
//
// 回滚：把 Vercel 上对应变量设成 'gemini' 再触发一次部署。不改代码，但**要
// 重新部署**才生效（server 代码在请求时读 env，Vercel 改 env 必须重建），
// 不是「拨一下立刻生效」。
//
// 非法值（拼错、空串）退回默认而不是抛：一个手滑的环境变量不该让整站的意图
// 解析挂掉。
export function resolveFastModel(env: string | undefined): LlmModel {
  return (env ?? '').trim().toLowerCase() === 'gemini' ? FAST_GEMINI : FAST_DEEPSEEK
}

export function fastModel(): LlmModel {
  return resolveFastModel(process.env.INTENT_FAST_PROVIDER)
}

export function resolveStrongModel(env: string | undefined): LlmModel {
  return (env ?? '').trim().toLowerCase() === 'gemini' ? STRONG_GEMINI : STRONG_DEEPSEEK
}

export function strongModel(): LlmModel {
  return resolveStrongModel(process.env.INTENT_STRONG_PROVIDER)
}

// 解析尝试的模型梯子：首选 → 强档 → 跨供应商逃生档，按 describeModel 去重。
//
// 不变量：梯子里两家供应商都出现。任何一家整体不可用（月度消费上限 429、
// 宕机、缺 key）时，后面的档还有另一家能接住，而不是把 parser_failed 抛给
// 用户。逃生档用缺席那家的强档形态。
export function modelLadder(first: LlmModel, strong: LlmModel): LlmModel[] {
  const rungs = [first, strong]
  if (!rungs.some(m => m.provider === 'gemini'))   rungs.push(STRONG_GEMINI)
  if (!rungs.some(m => m.provider === 'deepseek')) rungs.push(STRONG_DEEPSEEK)
  const seen = new Set<string>()
  return rungs.filter(m => {
    const key = describeModel(m)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
