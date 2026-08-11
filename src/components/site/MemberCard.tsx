import { GridCell } from './HairlineGrid'
import SiteImage from './SiteImage'

export interface Member {
  no: string
  name: string
  role: string
  /** 未公开的成员没有图，渲染蓝图占位框 */
  image?: string
}

export default function MemberCard({
  member,
  placeholder,
}: {
  member: Member
  placeholder: string
}) {
  return (
    <GridCell className="p-3.5">
      <div className="relative aspect-[3/4] w-full">
        <SiteImage
          src={member.image}
          alt={member.name}
          placeholder={placeholder}
          sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 45vw"
          className="h-full w-full"
        />
      </div>
      <div className="mt-3.5 font-condensed text-[12px] tracking-[0.18em] text-site-accent">{member.no}</div>
      <div className="mt-0.5 font-condensed text-[17px] tracking-[0.04em]">{member.name}</div>
      <div className="mt-px text-[13px] text-site-fg/60">{member.role}</div>
    </GridCell>
  )
}
