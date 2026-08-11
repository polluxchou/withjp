/**
 * 跑马灯。轨道渲染两份相同内容并向左平移 50%，到终点时第二份正好落在第一份
 * 的起点上，于是无限循环看不出接缝。
 */
export default function Ticker({ items }: { items: string[] }) {
  return (
    <div className="overflow-hidden border-b border-site-line bg-site-panel">
      <div className="site-ticker-track flex w-max animate-site-ticker py-3 font-condensed text-[14px] tracking-[0.26em] text-site-fg/60">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex" aria-hidden={copy === 1}>
            {items.map((item, i) => (
              <span key={`${copy}-${i}`} className="flex">
                <span className="px-[26px]">{item}</span>
                <span className="px-[26px] text-site-accent">＋</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
