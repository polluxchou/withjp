import { useTranslations } from 'next-intl'
import { Compass } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import EmptyState from '@/components/ui/EmptyState'

// 后台里找不到的地址（经 [...rest] 兜进来）与页面自己调的 notFound()。
export default function AppNotFound() {
  const t = useTranslations('errorPages')
  return (
    <div className="pt-10">
      <div className="mx-auto w-full max-w-md rounded-card border border-line bg-surface px-5 shadow-card">
        <EmptyState
          icon={<Compass strokeWidth={1.5} />}
          title={t('notFoundTitle')}
          hint={t('notFoundHint')}
          action={
            <Link
              href="/"
              className="inline-flex h-7 items-center rounded-btn bg-primary-soft px-3 text-xs font-medium text-primary-hover transition-colors hover:bg-primary-soft-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
            >
              {t('backHome')}
            </Link>
          }
        />
      </div>
    </div>
  )
}
