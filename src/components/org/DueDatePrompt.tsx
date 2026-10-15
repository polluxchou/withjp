'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { addDays, confirmAskedDate } from '@/lib/org/quadrant'
import type { ItemPatch } from '@/lib/org/quadrant'

/**
 * 把紧急的事项拖进不紧急的一列时，先问新的截止日（spec 2.3）。
 * 「确定」只在日期合法且不早于下限时可点；取消 / Esc 不写入，事项留在原格。
 */
export default function DueDatePrompt({ plan, onConfirm, onCancel }: {
  plan: { base: ItemPatch; minDate: string }
  onConfirm: (patch: ItemPatch) => void
  onCancel: () => void
}) {
  const t = useTranslations('team')
  const tCommon = useTranslations('common')
  const [value, setValue] = useState(plan.minDate)
  const patch = confirmAskedDate(plan, value)
  const lastUrgentDay = addDays(plan.minDate, -1).slice(5)

  return (
    <Modal
      open
      onClose={onCancel}
      title={t('org.askDateTitle')}
      width="max-w-sm"
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel}>{tCommon('cancel')}</Button>
          <Button disabled={!patch} onClick={() => { if (patch) onConfirm(patch) }}>{t('org.confirm')}</Button>
        </>
      )}
    >
      <p className="text-sm text-ink-700">{t('org.askDateBody', { date: lastUrgentDay })}</p>
      <input
        type="date"
        aria-label={t('org.dueDate')}
        min={plan.minDate}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-3 h-11 w-full rounded-field border border-line bg-surface px-3 text-sm text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
      />
      {!patch && <p className="mt-2 text-xs text-danger-text">{t('org.askDateInvalid', { date: lastUrgentDay })}</p>}
    </Modal>
  )
}
