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
    default:
      return '上传失败，可以重试'
  }
}
