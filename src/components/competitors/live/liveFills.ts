// src/components/competitors/live/liveFills.ts
// 开播图表共用的填充。弹窗日历、开播时段页的月历 / 单个直播间 / 番组表都用这一份，
// 同一种含义在各处长得一样，读者看过一张图就认得下一张：
// - 导入场次（LIVE History，起止完整）= 主色实色
// - 截图推断的场次（下播只是下限）= 主色斜纹
// - 无数据（不知道播没播）= 墨色低透明度的中性斜线。不用主色，免得被读成场次；
//   也不能画成「没播」的实底，否则只有截图的号会被读成断播一个月。
// 颜色写在 style 里：Tailwind 的 /N 透明度修饰符要字面量，渐变更写不进类名。
import type { CSSProperties } from 'react'

export const HISTORY_FILL: CSSProperties = { backgroundColor: 'rgb(var(--primary) / 0.85)' }

export const SHOT_FILL: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgb(var(--primary) / 0.85) 0 2px, rgb(var(--primary) / 0.28) 2px 4px)',
}

export const NO_DATA_FILL: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(45deg, rgb(var(--ink-900) / 0.07) 0 2px, transparent 2px 6px)',
}

/**
 * 番组表一格的在播密度。透明度由 liveBoard.densityAlpha 给（这一刻在播的天数占比越高越深）；
 * 有导入记录的列（含导入 + 截图混合）= 实色，只有截图的列 = 同色斜纹，浅的那半取 0.32 倍——
 * 与上面两种填充同一套「实色 = 导入、斜纹 = 截图」的读法。透明度是算出来的，只能写在 style 里。
 */
export function densityFill(alpha: number, hatched: boolean): CSSProperties {
  const a = alpha.toFixed(2)
  return hatched
    ? {
        backgroundImage: `repeating-linear-gradient(135deg, rgb(var(--primary) / ${a}) 0 2px, rgb(var(--primary) / ${(alpha * 0.32).toFixed(2)}) 2px 5px)`,
      }
    : { backgroundColor: `rgb(var(--primary) / ${a})` }
}
