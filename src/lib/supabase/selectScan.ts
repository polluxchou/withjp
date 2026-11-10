// 源码扫描：找出 Supabase 读取查询（.from('表').select(...)）里没有行数上限的那些。
// 只给防线测试用（unbounded-selects-wiring.test.ts），不进运行时。
//
// 为什么要扫：PostgREST 单次响应最多 1000 行，超出部分静默截掉、不报错。
// 一句不带上限的 select 在表小的时候永远正确，过千行那天开始悄悄丢数据。
//
// 这是按文本做的近似判断，不是语法分析：只认「.from('字面量表名')」起头的一条链式调用。
// 分步拼出来的查询（let q = db.from(...)...; q = q.limit(n)）链条在第一句就断了，
// 会被报成没有上限——那种写法要么挪进 fetchAllRows 回调，要么在防线测试里登记理由。

import { PAGE_SIZE } from './fetchAll.ts'

export type Guard =
  | 'paged'   // 写在 fetchAllRows(...) 回调里
  | 'limit'   // .limit(n ≤ 1000) 或显式 .range(a, b)
  | 'single'  // .single() / .maybeSingle()
  | 'head'    // { head: true } 只要计数
  | 'pk'      // 按主键 id 过滤

export type SelectRead = {
  table: string
  /** .from 所在行，从 1 起 */
  line: number
  /** 没有任何上限时为 null */
  guard: Guard | null
}

export type PagedCallProblem = { line: number; problem: string }

/** 把注释抹成空格（保留换行，行号不变）；字符串里的 // 不动。 */
function blankComments(src: string): string {
  const out = src.split('')
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i)
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') out[i++] = ' '
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      for (; i < stop; i++) if (src[i] !== '\n') out[i] = ' '
    } else {
      i++
    }
  }
  return out.join('')
}

/** i 指向开引号，返回闭引号之后的位置。 */
function skipString(src: string, i: number): number {
  const quote = src[i]
  i++
  while (i < src.length && src[i] !== quote) {
    if (src[i] === '\\') i++
    i++
  }
  return i + 1
}

/** i 指向开括号之后，返回与之配对的闭括号之后的位置。 */
function skipBalanced(src: string, i: number): number {
  let depth = 1
  while (i < src.length && depth > 0) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') { i = skipString(src, i); continue }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    i++
  }
  return i
}

/** 从 .from( 起，吃完整条 .a(...).b(...) 链，返回链条文本。 */
function chainAt(src: string, start: number): string {
  let i = start
  for (;;) {
    const m = /^\s*\.\s*[A-Za-z_]+\s*(?:<[^>(]*>)?\(/.exec(src.slice(i))
    if (!m) break
    i = skipBalanced(src, i + m[0].length)
  }
  return src.slice(start, i)
}

/** 所有 fetchAllRows( ... ) 调用的 [起, 止) 区间。 */
function pagedSpans(src: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const re = /\bfetchAllRows\s*(?:<[^>(]*>)?\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) spans.push([m.index, skipBalanced(src, m.index + m[0].length)])
  return spans
}

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length

function guardOf(chain: string): Guard | null {
  if (/\.(?:single|maybeSingle)\(/.test(chain)) return 'single'
  if (/head:\s*true/.test(chain)) return 'head'
  const limit = /\.limit\(\s*([^)]*?)\s*\)/.exec(chain)
  if (limit) {
    // 字面量超过单页上限的 limit 是假上限：服务端照样只给 1000 行
    const literal = /^\d[\d_]*$/.test(limit[1]) ? Number(limit[1].replaceAll('_', '')) : null
    if (literal === null || literal <= PAGE_SIZE) return 'limit'
  }
  if (/\.range\(/.test(chain)) return 'limit'
  if (/\.(?:eq|in)\(\s*['"]id['"]/.test(chain)) return 'pk'
  return null
}

export function scanSelectReads(source: string): SelectRead[] {
  const src = blankComments(source)
  const spans = pagedSpans(src)
  const reads: SelectRead[] = []
  const re = /\.from\(\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const chain = chainAt(src, m.index)
    if (!/\.select\(/.test(chain)) continue
    if (/\.(?:insert|update|delete|upsert)\(/.test(chain)) continue
    const at = m.index
    const paged = spans.some(([a, b]) => at > a && at < b)
    reads.push({ table: m[1], line: lineOf(src, at), guard: paged ? 'paged' : guardOf(chain) })
  }
  return reads
}

/**
 * 内联了查询的 fetchAllRows 调用必须：以 .range(from, to) 切页，且切页之前有 .order('id' 兜底。
 * 没有唯一键兜底的排序不稳定（同一 created_at 的两行可能在两页之间互换位置），翻页会漏行或重复。
 */
export function pagedCallProblems(source: string): PagedCallProblem[] {
  const src = blankComments(source)
  const problems: PagedCallProblem[] = []
  for (const [a, b] of pagedSpans(src)) {
    const body = src.slice(a, b)
    if (!/\.from\(/.test(body)) continue
    const line = lineOf(src, a)
    const rangeAt = body.search(/\.range\(\s*from\s*,\s*to\s*\)/)
    if (rangeAt < 0) {
      problems.push({ line, problem: '分页查询没有 .range(from, to)' })
      continue
    }
    if (!/\.order\(\s*['"]id['"]/.test(body.slice(0, rangeAt))) {
      problems.push({ line, problem: `分页查询在 .range 之前没有 .order('id' 兜底，排序不稳定会漏行或重复` })
    }
  }
  return problems
}
