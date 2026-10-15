'use client'

import { useState } from 'react'
import OrgView from './OrgView'
import PersonPicker, { type PickerRequest } from './PersonPicker'
import { useOrgSnapshot } from './useOrgSnapshot'
import type { OrgSnapshot } from '@/lib/types'

/** 业务分工页的客户端根：持有共享快照与选人弹窗，分发给各视图。 */
export default function OrgPageView({ initial }: { initial: OrgSnapshot }) {
  const { snapshot, actions } = useOrgSnapshot(initial)
  const [picker, setPicker] = useState<PickerRequest | null>(null)
  return (
    <>
      <OrgView snapshot={snapshot} actions={actions} onPick={setPicker} />
      {picker && <PersonPicker request={picker} people={snapshot.people} onClose={() => setPicker(null)} />}
    </>
  )
}
