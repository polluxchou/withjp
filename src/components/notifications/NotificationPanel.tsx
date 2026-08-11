'use client'

import { Bell, ShieldCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { FOCUS_RING } from '@/lib/ui/recipes'

export interface NotificationItem {
  id:          string
  type:        string
  title:       string
  body:        string | null
  entity_type: string | null
  entity_id:   string | null
  action_url:  string | null
  read_at:     string | null
  created_at:  string
}

interface NotificationPanelProps {
  notifications: NotificationItem[]
  loadError:     string | null
  onMarkAllRead: () => void
  onSelect:      (notification: NotificationItem) => void
}

// 列表行在 overflow-y-auto 滚动容器内（§4 第二配方③），focus ring 用
// ring-inset 就地书写，不导入 FOCUS_RING（offset 变体在此会被裁切）。
const ROW_FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset'

function relativeTime(value: string, locale: string): string {
  const then = new Date(value).getTime()
  if (!Number.isFinite(then)) return ''

  const diffSeconds = Math.round((then - Date.now()) / 1000)
  const absSeconds = Math.abs(diffSeconds)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (absSeconds < 60) return formatter.format(diffSeconds, 'second')

  const diffMinutes = Math.round(diffSeconds / 60)
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute')

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour')

  const diffDays = Math.round(diffHours / 24)
  return formatter.format(diffDays, 'day')
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'approval_requested') {
    return <ShieldCheck className="w-4 h-4 text-warning-text" strokeWidth={1.5} />
  }
  return <Bell className="w-4 h-4 text-ink-400" strokeWidth={1.5} />
}

export default function NotificationPanel({
  notifications,
  loadError,
  onMarkAllRead,
  onSelect,
}: NotificationPanelProps) {
  const t = useTranslations('notifications')
  const locale = useLocale()
  const visibleNotifications = notifications.slice(0, 20)
  const hasUnread = notifications.some((notification) => !notification.read_at)

  return (
    // 弹层 z-index 判断（§3）：本面板只在 NotificationBell 的铃铛下拉里渲染
    // （唯一调用点），层级已由父组件的包裹 div 承担——z-40，属"下拉/
    // popover"档，不是 Toast（不是系统主动推送的浮层，而是点击铃铛后
    // 才展开的弹层），本文件自身不设 z-index。边框与阴影对齐同类浮层
    // 面板的既有写法（Sidebar 菜单、ForecastViewBar/FinanceForecastDashboard
    // 的下拉）：border-line + shadow-pop，而非表格给的 line-strong/
    // shadow-card 通用映射——那两个 token 是给静态卡片用的。
    <div className="w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-card border border-line bg-surface text-ink-900 shadow-pop">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
        <div className="min-w-0 text-sm font-semibold truncate">{t('title')}</div>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={!hasUnread}
          className={`rounded-field text-xs font-medium text-primary hover:text-primary-hover disabled:text-ink-400 disabled:hover:text-ink-400 ${FOCUS_RING}`}
        >
          {t('markAllRead')}
        </button>
      </div>

      {loadError ? (
        <div className="px-4 py-8 text-center text-sm text-danger-text">{loadError}</div>
      ) : visibleNotifications.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-ink-500">{t('empty')}</div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto py-1">
          {visibleNotifications.map((notification) => {
            const unread = !notification.read_at
            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => onSelect(notification)}
                className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-row-hover ${ROW_FOCUS_RING} ${
                  unread ? 'bg-primary-soft' : 'bg-surface'
                }`}
              >
                <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-icon bg-surface ring-1 ring-line">
                  <TypeIcon type={notification.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
                      {notification.title}
                    </span>
                    <span className="flex-shrink-0 text-[11px] text-ink-400">
                      {relativeTime(notification.created_at, locale)}
                    </span>
                  </span>
                  {notification.body && (
                    <span className="mt-1 line-clamp-2 text-xs leading-5 text-ink-700">
                      {notification.body}
                    </span>
                  )}
                  {notification.type === 'approval_requested' && (
                    <span className="mt-2 inline-flex rounded-btn bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning-text">
                      {t('types.approval_requested')}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
