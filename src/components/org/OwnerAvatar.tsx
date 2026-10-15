import { User } from 'lucide-react'
import { ownerInitials, ownerTone } from '@/lib/org/ownerAvatar'
import type { AvatarTone } from '@/lib/org/ownerAvatar'
import type { OwnerKey } from '@/lib/org/quadrant'

// 整串类名写死，Tailwind 才扫得到。neutral 没有 border token，用 line。
const TONE: Record<AvatarTone, string> = {
  info: 'border-info-border bg-info-soft text-info-text',
  violet: 'border-primary-border bg-primary-soft text-primary-hover',
  success: 'border-success-border bg-success-soft text-success-text',
  neutral: 'border-line bg-muted-soft text-muted-text',
}
const SIZE = {
  sm: { box: 'h-6 w-6 text-micro', icon: 'h-3 w-3' },
  md: { box: 'h-7 w-7 text-xs', icon: 'h-3.5 w-3.5' },
}

interface Props {
  ownerKey: OwnerKey
  name: string | null
  size?: keyof typeof SIZE
}

// 负责人文字头像。旁边总跟着姓名，所以整体 aria-hidden，只做视觉辨认。
// 未指派：空的虚线圆，沿用「未指派」的 warning 色；取不到字：通用人像图标，颜色仍按人。
export default function OwnerAvatar({ ownerKey, name, size = 'md' }: Props) {
  const s = SIZE[size]
  const tone = ownerTone(ownerKey)
  if (!tone) {
    return <span aria-hidden className={`inline-block flex-none rounded-full border border-dashed border-warning-dot ${s.box}`} />
  }
  const text = ownerInitials(name)
  return (
    <span
      aria-hidden
      className={`inline-flex flex-none select-none items-center justify-center rounded-full border font-semibold leading-none ${TONE[tone]} ${s.box}`}
    >
      {text ?? <User className={s.icon} strokeWidth={2} />}
    </span>
  )
}
