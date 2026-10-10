// Supabase REST（PostgREST）每次响应最多返回 1000 行，超出部分会被静默截掉、不报错。
// 整表加载必须分页拉全：按稳定排序一页页取，直到某页不满为止。
// 前提：服务端的单页上限（Supabase 后台 API 设置里的 Max rows）不小于 PAGE_SIZE；
// 若被调低，第一页就会「不满」，这里会误以为表已读完——改那个设置前先改这里。
export const PAGE_SIZE = 1000
/** 防止排序不稳定或服务端异常时无限翻页：最多翻这么多页就报错，而不是悄悄截断。 */
export const MAX_PAGES = 200

export type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * 分页拉全一张表。page(from, to) 必须返回同一个**稳定排序**查询的 [from, to] 闭区间
 * （即 `.order(...).range(from, to)`），否则翻页会漏行或重复。
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
): Promise<PageResult<T>> {
  const rows: T[] = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * pageSize
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: null, error }
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < pageSize) return { data: rows, error: null }
  }
  return { data: null, error: { message: `fetchAllRows: 超过 ${MAX_PAGES} 页仍未取完` } }
}
