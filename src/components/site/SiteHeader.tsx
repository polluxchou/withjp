'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Menu, X } from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { SITE_NAV, RECRUIT_HREF, isNavActive } from '@/lib/site/nav'
import LocaleSwitch from './LocaleSwitch'
import ThemeToggle from './ThemeToggle'
import LogoVeil from './LogoVeil'
import { CornerMarks } from './BlueprintFrame'

export default function SiteHeader({ locale }: { locale: string }) {
  const t = useTranslations('site.nav')
  const pathname = usePathname()
  const [veil, setVeil] = useState(false)
  const [drawer, setDrawer] = useState(false)

  const closeVeil = useCallback(() => setVeil(false), [])

  // 触屏没有 hover，且在手机上盖住半屏是故障而不是效果 —— 只有真指针设备
  // 才让三角幕开。
  const openVeil = useCallback(() => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) setVeil(true)
  }, [])

  const leave = useCallback(() => {
    setVeil(false)
    setDrawer(false)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-site-line-strong bg-site-header backdrop-blur-lg">
        <div className="mx-auto flex min-h-16 max-w-[1360px] flex-wrap items-center gap-5 px-6 md:px-8">
          <Link
            href="/site"
            onMouseEnter={openVeil}
            onClick={leave}
            className="mr-auto flex items-baseline gap-2"
          >
            <span className="font-condensed text-[26px] font-bold tracking-[0.02em]">ECHOAMP</span>
            <span className="font-condensed text-[12px] tracking-[0.28em] text-site-accent">OSAKA</span>
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex">
            {SITE_NAV.map((item) => {
              const active = isNavActive(pathname, item.href)
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={leave}
                  className="relative whitespace-nowrap px-[9px] py-2 font-condensed text-[15px] tracking-[0.1em] transition-colors hover:text-site-accent"
                >
                  {t(item.key)}
                  {active && (
                    <i className="absolute inset-x-[9px] bottom-0 block h-0.5 bg-site-accent" />
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="hidden items-center gap-1.5 lg:flex">
            <LocaleSwitch locale={locale} />
            <ThemeToggle />
          </div>

          <Link
            href={RECRUIT_HREF}
            onClick={leave}
            className="relative hidden whitespace-nowrap border border-site-fg/22 bg-site-hot px-5 py-2.5 font-condensed text-[15px] font-semibold tracking-[0.12em] text-site-on-hot transition-colors hover:bg-site-hot-hover md:block"
          >
            {t('recruit')}
            <CornerMarks />
          </Link>

          <button
            type="button"
            aria-label={t(drawer ? 'closeMenu' : 'openMenu')}
            aria-expanded={drawer}
            onClick={() => setDrawer((v) => !v)}
            className="-mr-2 p-2 lg:hidden"
          >
            {drawer ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* 窄屏抽屉：顶栏 6 项 + RECRUIT + 语言切换在 <1024 挤不开，折叠成竖列 */}
        {drawer && (
          <div className="border-t border-site-line bg-site-canvas lg:hidden">
            <nav className="mx-auto flex max-w-[1360px] flex-col px-6 py-2 md:px-8">
              {SITE_NAV.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={leave}
                  className={`border-b border-site-line py-3.5 font-condensed text-[17px] tracking-[0.1em] ${
                    isNavActive(pathname, item.href) ? 'text-site-accent' : ''
                  }`}
                >
                  {t(item.key)}
                </Link>
              ))}
              <Link
                href={RECRUIT_HREF}
                onClick={leave}
                className="mt-4 bg-site-hot px-5 py-3 text-center font-condensed text-[17px] font-semibold tracking-[0.12em] text-site-on-hot md:hidden"
              >
                {t('recruit')}
              </Link>
              <div className="flex items-center gap-1.5 py-4">
                <LocaleSwitch locale={locale} />
                <ThemeToggle />
              </div>
            </nav>
          </div>
        )}
      </header>

      <LogoVeil open={veil} onClose={closeVeil} />
    </>
  )
}
