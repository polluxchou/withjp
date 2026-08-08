// 通知轮询节奏:正常 30s;连续失败时指数退避,封顶 5 分钟。
export const POLL_INTERVAL_MS = 30_000
export const POLL_BACKOFF_MAX_MS = 300_000

export function nextPollDelay(consecutiveFailures: number): number {
  const exp = Math.min(Math.max(consecutiveFailures, 0), 10)
  return Math.min(POLL_INTERVAL_MS * 2 ** exp, POLL_BACKOFF_MAX_MS)
}
