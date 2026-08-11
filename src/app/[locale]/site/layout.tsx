import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Barlow, Barlow_Condensed } from 'next/font/google'
import { isLocale } from '@/i18n/routing'
import { THEME_INIT_SCRIPT } from '@/lib/site/theme'
import SiteHeader from '@/components/site/SiteHeader'
import SiteFooter from '@/components/site/SiteFooter'

// 只自托管两个拉丁族（官网的英文标题与全部大写标签靠它们定调，共几个 woff2）。
//
// 和文的明朝/黑体**不走 next/font**：Noto Serif JP / Noto Sans JP 在 Google
// Fonts 上被切成上百个 unicode-range 分片，构建时要逐个抓取——网络受限的环境
// 直接卡死构建，全量自托管也是好几 MB 的首屏负担。和文改用系统栈（见
// tailwind.config.ts 的 serif-jp / site 字族）：日本用户的 Mac/iOS 上是
// Hiragino Mincho、Windows 上是 Yu Mincho，本机装了 Noto 则优先用 Noto，
// 观感与设计稿一致且零下载。
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
})
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow-condensed',
  display: 'swap',
})

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.meta' })
  return {
    title: { default: t('titleDefault'), template: t('titleTemplate') },
    description: t('description'),
  }
}

export default function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  if (!isLocale(params.locale)) notFound()
  setRequestLocale(params.locale)

  const fontVars = [barlow.variable, barlowCondensed.variable].join(' ')

  return (
    // .site-root 同时是 globals.css 里 `body:has(.site-root)` 的钩子：官网页面
    // 要把后台的紫晕氛围底从 body 上换成官网画布底，否则 overscroll 会露出浅色。
    <div className={`site-root min-h-screen bg-site-canvas font-site text-[15px] leading-relaxed text-site-fg ${fontVars}`}>
      {/* 主题必须在首次绘制前定好，否则选了浅色的访客每次进站都先闪一帧纯黑。
          脚本放在内容之前、只做一件事：把 data-theme 打到 <html> 上。 */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <SiteHeader locale={params.locale} />
      <main>{children}</main>
      <SiteFooter />
    </div>
  )
}
