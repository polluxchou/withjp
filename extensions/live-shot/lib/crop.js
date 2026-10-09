// captureVisibleTab 截的是「可见区域」整张位图。像素比 = 位图宽 / 视口 CSS 宽——
// 不直接用 devicePixelRatio：浏览器缩放、换外接屏时两者可能不一致，位图本身才是真的。
// 返回 drawImage 用的源矩形；越界裁到位图内，剩下不足 2px 视为没有画面。
export function cropRect(clip, viewportWidth, bitmapWidth, bitmapHeight) {
  if (!clip || !(viewportWidth > 0) || !(bitmapWidth > 0) || !(bitmapHeight > 0)) return null
  const scale = bitmapWidth / viewportWidth
  const x0 = Math.max(0, Math.round(clip.x * scale))
  const y0 = Math.max(0, Math.round(clip.y * scale))
  const x1 = Math.min(bitmapWidth, Math.round((clip.x + clip.width) * scale))
  const y1 = Math.min(bitmapHeight, Math.round((clip.y + clip.height) * scale))
  if (x1 - x0 < 2 || y1 - y0 < 2) return null
  return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 }
}
