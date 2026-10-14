// 弹窗状态判定。所有判断在这里，popup.js 只管渲染。
import { handleFromLiveUrl } from './liveUrl.js'

const SCALE_EPSILON = 1e-3

export function readingState(handle, reading) {
  if (!handle) return { kind: 'error', message: '当前页不是直播间' }
  if (!reading || !reading.clip || !reading.clip.ready || !reading.clip.clip) {
    return { kind: 'error', message: '没找到直播画面' }
  }
  // 页内读到的网址和标签页网址对不上：读的那一刻页面已经跳走了（SPA 切房），这次读数不能用
  if (handleFromLiveUrl(reading.href) !== handle) {
    return { kind: 'error', message: '页面刚切换了直播间，请重试' }
  }
  // 触控板双指缩放时元素坐标是布局视口的、截图是放大后的可视区域，裁出来会偏。
  // 失败即拒：读数缺失或是 NaN 一律当作已缩放，免得字段改名后这道防线悄悄失效。
  if (!(Math.abs(reading.visualScale - 1) <= SCALE_EPSILON)) {
    return { kind: 'error', message: '请先把页面缩放恢复到 100%' }
  }
  return { kind: 'ready', viewerOk: typeof reading.viewer === 'string' && reading.viewer !== '' }
}

export function uploadErrorMessage(code, handle) {
  switch (code) {
    case 'not_in_library':
      return `@${handle} 不在竞品库`
    case 'unauthorized':
      return '登录已过期，请重新登录'
    case 'invalid_type':
    case 'file_too_large':
      return '截图格式或大小不符'
    case 'network_error':
      return '网络不通，可以重试'
    case 'auth_unavailable':
      return '登录服务暂时不可用，可以重试'
    default:
      return '上传失败，可以重试'
  }
}

// 侧栏同期人数那一行（顶部卡片第三行、放大确认页共用）。只是提示，不拦上传。
// status 是页内读取报的 co_live_status；不认识的值（新旧版本混用等）一律按「没读到」说。
// 用 switch 而不是对象查表：查表遇到 'toString' 这类原型键会把函数拼进文案。
export function coLiveLine(status, coLive) {
  const n = Array.isArray(coLive) ? coLive.length : 0
  if (status === 'ok' && n > 0) return { text: `✓ 同期 ${n} 个`, tone: 'ok' }
  switch (status) {
    case 'no_following':
      return { text: '⚠ 同期没读到：侧栏只有推荐区（TikTok 没登录，或关注的人都没在播）', tone: 'warn' }
    case 'no_channels':
      return { text: '⚠ 同期没读到：没找到侧栏（页面结构可能变了）', tone: 'warn' }
    case 'empty':
      return { text: '⚠ 同期没读到：Following 区是空的', tone: 'warn' }
    default:
      return { text: '⚠ 同期没读到', tone: 'warn' }
  }
}

// 上传响应 → 弹窗怎么显示、暂存区怎么处理。
// 只有带 data 的 201 才算传完、移出暂存区；207 = 截图已入库、人数没写进去，留着并标「人数待补」
// （再传一次后台按截图时刻认出同一张，只补写人数）；其它一律当失败，图留着、底部计数不动。
export function uploadOutcome(r, handle) {
  const status = r ? r.status : 0
  const body = r && r.body && typeof r.body === 'object' ? r.body : null
  const data = body && body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : null
  if ((status === 201 || status === 207) && data) {
    const name = typeof data.competitor_name === 'string' && data.competitor_name ? data.competitor_name : `@${handle}`
    const todayUploads = typeof data.today_uploads === 'number' ? data.today_uploads : null
    return status === 201
      ? { kind: 'ok', stash: 'remove', name, todayUploads }
      : { kind: 'partial', stash: 'partial', name, todayUploads }
  }
  if (status === 401) return { kind: 'login', stash: 'keep' }
  return { kind: 'error', stash: 'keep', message: uploadErrorMessage(body && body.error, handle) }
}
