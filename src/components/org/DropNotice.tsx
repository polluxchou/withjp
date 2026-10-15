'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

/** 拖放后的提示条（spec 4.2）：5 秒后自动消失；有旧值时提供「撤销」。onDismiss 须是稳定引用。 */
export default function DropNotice({ message, canUndo, onUndo, onDismiss }: {
  message: string
  canUndo: boolean
  onUndo: () => void
  onDismiss: () => void
}) {
  const t = useTranslations('team')
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-card bg-ink-900 py-1.5 pl-4 pr-2 text-sm text-surface shadow-pop">
        <span className="min-w-0">{message}</span>
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="min-h-11 flex-none rounded-field px-3 font-semibold text-surface underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
          >
            {t('org.undo')}
          </button>
        )}
      </div>
    </div>
  )
}
