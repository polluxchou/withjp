import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import { defaultLocale, isLocale } from '@/i18n/routing'

export const metadata: Metadata = {
  title: 'Creator Guild OS',
  description: 'AI-powered operating system for live-streaming creator guilds',
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
    <html lang={lang}>
      <body className="font-sans">
        {children}
      </body>
    </html>
  )
}
