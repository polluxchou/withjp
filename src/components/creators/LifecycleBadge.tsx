import { STATUS_COLOR, STATUS_LABEL } from '@/lib/state-machine/creator-lifecycle'
import type { CreatorStatus } from '@/lib/types'

interface Props {
  status: CreatorStatus
  size?: 'sm' | 'md'
}

export default function LifecycleBadge({ status, size = 'md' }: Props) {
  const { bg, text, dot } = STATUS_COLOR[status]
  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${bg} ${text} ${px}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}
