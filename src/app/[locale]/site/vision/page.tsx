import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { createServerClient } from '@/lib/supabase/server'
import {
  membersFromQuery,
  type SiteCaptain,
  type SiteEra,
  type SiteMember,
  type SitePrinciple,
} from '@/lib/site/content'
import SiteSection from '@/components/site/SiteSection'
import HairlineGrid, { GridCell } from '@/components/site/HairlineGrid'
import SiteImage from '@/components/site/SiteImage'
import MemberCard from '@/components/site/MemberCard'

const CAPTAIN_IMAGES = ['/site/ayatsuki-portrait.webp', '/site/yukiha-portrait.webp']

const MEMBER_COLUMNS =
  'no, is_revealed, photo_url, name, name_ja, name_zh, name_en, specialty_ja, specialty_zh, specialty_en, expected_reveal_on'

// 内容来自 site_members 表（Task 12 起），不再是构建时写死的静态文案，所以这个
// 页面靠 ISR 缓存：`revalidate = false` 表示无限期缓存、只经由后台写接口的
// revalidatePath 按需失效（src/lib/site/members-service.ts 的
// revalidateMemberPages），这里不重复实现失效逻辑。
export const revalidate = false

// 查询失败时不抛错——否则会让整个 VISION 页（连带宣言/年代/团体性格一起）500，
// 这与「数据库故障不影响官网可读」的口径（docs/public-site.md §2.4）相悖。
// membersFromQuery 返回 `null` 表示查询失败，调用方（下面的页面组件）据此
// 跳过整个 MEMBERS 区块，而不是像卡位数还是常量时那样渲染 12 张编造的
// "未公开"占位卡——卡位数现在由表的实际行数决定，查询失败时根本不知道该编
// 几张假卡，编造内容比不显示这个区块更糟。真实故障通过 console.error 留痕，
// 避免和"查询成功但库里目前确实没有任何卡位"这种合法状态混为一谈（后者
// membersFromQuery 会返回空数组，页面仍然正常渲染区块标题与队长，只是卡片
// 网格是空的——不再有"0 行 = 迁移大概没跑"的专门警告，因为 0 行现在是数据
// 驱动之后完全合法的常态，不是异常信号）。
async function fetchMembers(
  locale: Locale,
  unrevealedName: string,
  unrevealedScheduleUnknown: string,
): Promise<SiteMember[] | null> {
  const db = createServerClient()
  const { data, error } = await db.from('site_members').select(MEMBER_COLUMNS)

  return membersFromQuery(
    locale,
    { data, error },
    { unrevealedName, unrevealedScheduleUnknown },
    (queryError) => {
      console.error('[site/vision] site_members query failed, skipping MEMBERS section', queryError)
    },
  )
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'site.vision' })
  return { title: t('eyebrow') }
}

export default async function SiteVisionPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale)
  const t = await getTranslations('site.vision')
  const tm = await getTranslations('site.members')

  const eras = t.raw('eras') as SiteEra[]
  const principles = t.raw('principles') as SitePrinciple[]
  const captains = tm.raw('captains') as SiteCaptain[]
  const members = await fetchMembers(
    params.locale as Locale,
    tm('unrevealedName'),
    tm('unrevealedScheduleUnknown'),
  )

  return (
    <>
      {/* ══ 宣言 ══ */}
      <SiteSection divider={false} className="pb-4 lg:pb-14">
        <div className="font-condensed text-[12px] tracking-[0.3em] text-site-accent">{t('eyebrow')}</div>
        <h1 className="mt-3.5 max-w-[900px] font-serif-jp text-[clamp(26px,3.4vw,52px)] leading-[1.35]">
          {t('title')}
        </h1>
        {/* 信念句单独成段：它是宣言的第二层，和下面的说明段落挤在一个 <p> 里会读丢。 */}
        <p className="mt-6 max-w-[760px] font-serif-jp text-[19px] leading-[1.9]">{t('statement')}</p>
        <p className="mt-4 max-w-[760px] text-[17px] leading-[2.1] text-site-fg/78">{t('lead')}</p>
      </SiteSection>

      <SiteSection divider={false} className="pt-0 lg:pt-0">
        {/* 图位高度不动：桌面 1296×420 是 3.09:1，图本身 2172×724 正好 3:1，
            object-cover 只切掉上下各几像素。duotone 摘掉，同 ON AIR 图位和首页
            05 TECHNOLOGY 那次(PR 198 / PR 200)：这张的看点就是霓虹和地平线那道
            余晖，压成青色单色调等于把它抹平。 */}
        <div className="relative h-[240px] sm:h-[320px] lg:h-[420px]">
          <SiteImage
            src="/site/vision-osaka-night.webp"
            alt={t('imageAlt')}
            placeholder={t('imagePlaceholder')}
            sizes="(min-width: 1360px) 1296px, 100vw"
            className="h-full w-full"
          />
        </div>
      </SiteSection>

      {/* ══ 年代 ══ */}
      <SiteSection divider={false} className="pt-0 lg:pt-0">
        <HairlineGrid cols={4}>
          {eras.map((era) => (
            <GridCell key={era.value} className="px-7 py-[34px]">
              <div className="font-condensed text-[42px] leading-none text-site-accent">{era.value}</div>
              <div className="mb-2 mt-3 font-serif-jp text-[20px]">{era.title}</div>
              <p className="text-[14px] leading-[1.85] text-site-fg/66">{era.body}</p>
            </GridCell>
          ))}
        </HairlineGrid>
      </SiteSection>

      {/* ══ 团体性格：SPIRIT ／ VOICE ／ IMAGE ══ */}
      <div className="border-y border-site-line bg-site-panel">
        <div className="mx-auto grid max-w-[1360px] gap-10 px-6 py-14 md:px-8 lg:grid-cols-3 lg:gap-14 lg:py-[72px]">
          {principles.map((p) => (
            <div key={p.label}>
              <div className="font-condensed text-[13px] tracking-[0.2em] text-site-accent">{p.label}</div>
              <div className="mb-3 mt-2.5 font-serif-jp text-[22px]">{p.title}</div>
              <p className="text-[14px] leading-[1.9] text-site-fg/68">{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══ MEMBERS（设计稿把成员并入 VISION 页） ══ */}
      {/* members 为 null 表示 site_members 查询失败（fetchMembers 内部已
          console.error 留痕）——整个区块（标题、队长、卡片网格）一起跳过，
          不渲染任何编造的占位内容。members 为空数组是查询成功但库里目前
          没有任何卡位这一合法状态，区块正常渲染，只是卡片网格是空的。 */}
      {members !== null && (
        <SiteSection divider={false} className="pb-20 lg:pb-24">
          <div className="font-condensed text-[12px] tracking-[0.3em] text-site-accent">{tm('eyebrow')}</div>
          <h2 className="mt-1.5 font-condensed text-[clamp(34px,4vw,56px)] tracking-[0.05em]">{tm('title')}</h2>
          <p className="mb-9 mt-1.5 font-serif-jp text-[18px] text-site-fg/70">{tm('sub')}</p>

          <HairlineGrid cols={2} className="mb-12">
            {captains.map((captain, i) => (
              <GridCell key={captain.name} tone="panel" className="grid gap-6 p-[26px] sm:grid-cols-[200px_minmax(0,1fr)]">
                <div className="relative h-[250px]">
                  <SiteImage
                    src={CAPTAIN_IMAGES[i]}
                    alt={captain.name}
                    placeholder={captain.name}
                    sizes="200px"
                    className="h-full w-full"
                  />
                </div>
                <div>
                  <div className="font-condensed text-[12px] tracking-[0.22em] text-site-accent">
                    {captain.eyebrow}
                  </div>
                  <div className="mb-0.5 mt-2.5 font-condensed text-[34px] tracking-[0.08em]">{captain.name}</div>
                  <div className="mb-2.5 font-serif-jp text-[19px] text-site-fg/72">{captain.jp}</div>
                  <p className="text-[14px] leading-[1.9] text-site-fg/66">{captain.body}</p>
                </div>
              </GridCell>
            ))}
          </HairlineGrid>

          <HairlineGrid cols={6}>
            {members.map((member) => (
              <MemberCard key={member.no} member={member} placeholder={tm('placeholder')} />
            ))}
          </HairlineGrid>
        </SiteSection>
      )}
    </>
  )
}
