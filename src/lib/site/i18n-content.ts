import type { Locale } from '../../i18n/routing.ts'

export interface LocalizedText {
  ja: string
  zh?: string | null
  en?: string | null
}

/**
 * 数据库内容的三语取值。ja 由 DB 的 not null 保证一定有值，所以本函数永不返回空。
 * 空串与 null 同等对待：后台表单清空一个选填字段会提交空串，不该让官网显示空白。
 */
export function pickLocaleText(locale: Locale, values: LocalizedText): string {
  const candidate = locale === 'ja' ? values.ja : locale === 'zh' ? values.zh : values.en
  const trimmed = typeof candidate === 'string' ? candidate.trim() : ''
  return trimmed || values.ja
}
