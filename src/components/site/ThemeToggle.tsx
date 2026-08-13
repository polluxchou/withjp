'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { applyTheme, resolveTheme, type SiteTheme } from '@/lib/site/theme'

/**
 * 深/浅主题切换。服务端渲染不出具体主题（它只存在浏览器里），所以挂载前先渲染
 * 一个占位宽度相同的按钮，避免顶栏在 hydration 时抖一下。
 */
export default function ThemeToggle() {
  const t = useTranslations('site.theme')
  const [theme, setTheme] = useState<SiteTheme | null>(null)

  useEffect(() => {
    setTheme(resolveTheme())
  }, [])

  function toggle() {
    const next: SiteTheme = theme === 'light' ? 'dark' : 'light'
    applyTheme(next)
    setTheme(next)
  }

  const label = theme === 'light' ? t('light') : t('dark')

  return (
    <button
      type="button"
      onClick={toggle}
      title={t('toggle')}
      aria-label={t('toggle')}
      className="whitespace-nowrap border border-site-line-strong px-2.5 py-[7px] font-condensed text-[12px] tracking-[0.16em] transition-colors hover:border-site-accent hover:text-site-accent"
    >
      {/* 挂载前用不可见占位撑住同样的宽度，防止顶栏抖动 */}
      <span className={theme === null ? 'invisible' : ''}>{theme === null ? t('dark') : label}</span>
    </button>
  )
}
