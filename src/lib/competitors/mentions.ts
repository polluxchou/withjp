// src/lib/competitors/mentions.ts
// 纯函数,零 import:从 bio 文本提取被 @ 到的其他 TikTok handle(用于「下探一步」发现关联主播）。
// 供采集脚本（--experimental-strip-types，相对 .ts 引用）与视图共用。

const MENTION_RE = /(?<![A-Za-z0-9_])@([A-Za-z0-9_.]{2,24})/g
const MAX_MENTIONS = 20

/**
 * 从 bio 中提取被 @ 提及的 handle（不含 @）。
 * - 排除自身 selfHandle（大小写不敏感）。
 * - 邮箱域名不算（@ 前是词字符时不匹配）。
 * - 去尾部 '.'；不足 2 位丢弃。
 * - 大小写去重、保留首次出现；上限 20 个。
 */
export function extractMentionedHandles(
  bio: string | null | undefined,
  selfHandle?: string,
): string[] {
  if (!bio) return []
  const self = (selfHandle ?? '').toLowerCase().replace(/^@/, '')
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of Array.from(bio.matchAll(MENTION_RE))) {
    const h = m[1].replace(/\.+$/, '')
    if (h.length < 2) continue
    const key = h.toLowerCase()
    if (key === self || seen.has(key)) continue
    seen.add(key)
    out.push(h)
    if (out.length >= MAX_MENTIONS) break
  }
  return out
}
