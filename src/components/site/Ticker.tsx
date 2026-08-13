/**
 * 跑马灯。轨道渲染 COPIES 份相同内容，动画把它向左平移恰好一份的宽度，
 * 于是第 k 份落到第 k-1 份的起点上，无限循环看不出接缝。
 *
 * 为什么是 6 份而不是 2 份：位移一份之后，右侧要靠剩下的 (COPIES-1) 份填满视口，
 * 所以无缝的前提是「(COPIES-1) × 单份宽 ≥ 视口宽」。原来只渲染 2 份，前提退化成
 * 「单份宽 ≥ 视口宽」—— 这就把无缝性绑在了文案长度上：旧文案单份 1470px，1440 屏
 * 刚好够而 1920 屏已经露空档；换成更短的文案后 1440 屏就开始露。6 份把余量拉到
 * 5 × 单份宽，文案怎么改、屏幕多宽都不会漏底。份数变化不影响观感速度，因为
 * 位移距离始终是一份（见 globals.css 的 site-ticker）。
 */
const COPIES = 6

export default function Ticker({ items }: { items: string[] }) {
  return (
    <div className="overflow-hidden border-b border-site-line bg-site-panel">
      <div
        className="site-ticker-track flex w-max animate-site-ticker py-3 font-condensed text-[14px] tracking-[0.26em] text-site-fg/60"
        style={{ '--site-ticker-copies': COPIES } as React.CSSProperties}
      >
        {Array.from({ length: COPIES }, (_, copy) => (
          <div key={copy} className="flex" aria-hidden={copy !== 0}>
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
