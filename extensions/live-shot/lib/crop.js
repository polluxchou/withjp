// captureVisibleTab 截的是「可见区域」整张位图。像素比 = 位图宽 / 视口 CSS 宽——
// 不直接用 devicePixelRatio：浏览器缩放、换外接屏时两者可能不一致，位图本身才是真的。
// 返回 drawImage 用的源矩形；越界裁到位图内。
// 裁完不足 2px，或画面一半以上在视口外就不截（让人先把直播画面滚进视口）；NaN 也一律拒。
export function cropRect(clip, viewportWidth, bitmapWidth, bitmapHeight) {
  if (!clip || !(viewportWidth > 0) || !(bitmapWidth > 0) || !(bitmapHeight > 0)) return null
  const scale = bitmapWidth / viewportWidth
  const x0 = Math.max(0, Math.round(clip.x * scale))
  const y0 = Math.max(0, Math.round(clip.y * scale))
  const x1 = Math.min(bitmapWidth, Math.round((clip.x + clip.width) * scale))
  const y1 = Math.min(bitmapHeight, Math.round((clip.y + clip.height) * scale))
  const sw = x1 - x0
  const sh = y1 - y0
  // 用 !(…) 的写法，任何一项是 NaN 都落进 return null
  if (!(sw >= 2 && sh >= 2 && sw >= (clip.width * scale) / 2 && sh >= (clip.height * scale) / 2)) return null
  return { sx: x0, sy: y0, sw, sh }
}
