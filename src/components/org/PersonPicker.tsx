'use client'

import { useTranslations } from 'next-intl'
import Modal from '@/components/ui/Modal'
import Tag from '@/components/ui/Tag'
import type { PersonOption } from '@/lib/types'

export interface PickerRequest {
  title: string
  allowClear: boolean
  onSelect: (person: PersonOption | null) => void
}

export default function PersonPicker({ request, people, onClose }: {
  request: PickerRequest
  people: PersonOption[]
  onClose: () => void
}) {
  const t = useTranslations('team')
  return (
    <Modal open onClose={onClose} title={request.title}>
      <div className="space-y-1.5">
        {request.allowClear && (
          <button
            type="button"
            onClick={() => { request.onSelect(null); onClose() }}
            className="w-full text-left flex items-center px-3 py-2.5 rounded-field border border-line text-sm text-ink-500 hover:bg-line-soft hover:border-line-strong transition-colors"
          >
            {t('org.clearOwner')}
          </button>
        )}
        {people.map((p) => (
          <button
            key={`${p.member_type}:${p.id}`}
            type="button"
            onClick={() => { request.onSelect(p); onClose() }}
            className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-field border border-line text-sm text-ink-700 hover:bg-line-soft hover:border-line-strong transition-colors"
          >
            <Tag
              size="sm"
              tone={p.member_type === 'creator' ? 'violet' : 'neutral'}
              label={p.member_type === 'creator' ? t('org.sourceCreator') : t('org.sourceUser')}
            />
            <span className="font-medium text-ink-900">{p.name}</span>
          </button>
        ))}
        {people.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-400">{t('org.empty')}</p>
        )}
      </div>
    </Modal>
  )
}
