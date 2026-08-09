'use client'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import Button from './Button'

interface ErrorStateProps {
  title?: string
  detail?: string
  onRetry?: () => void
}

export default function ErrorState({ title, detail, onRetry }: ErrorStateProps) {
  const t = useTranslations('common')
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
      <div aria-hidden className="w-11 h-11 rounded-full bg-danger-soft text-danger-text flex items-center justify-center">
        <AlertTriangle className="w-[15px] h-[15px]" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-ink-700">{title ?? t('errorTitle')}</p>
      {detail && <p className="text-xs text-ink-400 max-w-72">{detail}</p>}
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{t('retry')}</Button>}
    </div>
  )
}
