'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { locales } from '@/i18n/routing'

/**
 * 语言切换。设计稿只在 RECRUIT 页做了「日本語 / 中文」局部切换；三语落地后
 * 升级为顶栏全局切换，沿用它的分段描边样式（激活项前面一个青色圆点）。
 *
 * usePathname 来自 next-intl，返回的是**去掉语言前缀**的路径，所以切语言就是
 * 同一路径换个 locale，用户停在当前页而不是被弹回首页。
 */
export default function LocaleSwitch({ locale }: { locale: string }) {
  const t = useTranslations('site.locale')
  const pathname = usePathname()

  return (
    <div className="flex border border-site-line-strong">
      {locales.map((l, i) => {
        const active = l === locale
        return (
          <Link
            key={l}
            href={pathname}
            locale={l}
            aria-current={active ? 'true' : undefined}
            className={`px-3 py-1.5 font-condensed text-[13px] tracking-[0.16em] transition-colors ${
              i > 0 ? 'border-l border-site-line-strong' : ''
            } ${active ? 'text-site-accent' : 'text-site-fg/60 hover:text-site-fg'}`}
          >
            {active ? '● ' : ''}
            {t(l)}
          </Link>
        )
      })}
    </div>
  )
}
