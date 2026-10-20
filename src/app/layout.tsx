import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Open_Sans } from 'next/font/google'
import './globals.css'
import { defaultLocale, isLocale } from '@/i18n/routing'

// 后台拉丁字族试用 Open Sans（自托管）。只取设计规范 §2 的四档字重；
// 中文/日文仍落到 tailwind sans 栈里的系统黑体。
const adminSans = Open_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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
