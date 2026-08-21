// 意图解析用的模型档位。
//
// 快档（分类 + 查询抽取）默认走 deepseek-chat；强档（写操作抽取、工时任务，
// 以及快档解析失败后的降级）恒为 gemini-2.5-pro —— 降级跨供应商才有意义：
// DeepSeek 整体抓了（频限/宕机）也能兑回来。
//
// resolveFastModel 收 env 值当参数而不是直接读 process.env，是为了让默认、
// 显式回退、非法值三条路径都测得到。

import type { LlmModel } from './json'

export const FAST_DEEPSEEK: LlmModel = { provider: 'deepseek', model: 'deepseek-chat' }
export const FAST_GEMINI:   LlmModel = { provider: 'gemini',   model: 'gemini-2.5-flash' }
export const STRONG_MODEL:  LlmModel = { provider: 'gemini',   model: 'gemini-2.5-pro' }

// INTENT_FAST_PROVIDER: 'deepseek'（默认）| 'gemini'
//
// 回滚：把 Vercel 上这个变量设成 'gemini' 再触发一次部署。不改代码，但**要
// 重新部署**才生效（模块加载时读 env），不是「拨一下立刻生效」。
//
// 非法值（拼错、空串）退回默认而不是抛：一个手滑的环境变量不该让整站的意图
// 解析挂掉。
export function resolveFastModel(env: string | undefined): LlmModel {
  return (env ?? '').trim().toLowerCase() === 'gemini' ? FAST_GEMINI : FAST_DEEPSEEK
}

export function fastModel(): LlmModel {
  return resolveFastModel(process.env.INTENT_FAST_PROVIDER)
}
