// 当前标签页是不是 TikTok 直播间，是的话取出 handle（小写）。
// 只认 tiktok.com/@<handle>/live（带查询串也行）；主页、视频页、发现页都不算。
export function handleFromLiveUrl(href) {
  if (typeof href !== 'string') return null
  let u
  try {
    u = new URL(href)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !/^(www\.)?tiktok\.com$/.test(u.hostname)) return null
  const m = u.pathname.match(/^\/@([^/]+)\/live\/?$/)
  return m ? decodeURIComponent(m[1]).toLowerCase() : null
}
