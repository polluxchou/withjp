// src/lib/competitors/profileLanguage.ts
// 主页语言（competitor_snapshots.language）与人工填的地区（competitors.region）对不对得上。
//
// 定位是**辅助信息**：language 只是账号的应用语言设置，不是权威国别 —— 日本团把
// 语言设成 en 完全可能。所以这里只做两件事：把观测值原样报出来，以及在能明确推出
// 地区的语言上给一个「和人工值不一致」的提示。绝不反过来改写 region。
//
// 纯函数、零 IO，可单测。

/** 能明确对应到地区的语言。en 这类跨地区语言故意不进表——推不出来就别提示。 */
const LANGUAGE_REGION: Record<string, string> = {
  ja: 'JP',
  ko: 'KR',
  th: 'TH',
  vi: 'VN',
  id: 'ID',
}

export interface ProfileLanguageCheck {
  /** 观测到的语言码，原样。 */
  language: string
  /** 该语言能推出的地区；推不出来（如 en）为 null。 */
  expectedRegion: string | null
  /** 能推出地区、人工地区也有值、且两者不同 —— 值得提示人去核一眼。 */
  mismatch: boolean
}

/** 没有观测值时返回 null（调用方据此整行不渲染）。 */
export function checkProfileLanguage(
  language: string | null | undefined,
  region: string | null | undefined,
): ProfileLanguageCheck | null {
  const lang = language?.trim().toLowerCase()
  if (!lang) return null
  const expectedRegion = LANGUAGE_REGION[lang] ?? null
  const actual = region?.trim().toUpperCase()
  return {
    language: lang,
    expectedRegion,
    mismatch: expectedRegion != null && !!actual && expectedRegion !== actual,
  }
}
