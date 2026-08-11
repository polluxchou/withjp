export interface StudioMapLabels {
  station: string
  walk: string
  studio: string
  areaEn: string
  areaJp: string
  north: string
  axis: string
  alt: string
}

/**
 * 新大阪一带的示意图。不是真实地图（也刻意不放精确地址——来访是完全预约制），
 * 只交代「车站在哪、工作室在哪、走多久」三件事，画成图纸质感。
 *
 * 几何全是百分比 + rotate 的绝对定位，所以用内联 style 而不是类名；颜色一律
 * 引用 globals.css 里 --site-map-* 变量：这块构件在深浅两个主题下都保持深色，
 * 它的白色透明度不跟随 --site-fg 翻转。
 *
 * role=img + aria-label：里面的斜带和虚线对读屏用户没有意义，一句话说明位置
 * 关系比逐个念标签有用。
 */
export default function StudioMap({ labels }: { labels: StudioMapLabels }) {
  return (
    <div
      role="img"
      aria-label={labels.alt}
      className="relative min-h-[360px] overflow-hidden border-t border-site-line-strong lg:min-h-[420px] lg:border-l lg:border-t-0"
      style={{ background: 'var(--site-map-bg)' }}
    >
      {/* 图纸网格 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(var(--site-map-grid) 1px, transparent 1px), linear-gradient(90deg, var(--site-map-grid) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
        }}
      />

      {/* 铁道（斜带 + 虚线轨） */}
      <div
        className="absolute h-[26px]"
        style={{
          left: '-6%',
          top: '16%',
          width: '112%',
          background: 'var(--site-map-road)',
          borderTop: '1px solid var(--site-map-line)',
          borderBottom: '1px solid var(--site-map-line)',
          transform: 'rotate(-7deg)',
        }}
      />
      <div
        className="absolute h-0.5 opacity-55"
        style={{
          left: '-6%',
          top: '16.6%',
          width: '112%',
          background:
            'repeating-linear-gradient(90deg, var(--site-map-accent) 0 14px, transparent 14px 26px)',
          transform: 'rotate(-7deg)',
        }}
      />
      {/* 纵向道路 */}
      <div
        className="absolute w-[22px]"
        style={{
          left: '24%',
          top: '-8%',
          height: '120%',
          background: 'var(--site-map-road)',
          borderLeft: '1px solid var(--site-map-line)',
          borderRight: '1px solid var(--site-map-line)',
          transform: 'rotate(6deg)',
        }}
      />
      {/* 横向街区带 */}
      <div
        className="absolute left-0 h-4 w-full"
        style={{ top: '62%', background: 'var(--site-map-band)' }}
      />

      {/* 车站 */}
      <div className="absolute flex items-center gap-2" style={{ left: '58%', top: '11%' }}>
        <i
          className="block h-[13px] w-[13px]"
          style={{ background: 'var(--site-map-accent)', border: '2px solid var(--site-map-bg)' }}
        />
        <span
          className="font-condensed text-[14px] tracking-[0.14em]"
          style={{ color: 'var(--site-map-accent)' }}
        >
          {labels.station}
        </span>
      </div>

      {/* 步行路径（直角虚线）+ 距离 */}
      <div
        className="absolute"
        style={{
          left: '24%',
          top: '24%',
          width: '38%',
          height: '34%',
          borderRight: '1px dashed var(--site-map-dash)',
          borderBottom: '1px dashed var(--site-map-dash)',
        }}
      />
      <div
        className="absolute font-condensed text-[12px] tracking-[0.18em]"
        style={{ left: '27%', top: '50%', color: 'var(--site-map-ink-soft)' }}
      >
        {labels.walk}
      </div>

      {/* 工作室 */}
      <div className="absolute flex items-center gap-2.5" style={{ left: '13%', top: '55%' }}>
        <span className="relative block h-[18px] w-[18px]">
          <i className="absolute inset-0 block bg-site-hot opacity-90" />
          <i className="absolute -inset-[7px] block border border-site-hot opacity-50" />
        </span>
        <span
          className="font-condensed text-[15px] tracking-[0.14em]"
          style={{ color: 'var(--site-map-ink)' }}
        >
          {labels.studio}
        </span>
      </div>

      {/* 图例 */}
      <div
        className="absolute bottom-6 left-6 px-4 py-3"
        style={{ background: 'var(--site-map-bg)', border: '1px solid var(--site-map-edge)' }}
      >
        <div
          className="font-condensed text-[11px] tracking-[0.2em]"
          style={{ color: 'var(--site-map-ink-soft)' }}
        >
          {labels.areaEn}
        </div>
        <div className="mt-1 text-[13px]" style={{ color: 'var(--site-map-ink)' }}>
          {labels.areaJp}
        </div>
      </div>

      {/* 指北针 */}
      <div
        className="absolute right-6 top-6 text-right font-condensed text-[12px] tracking-[0.2em]"
        style={{ color: 'var(--site-map-ink-soft)' }}
      >
        <div>{labels.north}</div>
        <div className="mt-1">{labels.axis}</div>
      </div>

      {/* 在图纸上呼吸的「正在运营」感，与首页 hero 的脉冲点同一语汇 */}
      <div className="absolute bottom-6 right-6">
        <i
          aria-hidden
          className="site-pulse block h-2 w-2 animate-site-pulse"
          style={{ background: 'var(--site-map-accent)' }}
        />
      </div>
    </div>
  )
}
