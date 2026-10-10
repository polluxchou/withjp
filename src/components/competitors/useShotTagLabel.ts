// src/components/competitors/useShotTagLabel.ts
import { useTranslations } from 'next-intl'
import { shotTagDisplay } from '@/lib/competitors/shotTag'

/**
 * 截图 tag → 当前界面语言的显示文本；空 tag 返回 null。
 * 文案键写成字面量而不是拼接：i18n 门禁只认得出字面量引用，拼出来的键会被判成"没人用"。
 */
export function useShotTagLabel(): (tag: string | null | undefined) => string | null {
  const t = useTranslations('competitors')
  return (tag) => {
    const d = shotTagDisplay(tag)
    if (!d) return null
    if (d.kind === 'text') return d.text
    return d.key === 'live_auto' ? t('shotTag.live_auto') : t('shotTag.live_manual')
  }
}
