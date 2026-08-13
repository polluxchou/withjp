import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SITE_BASE, RECRUIT_HREF } from '@/lib/site/nav'
import type { SiteProjectTerm, SiteServiceItem, SiteStat, SiteVisionCard } from '@/lib/site/content'
import { buildArticles, type SiteArticleCopy } from '@/lib/site/news'
import SiteSection from '@/components/site/SiteSection'
import SectionHead from '@/components/site/SectionHead'
import HairlineGrid, { GridCell } from '@/components/site/HairlineGrid'
import SiteImage from '@/components/site/SiteImage'
import SiteHeroVideo from '@/components/site/SiteHeroVideo'
import SiteButton from '@/components/site/SiteButton'
import StatGrid from '@/components/site/StatGrid'
import Ticker from '@/components/site/Ticker'
import PulseDot from '@/components/site/PulseDot'
import { NewsCard } from '@/components/site/NewsRow'

export default function SiteTopPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = useTranslations('site.home')
  const tNews = useTranslations('site.news')
  const tServices = useTranslations('site.services')
  const tTicker = useTranslations('site.ticker')

  // slogan 是品牌锁定文字，三语共用同一句欧文（页脚版权行里也是同一句）：设计稿
  // 这一行的气质全靠 Barlow Condensed 的三重错位，本地化成汉字短句会同时丢掉字族
  // 和错位效果，只剩一句和正文没有区别的和文。
  const tagline = t('tagline')
  // 三重描边是给拉丁字母做的：汉字与假名笔画密，3px 错位会和笔画本身撞上糊成
  // 重影，所以含汉字/假名的 slogan 只渲染单层。三语文案现在都是欧文，这条是文案
  // 又被本地化回汉字时的兜底，别当死代码删掉。
  // 假名 / CJK 扩展A / CJK 基本区 / CJK 兼容汉字
  const taglineHasCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(tagline)

  const stats = t.raw('stats') as SiteStat[]
  const visionCards = t.raw('visionCards') as SiteVisionCard[]
  const terms = t.raw('projectTerms') as SiteProjectTerm[]
  const news = buildArticles(tNews.raw('articles') as SiteArticleCopy[]).slice(0, 3)
  const services = tServices.raw('items') as SiteServiceItem[]
  const ticker = tTicker.raw('items') as string[]

  return (
    <>
      {/* ══ HERO ══ */}
      <div className="border-b border-site-line">
        <div className="mx-auto grid max-w-[1360px] px-6 md:px-8 lg:min-h-[640px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="flex flex-col justify-center py-14 lg:border-r lg:border-site-line lg:py-20 lg:pr-14">
            <div className="mb-7 flex items-center gap-3">
              <PulseDot />
              <span className="font-condensed text-[13px] tracking-[0.3em] text-site-accent">
                {t('eyebrow')}
              </span>
            </div>

            {/* 字号上限 48px 而不是更大：h1 的测量宽度被外层 max-w-[1360px] 封在
                623px，字号继续涨会把英文标题的第二行挤断，单词孤零零掉到第四行。 */}
            <h1 className="mb-2 font-serif-jp text-[clamp(26px,3.2vw,48px)] leading-[1.2] tracking-[0.01em]">
              {t('title1')}
              <br />
              {t('title2')}
            </h1>

            {/* 三重描边：青/红/白三层错位叠放。窄屏只留白色那层，
                错位在小字号下会糊成一团。 */}
            <div className="relative mb-7 inline-block self-start">
              {/* 偏移层必须 nowrap：绝对定位的子元素按容器宽度排版，容器宽度
                  由下面那层白字决定，偏移 3px 就会把最后一个词挤到第二行。 */}
              {!taglineHasCjk && (
                <>
                  <span
                    aria-hidden
                    className="absolute -left-[3px] top-px hidden whitespace-nowrap font-condensed text-[30px] tracking-[0.16em] text-site-accent sm:block"
                  >
                    {tagline}
                  </span>
                  <span
                    aria-hidden
                    className="absolute -top-px left-[3px] hidden whitespace-nowrap font-condensed text-[30px] tracking-[0.16em] text-site-hot sm:block"
                  >
                    {tagline}
                  </span>
                </>
              )}
              <span className="relative whitespace-nowrap font-condensed text-[22px] tracking-[0.16em] sm:text-[30px]">
                {tagline}
              </span>
            </div>

            <p className="mb-10 max-w-[520px] text-[16px] leading-[1.9] text-site-fg/78">{t('lead')}</p>

            <div className="mb-11 flex flex-wrap gap-3.5">
              <SiteButton href={RECRUIT_HREF} variant="hot" size="lg">
                {t('ctaApply')}
              </SiteButton>
              <SiteButton href={`${SITE_BASE}/vision`} variant="ghost" size="lg">
                {t('ctaAbout')}
              </SiteButton>
            </div>

            <StatGrid stats={stats} />
          </div>

          <div className="relative flex min-w-0 pb-14 lg:py-14 lg:pl-14">
            <div className="relative h-[360px] w-full sm:h-[460px] lg:h-[520px]">
              <SiteHeroVideo
                src="/site/hero-key.mp4"
                poster="/site/hero-key-poster.webp"
                alt={t('heroPlaceholder')}
                sizes="(min-width: 1024px) 620px, 100vw"
                className="h-full w-full"
              />
            </div>
            <div className="absolute bottom-24 left-5 hidden font-serif-jp text-[14px] tracking-[0.4em] text-site-fg/50 [writing-mode:vertical-rl] lg:block">
              {t('heroCaption')}
            </div>
          </div>
        </div>
      </div>

      <Ticker items={ticker} />

      {/* ══ 01 NEWS ══ */}
      <SiteSection>
        <SectionHead
          eyebrow={t('newsHead.eyebrow')}
          title={t('newsHead.title')}
          moreHref={`${SITE_BASE}/news`}
          moreLabel={t('newsHead.more')}
          className="mb-8"
        />
        <HairlineGrid cols={3}>
          {news.map((article) => (
            <GridCell key={article.slug} hover>
              <NewsCard article={article} readLabel={tNews('read')} />
            </GridCell>
          ))}
        </HairlineGrid>
      </SiteSection>

      {/* ══ 02 VISION ══ */}
      <SiteSection className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-16">
        <div>
          <SectionHead eyebrow={t('visionHead.eyebrow')} title={t('visionHead.title')} />
          <p className="mt-6 text-[16px] leading-[2] text-site-fg/78">{t('visionBody')}</p>
          <Link
            href={`${SITE_BASE}/vision`}
            className="mt-7 inline-block font-condensed text-[15px] tracking-[0.16em] text-site-accent transition-colors hover:text-site-fg"
          >
            {t('visionHead.more')}
          </Link>
        </div>
        <HairlineGrid cols={2}>
          {visionCards.map((card) => (
            <GridCell key={card.no} className="px-[26px] py-[30px]">
              <div className="font-condensed text-[13px] tracking-[0.2em] text-site-accent">{card.no}</div>
              <div className="mb-2 mt-2.5 font-serif-jp text-[22px]">{card.title}</div>
              <p className="text-[14px] leading-[1.8] text-site-fg/68">{card.body}</p>
            </GridCell>
          ))}
        </HairlineGrid>
      </SiteSection>

      {/* ══ 03 PROJECT / MOONDOLLZ ══ */}
      <SiteSection tone="panel">
        <SectionHead
          eyebrow={t('projectHead.eyebrow')}
          title={t('projectHead.title')}
          sub={t('projectHead.sub')}
          moreHref={`${SITE_BASE}/vision`}
          moreLabel={t('projectHead.more')}
          className="mb-9"
        />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="relative h-[300px] min-w-0 sm:h-[380px] lg:h-[440px]">
            <SiteImage
              src="/site/moondollz-group.webp"
              alt={t('projectPlaceholder')}
              placeholder={t('projectPlaceholder')}
              priority
              sizes="(min-width: 1024px) 740px, 100vw"
              className="h-full w-full"
            />
          </div>
          <div className="flex flex-col justify-between gap-6">
            <div className="font-condensed text-[26px] leading-[1.3] tracking-[0.04em] text-site-accent">
              {t('quote1')}
              <br />
              {t('quote2')}
            </div>
            <div className="grid gap-px border border-site-line bg-site-line">
              {terms.map((term) => (
                <div
                  key={term.term}
                  className="grid gap-4 bg-site-panel px-[22px] py-5 sm:grid-cols-[88px_1fr] sm:items-baseline"
                >
                  <div className="font-condensed text-[20px] tracking-[0.14em]">{term.term}</div>
                  <p className="text-[14px] leading-[1.8] text-site-fg/70">{term.body}</p>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-[1.8] text-site-fg/50">{t('projectNote')}</p>
          </div>
        </div>
      </SiteSection>

      {/* ══ 04 SERVICES ══ */}
      <SiteSection>
        <SectionHead
          eyebrow={t('servicesHead.eyebrow')}
          title={t('servicesHead.title')}
          className="mb-8"
        />
        <HairlineGrid cols={4}>
          {services.map((service) => (
            <GridCell key={service.code} hover>
              <Link href={`${SITE_BASE}/services`} className="block h-full px-[30px] py-9">
                <div
                  className={`font-condensed text-[13px] tracking-[0.2em] ${
                    service.code === 'S-04' ? 'text-site-hot' : 'text-site-accent'
                  }`}
                >
                  {service.code}
                </div>
                <div className="mb-2.5 mt-3 font-serif-jp text-[26px]">{service.title}</div>
                <div className="mb-3.5 font-condensed text-[13px] tracking-[0.18em] text-site-fg/50">
                  {service.en}
                </div>
                <p className="text-[14px] leading-[1.9] text-site-fg/68">{service.short}</p>
              </Link>
            </GridCell>
          ))}
        </HairlineGrid>
      </SiteSection>

      {/* ══ 05 TECHNOLOGY ══ */}
      <SiteSection className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
        <div>
          <SectionHead eyebrow={t('techHead.eyebrow')} title={t('techHead.title')} />
          <p className="mb-7 mt-4 text-[16px] leading-[2] text-site-fg/78">{t('techBody')}</p>
          <SiteButton href={`${SITE_BASE}/services`} variant="ghost" size="md" weight="normal">
            {t('techCta')}
          </SiteButton>
        </div>
        <div className="relative h-[260px] min-w-0 lg:h-[320px]">
          <SiteImage
            src="/site/tech-character-expressions.webp"
            alt={t('techPlaceholder')}
            placeholder={t('techPlaceholder')}
            sizes="(min-width: 1024px) 620px, 100vw"
            className="h-full w-full"
          />
        </div>
      </SiteSection>

      {/* ══ RECRUIT ══ */}
      <div className="bg-site-hot text-site-on-hot">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-10 px-6 py-14 md:px-8 lg:py-[72px]">
          <div>
            <div className="font-condensed text-[12px] tracking-[0.3em]">{t('bannerEyebrow')}</div>
            <div className="mt-2.5 font-serif-jp text-[clamp(22px,2.8vw,40px)] leading-[1.3]">
              {t('bannerLine1')}
              <br />
              {t('bannerLine2')}
            </div>
          </div>
          <SiteButton href={RECRUIT_HREF} variant="ink" size="xl" weight="normal">
            {t('bannerCta')}
          </SiteButton>
        </div>
      </div>
    </>
  )
}
