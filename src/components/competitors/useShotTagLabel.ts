// src/components/competitors/useShotTagLabel.ts
import { useTranslations } from 'next-intl'
import { shotTagLabel } from '@/lib/competitors/shotTag'

/**
 * 截图 tag → 当前界面语言的显示文本；空 tag 返回 null。
 * 文案键写成字面量而不是拼接：这样 i18n 门禁仍能做"引用了不存在的键"的检查，键改名或写错会直接红。
 */
export function useShotTagLabel(): (tag: string | null | undefined) => string | null {
  const t = useTranslations('competitors')
  return (tag) => shotTagLabel(tag, { live_auto: t('shotTag.live_auto'), live_manual: t('shotTag.live_manual') })
}
