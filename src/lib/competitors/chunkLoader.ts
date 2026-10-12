// src/lib/competitors/chunkLoader.ts
// 竞品相册「往历史翻页时按需补取」的异步状态机：去重、同右端排队、失败、重试、被取代。
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
  /**
   * 告诉它「现在缺哪段」（nextChunk 的结果）；null = 什么都不缺。
   * 已加载起点每次变化后都要重新调用：在途段成功后，排队的缺口不会自动补发。
   */
  want: (range: ShotRange | null) => void
  /** 重试当前缺的那段（报错行上的「重试」按钮）。 */
  retry: () => void
}

const keyOf = (range: ShotRange) => `${range.from}|${range.before}`

/**
 * 不提供取消：dev 的 StrictMode 双挂载会把在途请求取消掉、又被去重挡住重发，
 * 永远卡在占位格。在途请求总是跑完，靠去重 + merge 里的过期丢弃保证正确。
 *
 * 同右端排队：连点「更早」时 nextChunk 的 from 越来越早、before（已加载起点）不变，
 * 每次都发就是一串互相重叠、只有先回来那段有用的请求。所以右端相同的一段在途时，
 * 新缺口只记下不发，等在途那段收尾：
 * - 成功：不补发记下的缺口——它是按合并前的起点算的，与刚并入的那段重叠。合并必然把起点
 *   从 before 推进到 range.from，调用方要在起点变化时按新状态重新 want（组件里 pendingChunk
 *   的 useMemo 依赖 shotsLoadedFrom），续上的是一段不重叠的。
 *   合并被判过期时起点早已不是 before，那次变化已经让调用方重新 want 过了（右端不同，不排队）。
 * - 失败：看板没变，调用方不会重新 want，由这里按最新缺口补发（见 run 的 catch）。
 *
 * 失败只在「失败的那段仍是当前缺的那段」时才报：被取代的旧请求失败了，
 * 此时什么都不缺（或缺的是别的段），挂出报错行只会误导。
 */
export function createChunkLoader<S>(deps: ChunkLoaderDeps<S>): ChunkLoader {
  let wanted: ShotRange | null = null
  // 在途请求：右端 before → 那一段的 key。同一个右端至多一段在途。
  const inflight = new Map<string, string>()

  async function run(range: ShotRange, key: string): Promise<void> {
    let rows: S[]
    try {
      rows = await deps.fetchRows(range)
    } catch {
      inflight.delete(range.before)
      if (wanted === null) return
      if (keyOf(wanted) === key) deps.setFailed(true)
      // 同右端的新缺口一直在等这段收尾，现在补发；右端不同的当时就已单独发出，不归这里管。
      else if (wanted.before === range.before) want(wanted)
      return
    }
    inflight.delete(range.before)
    deps.merge(rows, range)
  }

  function want(range: ShotRange | null): void {
    wanted = range
    if (range === null) {
      deps.setFailed(false)
      return
    }
    const busy = inflight.get(range.before)
    const key = keyOf(range)
    if (busy === key) return
    deps.setFailed(false)
    if (busy !== undefined) return // 同右端另一段在途：排队，收尾时再判
    inflight.set(range.before, key)
    void run(range, key)
  }

  return {
    want,
    retry: () => { if (wanted !== null) want(wanted) },
  }
}
