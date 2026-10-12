// src/lib/competitors/descriptions.ts
// 直播间风格描述的纯函数：排序与正文校验。读库、读时钟的部分在 service.ts。
import type { CompetitorDescription } from './types.ts'

/**
 * 正文上限（字符数）。一段"近 30 天风格总结"实测在 100-200 字，2000 留了十倍余量；
 * 设上限是为了挡住脚本把整份原始 LLM 输出（含 JSON 包裹、思维链）误写进来。
 */
export const BODY_MAX_CHARS = 2000

/**
 * 按生成日期倒序（最新在前），同一天再按入库时间倒序。
 *
 * 日期用字符串比较而不是 new Date()：generated_on 是 YYYY-MM-DD 的日戳，
 * 解析成 Date 会引入时区（见 lib/time/dayStamp.ts 那次"差一天"的教训），
 * 而定宽的 ISO 日期字典序本身就等于时间序。
 *
 * 不改动入参：调用方（assemble）拿到的是库里那份数组，就地排序会让同一份
 * 数据在别处的顺序也跟着变。
 */
export function sortDescriptions(rows: CompetitorDescription[]): CompetitorDescription[] {
  return rows.slice().sort((a, b) => {
    const byDay = b.generated_on.localeCompare(a.generated_on)
    return byDay !== 0 ? byDay : b.created_at.localeCompare(a.created_at)
  })
}

/**
 * 去首尾空白后的正文；空、非字符串、超长一律返回 null（= 不可写入）。
 *
 * 超长返回 null 而不是截断：截断会把一段总结拦腰砍掉且事后看不出被砍过，
 * 让写入失败、调用方重试才是能被发现的失败。
 */
export function normalizeDescriptionBody(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const body = input.trim()
  if (body === '') return null
  // Array.from 而不是 .length：按码点算，一个 emoji 不该顶掉两个字的额度。
  // （也不用展开语法 —— tsconfig 的 target 不开 downlevelIteration。）
  if (Array.from(body).length > BODY_MAX_CHARS) return null
  return body
}
