import Image from 'next/image'
import BlueprintFrame from './BlueprintFrame'

/**
 * 官网图片位。有图渲染 next/image，没图渲染蓝图占位框 + 说明文字 ——
 * 设计稿里本来就有一半图位是占位（夜景、着ぐるみ现场、配信截图还没拍），
 * 占位必须是「明确的待填框」而不是一块空洞。
 */
export default function SiteImage({
  src,
  alt,
  placeholder,
  duotone = false,
  priority = false,
  sizes = '100vw',
  objectPosition,
  className = '',
}: {
  src?: string
  alt?: string
  /** 无图时显示的说明（i18n 文案） */
  placeholder: string
  duotone?: boolean
  priority?: boolean
  sizes?: string
  objectPosition?: string
  className?: string
}) {
  return (
    // duotone 只在真有图时上：它的底色是青色、靠图片 multiply 上去才成立，
    // 没有图就只剩一块青色实底，占位说明也读不出来。
    <BlueprintFrame className={`overflow-hidden ${duotone && src ? 'site-duotone' : ''} ${className}`}>
      {src ? (
        <Image
          src={src}
          alt={alt ?? placeholder}
          fill
          sizes={sizes}
          priority={priority}
          style={objectPosition ? { objectPosition } : undefined}
          className="object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center p-6">
          <span className="text-center font-condensed text-[13px] tracking-[0.2em] text-site-fg/40">
            {placeholder}
          </span>
        </div>
      )}
    </BlueprintFrame>
  )
}
