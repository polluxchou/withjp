'use client'

import { useTranslations } from 'next-intl'
import Tag from '@/components/ui/Tag'
import { toneOf } from '@/lib/ui/status-tone'
import type { CreatorStatus } from '@/lib/types'

interface Props {
  status: CreatorStatus
  size?: 'sm' | 'md'
}

// External props are frozen (dashboard/pipeline/creators all call this the
// same way) — only the internal rendering moved onto the shared Tag +
// toneOf('creator', …) registry (docs/design-system.md §1.3). 'live' is the
// one status the design registers as a dot (直播中 success(dot)); every
// other status renders the regular soft pill.
export default function LifecycleBadge({ status, size = 'md' }: Props) {
  const t = useTranslations('status')
  return (
    <Tag
      tone={toneOf('creator', status)}
      variant={status === 'live' ? 'dot' : 'soft'}
      label={t(status)}
      size={size}
    />
  )
}
