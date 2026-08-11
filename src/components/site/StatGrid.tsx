import HairlineGrid, { GridCell } from './HairlineGrid'

export interface Stat {
  value: string
  label: string
}

/** 首页 hero 下方的三格数字：压缩体大数字 + 一行说明。 */
export default function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <HairlineGrid cols={3}>
      {stats.map((stat, i) => (
        <GridCell key={i} className="px-5 py-[18px]">
          <div className="font-condensed text-[32px] leading-none text-site-accent">{stat.value}</div>
          <div className="mt-1.5 text-[12px] tracking-[0.08em] text-site-fg/60">{stat.label}</div>
        </GridCell>
      ))}
    </HairlineGrid>
  )
}
