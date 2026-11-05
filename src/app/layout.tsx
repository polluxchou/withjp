import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import localFont from 'next/font/local'
import './globals.css'
import { defaultLocale, isLocale } from '@/i18n/routing'

// 后台拉丁字族 Open Sans（自托管，见 src/fonts/README.md）。可变字重文件覆盖设计规范 §2 的
// 四档（400/500/600/700）；中文/日文仍落到 tailwind sans 栈里的系统黑体。
// 不用 next/font/google：构建期联网抓取在 CI 上偶发失败，会让 next build 整体报错。
const adminSans = localFont({
  src: '../fonts/open-sans-latin-wght-normal.woff2',
  weight: '300 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-admin-sans',
})

export const metadata: Metadata = {
  title: 'Creator Network OS',
  description: 'AI-powered operating system for live-streaming creator networks',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // next-intl middleware sets X-NEXT-INTL-LOCALE for all locale-prefixed routes;
  // our custom middleware mirrors this for auth-gated and public locale paths too.
  const headersList = await headers()
  const headerLocale = headersList.get('x-next-intl-locale')
  const lang = isLocale(headerLocale ?? '') ? headerLocale! : defaultLocale

  return (
    <html lang={lang} className={adminSans.variable}>
      <body className="font-sans">
        {children}
      </body>
    </html>
  )
}
