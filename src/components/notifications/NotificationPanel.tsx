'use client'

import { Bell, ShieldCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

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
    return <ShieldCheck className="w-4 h-4 text-amber-500" />
  }
  return <Bell className="w-4 h-4 text-zinc-400" />
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
    <div className="w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div className="min-w-0 text-sm font-semibold truncate">{t('title')}</div>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={!hasUnread}
          className="text-xs font-medium text-primary hover:text-primary-hover disabled:text-zinc-300 disabled:hover:text-zinc-300"
        >
          {t('markAllRead')}
        </button>
      </div>

      {loadError ? (
        <div className="px-4 py-8 text-center text-sm text-red-600">{loadError}</div>
      ) : visibleNotifications.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-500">{t('empty')}</div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto py-1">
          {visibleNotifications.map((notification) => {
            const unread = !notification.read_at
            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => onSelect(notification)}
                className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-100 ${
                  unread ? 'bg-primary-soft/80' : 'bg-white'
                }`}
              >
                <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-zinc-200">
                  <TypeIcon type={notification.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
                      {notification.title}
                    </span>
                    <span className="flex-shrink-0 text-[11px] text-zinc-500">
                      {relativeTime(notification.created_at, locale)}
                    </span>
                  </span>
                  {notification.body && (
                    <span className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-600">
                      {notification.body}
                    </span>
                  )}
                  {notification.type === 'approval_requested' && (
                    <span className="mt-2 inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
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
