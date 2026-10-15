'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import SegmentedControl from '@/components/ui/SegmentedControl'
import OrgView from './OrgView'
import QuadrantView from './QuadrantView'
import PersonPicker, { type PickerRequest } from './PersonPicker'
import { writeSearchParams } from './searchParams'
import { useOrgSnapshot } from './useOrgSnapshot'
import { useTokyoToday } from './useTokyoToday'
import { ownerToCarry, pageStop } from '@/lib/org/quadrant'
import type { OrgSnapshot } from '@/lib/types'

/** 业务分工页的客户端根：持有共享快照与选人弹窗，按 ?view= 切「四象限」（默认）/「结构」。 */
export default function OrgPageView({ initial, initialToday }: { initial: OrgSnapshot; initialToday: string }) {
  const t = useTranslations('team')
  const params = useSearchParams()
  const view = params.get('view') === 'structure' ? 'structure' : 'quadrant'
  const { snapshot, actions } = useOrgSnapshot(initial)
  const [picker, setPicker] = useState<PickerRequest | null>(null)
  const today = useTokyoToday(initialToday)

  // 负责人筛选跨层沿用：返回 / 前进手势落到的历史条目里可能还是旧筛选，换层后补写回来。
  // 放在页面根而不是 QuadrantView：切到「结构」再返回时 QuadrantView 会重新挂载，记不住切走前的筛选。
  const { layer, owner } = pageStop(params)
  const lastStop = useRef({ layer, owner })
  useEffect(() => {
    const carry = ownerToCarry(lastStop.current, { layer, owner })
    lastStop.current = { layer, owner: carry === undefined ? owner : carry }
    if (carry !== undefined) writeSearchParams({ owner: carry }, 'replace')
  }, [layer, owner])

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
        ? <QuadrantView snapshot={snapshot} today={today} onUpdateItem={actions.updateItemFields} onPickOwner={pickItemOwner} onRenameItem={actions.renameItem} />
        : <OrgView snapshot={snapshot} actions={actions} onPick={setPicker} />}
      {picker && <PersonPicker request={picker} people={snapshot.people} onClose={() => setPicker(null)} />}
    </div>
  )
}
