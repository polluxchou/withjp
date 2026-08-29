'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Menu, X } from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { SITE_NAV, RECRUIT_HREF, isNavActive } from '@/lib/site/nav'
import { lockViewportScroll } from '@/lib/ui/scrollLock'
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

  // 路由变化时关抽屉/幕布。菜单项的 onClick=leave 只覆盖点击导航，浏览器
  // 返回/前进手势不经过它——不兜住的话，划返回后新页面上抽屉还开着、滚动
  // 还锁着。（Sidebar.tsx 的移动端抽屉同款兜底。）
  useEffect(() => {
    setDrawer(false)
    setVeil(false)
  }, [pathname])

  // 抽屉打开期间锁页面滚动，走全站共用的 lockViewportScroll()（锁 <html>、
  // 含滚动条槽宽补偿与引用计数，见该文件头注释）。此前不锁：菜单开着时手指
  // 在面板上滑动会带着底下页面一起滚。
  useEffect(() => {
    if (!drawer) return
    return lockViewportScroll()
  }, [drawer])

  // ≥lg 时抽屉本体是 display:none（lg:hidden），但 state 还挂着——开着抽屉
  // 把窗口拉宽（或平板转横屏）跨过断点时，不强制归位的话滚动锁会锁死在一个
  // 看不见的抽屉上，页面从此滚不动。
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      if (mq.matches) setDrawer(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Escape 关抽屉：窄桌面窗口里用键盘的人不该被迫去点 ✕。
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

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

      {/* 抽屉遮罩：压暗页面、点击关抽屉。此前没有它，菜单下方露出的内容可被
          直接误触（点空白想关菜单，结果点进了底下的链接）。
          必须放在 <header> 外面——header 的 backdrop-blur 会为 fixed 后代建立
          containing block，放里面 inset-0 就只盖住顶栏自己。
          z-30：官网层级为 内容 0 < 遮罩 30 < 顶栏/抽屉 40 < 三角幕 60，登记见
          docs/design-system.md §8。 */}
      {drawer && (
        <div
          aria-hidden="true"
          onClick={() => setDrawer(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      <LogoVeil open={veil} onClose={closeVeil} />
    </>
  )
}
