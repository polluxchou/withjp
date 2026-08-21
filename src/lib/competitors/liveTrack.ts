// 纯函数，只 import 同目录纯函数模块：供采集脚本（--experimental-strip-types）与视图共用。
// 单直播间分钟级打点的 Node 侧逻辑。页内探针源码在 liveProbe.ts，两者零依赖。

/**
 * 页面是否已下播。
 * rehydration JSON 里 "status":2=在播、4=已结束。结束页会混入「推荐直播」信息流，
 * 那里面别人的在播卡片同样带 status 2 —— 所以只有「有 4 且没有 2」才判结束。
 * 一个状态码都读不到时返回 false：不下结论，交给看门狗的其它信号。
 */
export function roomEnded(html: string): boolean {
  const codes = new Set<number>()
  for (const m of Array.from(html.matchAll(/"(?:status|liveStatus|live_status)"\s*:\s*(\d)/g))) {
    codes.add(Number(m[1]))
  }
  return codes.has(4) && !codes.has(2)
}
