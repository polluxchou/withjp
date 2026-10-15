'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import SegmentedControl from '@/components/ui/SegmentedControl'
import OrgView from './OrgView'
import QuadrantView from './QuadrantView'
import PersonPicker, { type PickerRequest } from './PersonPicker'
import { writeSearchParams } from './searchParams'
import { useOrgSnapshot } from './useOrgSnapshot'
import type { OrgSnapshot } from '@/lib/types'

/** 业务分工页的客户端根：持有共享快照与选人弹窗，按 ?view= 切「四象限」（默认）/「结构」。 */
export default function OrgPageView({ initial, today }: { initial: OrgSnapshot; today: string }) {
  const t = useTranslations('team')
  const params = useSearchParams()
  const view = params.get('view') === 'structure' ? 'structure' : 'quadrant'
  const { snapshot, actions } = useOrgSnapshot(initial)
  const [picker, setPicker] = useState<PickerRequest | null>(null)

  const setView = (v: string) => writeSearchParams({ view: v === 'structure' ? 'structure' : null, q: null }, 'replace')
  const pickItemOwner = (itemId: string) =>
    setPicker({ title: t('org.setOwner'), allowClear: true, onSelect: (p) => { actions.setItemOwner(itemId, p) } })

  return (
    <div className="space-y-4">
      <SegmentedControl
        label={t('org.viewLabel')}
        touch
        value={view}
        onChange={setView}
        items={[
          { value: 'quadrant', label: t('org.viewQuadrant') },
          { value: 'structure', label: t('org.viewStructure') },
        ]}
      />
      {view === 'quadrant'
        ? <QuadrantView snapshot={snapshot} today={today} onUpdateItem={actions.updateItemFields} onPickOwner={pickItemOwner} />
        : <OrgView snapshot={snapshot} actions={actions} onPick={setPicker} />}
      {picker && <PersonPicker request={picker} people={snapshot.people} onClose={() => setPicker(null)} />}
    </div>
  )
}
