import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { SITE_BASE, RECRUIT_HREF } from '@/lib/site/nav'

const COLUMNS: { key: string; href: string }[][] = [
  [
    { key: 'visionMembers', href: `${SITE_BASE}/vision` },
    { key: 'live', href: `${SITE_BASE}/live` },
  ],
  [
    { key: 'services', href: `${SITE_BASE}/services` },
    { key: 'news', href: `${SITE_BASE}/news` },
  ],
  [
    { key: 'recruit', href: RECRUIT_HREF },
    { key: 'contact', href: `${SITE_BASE}/contact` },
  ],
]

export default function SiteFooter() {
  const t = useTranslations('site.footer')

  return (
    <footer className="border-t border-site-line bg-site-panel">
      <div className="mx-auto grid max-w-[1360px] gap-10 px-6 pb-10 pt-14 md:px-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="font-condensed text-[26px] font-bold tracking-[0.02em]">ECHOAMP</div>
          <p className="mt-3 whitespace-pre-line text-[13px] leading-[1.9] text-site-fg/60">
            {t('address')}
          </p>
        </div>
        {COLUMNS.map((column, i) => (
          <div key={i} className="flex flex-col gap-2.5 font-condensed text-[14px] tracking-[0.14em] text-site-fg/70">
            {column.map((item) => (
              <Link key={item.key} href={item.href} className="transition-colors hover:text-site-fg">
                {t(item.key)}
              </Link>
            ))}
            {i === 2 && <span className="text-site-fg/50">{t('social')}</span>}
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-[1360px] px-6 pb-10 font-condensed text-[12px] tracking-[0.18em] text-site-fg/40 md:px-8">
        {t('copyright')}
      </div>
    </footer>
  )
}
