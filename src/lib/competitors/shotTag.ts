// src/lib/competitors/shotTag.ts
// 截图 tag 的显示：程序写入的两个机器值换成界面语言的文案，人填的自由文本原样显示。
import { QUICK_SHOT_TAG } from './quickShot.ts'

/** 自动巡检脚本写入的 tag（scripts/live-watch/record-live-shot.mjs 的默认值）。 */
export const AUTO_SHOT_TAG = 'live_auto'

export type ShotTagDisplay =
  | { kind: 'known'; key: 'live_auto' | 'live_manual' }
  | { kind: 'text'; text: string }

/**
 * 精确匹配机器值：它们由代码写死，大小写或空白不同的只可能是人手写的，原样显示更诚实。
 * 空值与纯空白返回 null（不显示角标）。
 */
export function shotTagDisplay(tag: string | null | undefined): ShotTagDisplay | null {
  const text = tag?.trim()
  if (!text) return null
  if (tag === AUTO_SHOT_TAG) return { kind: 'known', key: 'live_auto' }
  if (tag === QUICK_SHOT_TAG) return { kind: 'known', key: 'live_manual' }
  return { kind: 'text', text }
}
