'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { nextPollDelay } from '@/lib/notifications/poll'
import NotificationPanel, { type NotificationItem } from './NotificationPanel'

interface NotificationBellProps {
  collapsed?: boolean
}

interface NotificationsResponse {
  data?:         NotificationItem[]
  unread_count?: number
  error?:        string | null
}

export default function NotificationBell({ collapsed = false }: NotificationBellProps) {
  const t = useTranslations('notifications')
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const inFlightRef = useRef(false)
  const failuresRef = useRef(0)

  const loadNotifications = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      const json = (await res.json()) as NotificationsResponse
      if (!res.ok || json.error) throw new Error(json.error ?? 'load failed')

      setNotifications(json.data ?? [])
      setUnreadCount(json.unread_count ?? 0)
      setLoadFailed(false)
      failuresRef.current = 0
    } catch {
      setLoadFailed(true)
      failuresRef.current += 1
    } finally {
      inFlightRef.current = false
    }
  }, [])

  // 自调度轮询:连续失败按 nextPollDelay 指数退避;页面隐藏时只空转不发请求,
  // 回到前台立即刷新。scheduleNext 先 clearTimeout,保证任何时刻只有一条定时链。
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const scheduleNext = (delay: number) => {
      if (cancelled) return
      window.clearTimeout(timer)
      timer = window.setTimeout(tick, delay)
    }
    const tick = async () => {
      if (!document.hidden) await loadNotifications()
      scheduleNext(nextPollDelay(failuresRef.current))
    }
    const onVisibilityChange = () => {
      if (!document.hidden) scheduleNext(0)
    }

    void tick()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loadNotifications])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const markAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'PATCH' })
      if (!res.ok) throw new Error('mark all failed')
      const readAt = new Date().toISOString()
      setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at ?? readAt })))
      setUnreadCount(0)
    } catch {
      setLoadFailed(true)
    }
  }

  const selectNotification = async (notification: NotificationItem) => {
    const wasUnread = !notification.read_at
    try {
      const res = await fetch(`/api/notifications/${notification.id}/read`, { method: 'PATCH' })
      if (!res.ok) throw new Error('mark read failed')
      const json = (await res.json()) as { data?: { read_at?: string } }
      const readAt = json.data?.read_at ?? new Date().toISOString()

      setNotifications((items) =>
        items.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item),
      )
      if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1))
      setOpen(false)

      if (notification.action_url?.startsWith('/')) {
        router.push(notification.action_url)
      }
    } catch {
      setLoadFailed(true)
    }
  }

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={collapsed ? t('title') : undefined}
        aria-label={t('title')}
        className={`relative flex w-full items-center rounded-field text-sm font-medium text-ink-500 transition-colors hover:bg-line-soft hover:text-ink-900 ${
          collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
        }`}
      >
        <span className="relative flex h-4 w-4 flex-shrink-0 items-center justify-center">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-semibold leading-none text-white">
              {badgeLabel}
            </span>
          )}
        </span>
        {!collapsed && <span className="truncate">{t('title')}</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 lg:bottom-0 lg:left-full lg:mb-0 lg:ml-2">
          <NotificationPanel
            notifications={notifications}
            loadError={loadFailed ? t('loadFailed') : null}
            onMarkAllRead={markAllRead}
            onSelect={selectNotification}
          />
        </div>
      )}
    </div>
  )
}
