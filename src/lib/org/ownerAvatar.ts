// src/lib/org/ownerAvatar.ts — 负责人文字头像：名字取字、按人配色（spec 6.4「头像 + 姓名 + 更换」）。
//
// 快照里没有头像图片字段，不扩数据，用名字生成文字头像。头像旁边总跟着姓名，所以只求好认、不求唯一：
// 同姓会撞字，靠按人配色缓解。
// 刻意不用 localeCompare / toLocaleUpperCase 这类随运行环境 ICU 与默认语言变化的函数：
// SSR 与浏览器算出来不一样会水合错位。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。
import type { OwnerKey } from './quadrant.ts'
import type { Tone } from '../ui/status-tone.ts'

// 用构造函数写：tsconfig 没设 target，字面量带 u 标志会被 tsc 拒绝（TS1501）。
const LETTER = new RegExp(String.raw`^\p{L}`, 'u')
// 一个字就是一个完整音节的文字：汉字取姓，假名、韩文同理，取第一个字。
const SYLLABIC = new RegExp(String.raw`^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]`, 'u')
const SPACE = new RegExp(String.raw`^\s`, 'u')

let segmenter: Intl.Segmenter | undefined

/** 按字素切：emoji 组合序列、国旗、带组合附加符号的字母都算一个。没有 Segmenter 的旧浏览器退回按码点切。 */
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text)
  // 固定 'en'：字素切分本身与语言无关，固定下来免得跟着运行环境的默认语言走。
  segmenter ??= new Intl.Segmenter('en', { granularity: 'grapheme' })
  return Array.from(segmenter.segment(text), (s) => s.segment)
}

/** 大写后变长的（ß → SS、ﬁ → FI）保持原样，头像里永远最多两个字母。 */
function upper(g: string): string {
  const u = g.toUpperCase()
  return u.length === g.length ? u : g
}

/**
 * 头像上显示的字；一个字母都取不到时返回 null（组件改显示通用人像图标）。
 * - 开头的 emoji、符号、数字、标点、空白一律跳过，从第一个字母算起。
 * - 第一个字母是汉字 / 假名 / 韩文：只取这一个字。
 * - 其他字母文字（拉丁、西里尔…）：取前两个词（只按空白分词）的首字母并大写，只有一个词就取一个。
 *   第二个词以汉字等开头时不混排，只留一个字母。
 */
export function ownerInitials(name: string | null | undefined): string | null {
  if (!name) return null
  const gs = graphemes(name)
  const start = gs.findIndex((g) => LETTER.test(g))
  if (start < 0) return null
  const first = gs[start]
  if (SYLLABIC.test(first)) return first
  let afterSpace = false
  for (let i = start + 1; i < gs.length; i++) {
    const g = gs[i]
    if (SPACE.test(g)) afterSpace = true
    else if (afterSpace && LETTER.test(g)) return SYLLABIC.test(g) ? upper(first) : upper(first) + upper(g)
  }
  return upper(first)
}

/**
 * 头像可用的色调，取自 Tag 的 tone。不含 warning（「未指派」专用）和 danger（逾期、阻塞专用），
 * 免得一个人的头像被看成告警。顺序参与配色，改动会让所有人换色。
 */
export const AVATAR_TONES = ['info', 'violet', 'success', 'neutral'] as const satisfies readonly Tone[]
export type AvatarTone = (typeof AVATAR_TONES)[number]

/** 按负责人 key 稳定配色（FNV-1a 32 位）：同一个人在任何页面、SSR 与浏览器里都是同一个颜色。未指派返回 null。 */
export function ownerTone(key: OwnerKey): AvatarTone | null {
  if (key === 'none') return null
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return AVATAR_TONES[(h >>> 0) % AVATAR_TONES.length]
}
