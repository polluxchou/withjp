export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import SectionCard from '@/components/ui/SectionCard'
import { Stat, StatBand } from '@/components/ui/Stat'
import RecordRow from '@/components/ui/RecordRow'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'
import { ApplicationTabs, ApplicationErrorState } from '@/components/recruit-applications/ApplicationControls'
import { toneOf } from '@/lib/ui/status-tone'
import type { ApplicationKind, CommuteMode } from '@/lib/site/application'
import { Calendar, Cake, MapPin, Mail, Navigation, FileText } from 'lucide-react'

// 对外官网 RECRUIT 表单的投递。只读：本轮不做状态流转（那是后续需求），
// 这一页存在的意义是让投递不至于躺在库里没人看见。
//
// ?tab=creator|staff —— staff 是本页的 UI 分组，不是 kind 的取值：数据库里
// 只有 creator/photographer/makeup/group_live_ops 四个 kind，staff 查的是
// 后三者的合集。参数刻意叫 tab 而不是 kind，避免误以为存在一个叫 staff 的
// kind 而跑去数据库加它。
type ApplicationTab = 'creator' | 'staff'

// age/residence 已改为可空：员工类（非 creator）投递不采集这两个字段。
type ApplicationRow = {
  id: string
  kind: ApplicationKind
  name: string
  age: number | null
  residence: string | null
  contact: string
  email: string | null
  commute_mode: CommuteMode | null
  experience: string | null
  locale: string
  status: string
  created_at: string
}

async function getApplications(tab: ApplicationTab): Promise<{ applications: ApplicationRow[]; error: boolean }> {
  const db = createServerClient()
  let query = db
    .from('site_applications')
    .select('id, kind, name, age, residence, contact, email, commute_mode, experience, locale, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  query = tab === 'creator' ? query.eq('kind', 'creator') : query.neq('kind', 'creator')
  const { data, error } = await query
  if (error) console.error('Failed to load applications:', error)
  return { applications: (data ?? []) as ApplicationRow[], error: Boolean(error) }
}

function formatDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

// 大多数 meta 图标只是紧挨着的可见文本的装饰性重复（日期格式、邮箱格式、
// 地名本身已经自解释），不需要额外的可访问名——真正有歧义的是裸数字
// （年龄）：脱离视觉图标语境时,「24」读不出它是年龄。这里只给这类字段配
// sr-only 文本,而不是给每个图标都套一层 title（title 是 hover-only、
// 屏幕阅读器支持不稳定、触屏/键盘都摸不到，只是把 <th> 表头文字换个壳)。
// Fragment 不产生 DOM 节点，<svg> 仍是 RecordRow 那个 [&>svg] 尺寸选择器的
// 直接子元素，不需要额外包一层 span 重声明样式。
function metaIconWithLabel(icon: JSX.Element, label: string): JSX.Element {
  return (
    <>
      {icon}
      <span className="sr-only">{label}</span>
    </>
  )
}

export default async function RecruitApplicationsPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const tab: ApplicationTab = searchParams.tab === 'staff' ? 'staff' : 'creator'

  const [{ applications, error }, t, tCommon] = await Promise.all([
    getApplications(tab),
    getTranslations('recruitApplications'),
    getTranslations('common'),
  ])

  // 三个统计按当前 tab 统计 —— applications 已经是 tab 过滤后的结果，
  // 不需要另外按 kind 二次筛选。
  const newCount = applications.filter((a) => a.status === 'new').length
  const today = new Date().toISOString().slice(0, 10)
  const todayCount = applications.filter((a) => a.created_at.slice(0, 10) === today).length

  const notProvided = t('notProvided')

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        tabs={
          <ApplicationTabs
            value={tab}
            label={t('tabsLabel')}
            items={[
              { value: 'creator', label: t('tabs.creator') },
              { value: 'staff', label: t('tabs.staff') },
            ]}
          />
        }
      />

      <div className="mb-6">
        <StatBand>
          <Stat label={t('totalLabel')} value={applications.length} />
          <Stat label={t('newLabel')} value={newCount} />
          <Stat label={t('todayLabel')} value={todayCount} />
        </StatBand>
      </div>

      {error ? (
        <ApplicationErrorState detail={tCommon('loadFailed')} />
      ) : applications.length === 0 ? (
        <EmptyState title={t('empty')} hint={t('emptyHint')} />
      ) : (
        <SectionCard padding="none" title={t('listTitle')}>
          <div>
            {applications.map((application) => (
              <RecordRow
                key={application.id}
                title={application.name}
                who={application.contact}
                meta={
                  application.kind === 'creator'
                    ? [
                        { icon: <Calendar />, text: formatDate(application.created_at) },
                        {
                          icon: metaIconWithLabel(<Cake />, t('columns.age')),
                          mono: true,
                          text: application.age !== null ? String(application.age) : notProvided,
                        },
                        { icon: <MapPin />, text: application.residence || notProvided },
                        { icon: <FileText />, text: application.experience || notProvided },
                      ]
                    : [
                        { icon: <Calendar />, text: formatDate(application.created_at) },
                        {
                          icon: metaIconWithLabel(<Mail />, t('columns.email')),
                          text: application.email || notProvided,
                        },
                        {
                          icon: metaIconWithLabel(<Navigation />, t('columns.commuteMode')),
                          text: application.commute_mode
                            ? t(`commuteModes.${application.commute_mode}`)
                            : notProvided,
                        },
                        { icon: <FileText />, text: application.experience || notProvided },
                      ]
                }
                tags={
                  <div className="flex items-center gap-1.5 flex-none">
                    <Tag
                      size="sm"
                      tone={toneOf('application_kind', application.kind)}
                      label={t(`kinds.${application.kind}`)}
                    />
                    <Tag size="sm" tone="neutral" label={application.locale.toUpperCase()} />
                  </div>
                }
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
