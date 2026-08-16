// src/lib/competitors/anchors.ts
// 导航条与竞品卡各自渲染、互不引用，靠这一个约定对接 DOM 锚点。
// 单独成文件是为了不让两个组件之间产生方向奇怪的 import。

export function competitorAnchorId(id: string): string {
  return `competitor-${id}`
}
