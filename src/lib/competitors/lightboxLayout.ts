// src/lib/competitors/lightboxLayout.ts
// 灯箱的尺寸判断：主图占多高、宽屏时前后各露一张放不放得下。
//
// 取代了旧的 LIGHTBOX_VISIBLE / visibleCountFor（并排 3 张等大）。换掉的理由是
// 等大并排有个解不掉的歧义：画面上三张一样大，而叠加层描述的只是选中那张，
// 看的人得先弄清楚它在说谁。改成「主图 + 两侧明显更小更暗的邻图」之后，
// 谁是主角由尺寸和明度直接说清楚，叠加层归属就没有歧义了。

/** 主图高度上限，占视口高度。折叠态。 */
export const MAIN_MAX_VH = 0.8

/**
 * 窄屏编辑展开时主图的高度上限。
 *
 * 编辑区（日期框 / 保存 / 删除）落在**图的下方**而不是叠在图上 —— 叠着的版本实测
 * 会盖住主图 51%，一边改日期一边看不见图。
 *
 * ≥sm 的屏幕上主图**不缩**：主图与编辑区同属一列、整列垂直居中，列变高主图就自然
 * 上移（1280×800 实测上移 30px）。缩图反而会让列变矮、主图往下掉 —— 第一版按 58vh
 * 缩，实测主图下移了 56px，方向正好反了。
 *
 * 窄屏才需要这个上限：手机上编辑区是两行（原生 date 控件太宽，独占一行），
 * 不缩的话 80vh 的图加上去会超出视口。
 */
export const MAIN_EDITING_NARROW_VH = 0.62

/** 邻图相对主图的高度比例。明显小一档，读作"配角"。 */
export const PEEK_SCALE = 0.62

/** 竖屏截图的宽高比（TikTok LIVE 截图的常态）。 */
const SHOT_ASPECT = 9 / 16

/** 主图与邻图之间的间距。 */
const GAP_PX = 16
/** 两侧留给翻页箭头和呼吸的边距。 */
const EDGE_PX = 48

/**
 * 当前视口放不放得下「邻图 + 主图 + 邻图」。
 *
 * 竖图是**由高度约束宽度**的：主图宽 = MAIN_MAX_VH × vh × 9/16。所以判据是视口的
 * 宽高比而不只是宽度 —— iPad 竖屏宽度有 768 却放不下，同样 900 宽的视口在 600 高时
 * 放得下、900 高时放不下。用 CSS 断点做这件事会在横竖屏切换时给错结论，所以放在
 * 渲染期按实测尺寸算。
 *
 * 刻意不接受 editing 参数：一律按**折叠态**的主图高度判断。否则展开编辑区（主图变矮、
 * 更容易放下）会让两侧的图闪进来，收起时又闪出去。按折叠态判断是偏保守的那一侧，
 * 编辑态只会更宽松，不会溢出。
 */
export function showsNeighbors(vw: number, vh: number): boolean {
  if (!(vw > 0) || !(vh > 0)) return false
  const mainW = MAIN_MAX_VH * vh * SHOT_ASPECT
  const peekW = mainW * PEEK_SCALE
  return vw >= mainW + 2 * peekW + 2 * GAP_PX + 2 * EDGE_PX
}

/**
 * 左右两侧各画不画邻图。
 *
 * 第一张的左侧、最后一张的右侧一律不画 —— 不留空占位框。旧实现里"未加载的图会塌成
 * 零宽"已经踩过一次：画面上的空位会被读成「这张图没加载出来」，而不是「这边没有了」。
 */
export function lightboxNeighbors(
  vw: number,
  vh: number,
  total: number,
  index: number,
): { left: boolean; right: boolean } {
  const fits = showsNeighbors(vw, vh)
  return {
    left: fits && index > 0,
    right: fits && index < total - 1,
  }
}
