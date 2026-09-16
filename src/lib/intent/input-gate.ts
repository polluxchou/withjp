// 意图输入闸——`/api/intent` 的 text 与 prior 两个入口共用同一套清洗规则。
//
// 抽成纯函数而不是留在 route handler 里，是因为 prior（客户端传上来的上一轮
// 上下文）必须跟主 text 走**完全一样**的闸：两处各写一份的话，其中一处漏掉
// NFKC 或控制字符清洗不会有任何测试红给你看。

export const MAX_INPUT_CHARS = 1000

// eslint-disable-next-line no-control-regex
export const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g

export type SanitizeResult =
  | { ok: true;  text: string }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'empty_after_sanitize' }
  | { ok: false; reason: 'too_long'; length: number }

export function sanitizeIntentText(raw: string, maxChars: number): SanitizeResult {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (trimmed.length > maxChars) return { ok: false, reason: 'too_long', length: trimmed.length }

  // CONTROL_CHARS 带 /g，String.prototype.replace 每次调用都从 0 开始扫、
  // 结束后把 lastIndex 归零，所以模块级共享这个正则是安全的（.test() 才会
  // 留 lastIndex）。
  const text = trimmed.normalize('NFKC').replace(CONTROL_CHARS, ' ').trim()
  if (!text) return { ok: false, reason: 'empty_after_sanitize' }
  return { ok: true, text }
}
