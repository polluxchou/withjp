import BlueprintFrame from './BlueprintFrame'
import SiteButton from './SiteButton'
import type { SiteContactSection as ContactSectionData } from '@/lib/site/contact'

export default function ContactSection({ section }: { section: ContactSectionData }) {
  return (
    <BlueprintFrame
      tone="soft"
      className="grid gap-10 px-7 py-10 md:px-10 md:py-12 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.32fr)] lg:gap-14 lg:px-12 lg:py-16"
    >
      <div className="flex min-w-0 flex-col items-start">
        <div className="font-condensed text-[13px] tracking-[0.24em] text-site-accent">
          {section.eyebrow} ／ {section.no}
        </div>
        <h2 className="mb-4 mt-5 font-serif-jp text-[clamp(30px,3vw,42px)] leading-[1.35]">
          {section.title}
        </h2>
        <p className="max-w-[560px] text-[15px] leading-[2] text-site-fg/72">{section.body}</p>
        {section.note && (
          <p className="mt-7 text-[14px] tracking-[0.08em] text-site-fg/45">{section.note}</p>
        )}
        {section.cta && section.ctaHref && (
          <SiteButton
            href={section.ctaHref}
            variant={section.action === 'recruit' ? 'hot' : 'ghost'}
            size="md"
            className="mt-8"
          >
            {section.cta}
          </SiteButton>
        )}
      </div>

      <div className="min-w-0 lg:pt-1">
        {(section.partner || section.brand) && (
          <div className="mb-6 flex min-h-12 flex-wrap items-center gap-5">
            {section.brand && (
              <div className="bg-site-fg px-3 py-2 text-site-canvas">
                <div className="font-serif-jp text-[20px] leading-none">{section.brand.primary}</div>
                <div className="mt-1 text-[8px] tracking-[0.16em]">{section.brand.secondary}</div>
              </div>
            )}
            {section.partner && (
              <div className="font-condensed text-[13px] tracking-[0.28em] text-site-fg/48">
                {section.partner}
              </div>
            )}
          </div>
        )}

        <dl className="border border-site-line-strong bg-site-panel">
          {section.rows.map((row) => (
            <div
              key={`${section.id}-${row.label}`}
              className="grid border-b border-site-line px-5 py-5 last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-5 md:px-6 md:py-6"
            >
              <dt className="mb-1.5 font-condensed text-[15px] tracking-[0.13em] text-site-accent sm:mb-0">
                {row.label}
              </dt>
              <dd className="min-w-0 text-[15px] leading-[1.75] md:text-[16px]">
                {row.href ? (
                  <a
                    className="break-all transition-colors hover:text-site-accent"
                    href={row.href}
                    target={row.link === 'external' ? '_blank' : undefined}
                    rel={row.link === 'external' ? 'noreferrer' : undefined}
                  >
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
                {row.subvalue && (
                  <span className="mt-1 block text-[13px] text-site-fg/48">{row.subvalue}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </BlueprintFrame>
  )
}
