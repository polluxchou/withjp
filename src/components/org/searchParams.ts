// 改 URL 查询参数但不触发服务端重取：Next 14.2 会把 history.pushState / replaceState
// 同步到 useSearchParams。push 留历史（手机层级，系统返回手势能回首层），
// replace 不留（筛选、视图切换，避免点十次筛选要按十次返回）。
export function writeSearchParams(next: Record<string, string | null>, mode: 'push' | 'replace'): void {
  const sp = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(next)) {
    if (value === null) sp.delete(key)
    else sp.set(key, value)
  }
  const qs = sp.toString()
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`
  if (mode === 'push') window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
}
