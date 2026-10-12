// src/lib/competitors/anchors.ts
// 导航条与竞品卡各自渲染、互不引用，靠这一个约定对接 DOM 锚点。
// 单独成文件是为了不让两个组件之间产生方向奇怪的 import。

const PREFIX = 'competitor-'

export function competitorAnchorId(id: string): string {
  return `${PREFIX}${id}`
}

/**
 * 从 location.hash（带不带 # 都行）里取回竞品 id；不是竞品锚点给 null。
 * 竞品公司页的「查看档案」靠 /competitors#competitor-<id> 跳过来，看板挂载后用它定位。
 */
export function competitorIdFromHash(hash: string | null | undefined): string | null {
  if (!hash) return null
  let raw = hash.startsWith('#') ? hash.slice(1) : hash
  try {
    raw = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (!raw.startsWith(PREFIX)) return null
  const id = raw.slice(PREFIX.length)
  return id ? id : null
}
