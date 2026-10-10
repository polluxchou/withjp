// src/lib/competitors/chunkLoader.ts
// 竞品相册「往历史翻页时按需补取」的异步状态机：去重、失败、重试、被取代。
// 纯 TS、无 React——本仓没有 DOM 测试环境，这段逻辑写在组件 effect 里就只能靠源码断言，
// 所以抽到这里做行为测试；组件只负责把 setState 接进来。
import { shotRangePath } from './shotWindow.ts'
import type { ShotRange } from './shotWindow.ts'

/**
 * 取一段截图。任何失败（网络、非 2xx、响应体不是 { data: 数组 }）一律抛错——
 * 绝不把「取失败」当成「这段没图」：并进一个空段会让历史日期变成带补图入口的空格子。
 */
export async function fetchShotRange<S>(
  range: ShotRange,
  fetchImpl: typeof fetch = fetch,
): Promise<S[]> {
  const res = await fetchImpl(shotRangePath(range), { cache: 'no-store' })
  if (!res.ok) throw new Error(`shot range ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json?.data)) throw new Error('shot range: bad payload')
  return json.data as S[]
}

export interface ChunkLoaderDeps<S> {
  fetchRows: (range: ShotRange) => Promise<S[]>
  /** 拿到一段后怎么并入——组件里是 setBoard((b) => mergeShotRange(b, rows, range))。 */
  merge: (rows: S[], range: ShotRange) => void
  setFailed: (failed: boolean) => void
}

export interface ChunkLoader {
  /** 告诉它「现在缺哪段」（nextChunk 的结果）；null = 什么都不缺。 */
  want: (range: ShotRange | null) => void
  /** 重试当前缺的那段（报错行上的「重试」按钮）。 */
  retry: () => void
}

const keyOf = (range: ShotRange) => `${range.from}|${range.before}`

/**
 * 不提供取消：dev 的 StrictMode 双挂载会把在途请求取消掉、又被去重挡住重发，
 * 永远卡在占位格。在途请求总是跑完，靠去重 + merge 里的过期丢弃保证正确。
 *
 * 失败只在「失败的那段仍是当前缺的那段」时才报：被取代的旧请求失败了，
 * 此时什么都不缺（或缺的是别的段），挂出报错行只会误导。
 */
export function createChunkLoader<S>(deps: ChunkLoaderDeps<S>): ChunkLoader {
  let wanted: ShotRange | null = null
  let inflightKey: string | null = null

  async function run(range: ShotRange, key: string): Promise<void> {
    try {
      const rows = await deps.fetchRows(range)
      deps.merge(rows, range)
    } catch {
      if (wanted !== null && keyOf(wanted) === key) deps.setFailed(true)
    } finally {
      // 只清自己：重叠在途时，先完成的那段不能把后来者的标记抹掉。
      if (inflightKey === key) inflightKey = null
    }
  }

  function want(range: ShotRange | null): void {
    wanted = range
    if (range === null) {
      deps.setFailed(false)
      return
    }
    const key = keyOf(range)
    if (inflightKey === key) return
    inflightKey = key
    deps.setFailed(false)
    void run(range, key)
  }

  return {
    want,
    retry: () => { if (wanted !== null) want(wanted) },
  }
}
