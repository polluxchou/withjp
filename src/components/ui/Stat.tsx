import type { ReactNode } from 'react'

interface StatProps {
  label: string
  value: ReactNode
  // value 为 ReactNode，无法自动判定负数——负值由调用方显式传 tone="danger"。
  delta?: { text: string; tone?: 'success' | 'danger' }
  note?: string
  tone?: 'default' | 'danger'
}

export function Stat({ label, value, delta, note, tone = 'default' }: StatProps) {
  return (
    <div className="flex-1 min-w-fit px-5 py-4 border-r border-line-soft last:border-r-0">
      <div className="text-xs text-ink-500 mb-1.5 truncate">{label}</div>
      <div className={`text-2xl font-bold tracking-kpi tabular-nums truncate ${tone === 'danger' ? 'text-danger-text' : 'text-ink-900'}`}>{value}</div>
      {(delta || note) && (
        <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
          {delta && <span className={`text-micro font-semibold px-1.5 py-px rounded-btn ${delta.tone === 'danger' ? 'bg-danger-soft text-danger-text' : 'bg-success-soft text-success-text'}`}>{delta.text}</span>}
          {note && <span className="text-micro text-ink-400 truncate">{note}</span>}
        </div>
      )}
    </div>
  )
}

// overflow-x-auto 单独设置时，CSS 规范会把 overflow-y 的计算值从 visible
// 提升为 auto（spec: 一轴非 visible 时另一轴的 visible 计算为 auto），所以
// 这里不加 overflow-y-visible——加了也不会真正生效，反而误导读者以为纵向
// 溢出可见。结论：横向可横滚，纵向永远被裁切为 auto 行为——弹层/下拉菜单
// 不要挂在 Stat 内部（会被裁切），需要时挂载到 StatBand 外层或用 portal。
//
// 375px 下横向溢出已验证：用 tailwindcss CLI 以本文件同款 class 编译出
// 独立静态页，375 视口下量得 scrollWidth > clientWidth，且截图可见横向
// 滚动条与被裁切的卡片——StatBand 的 overflow-x-auto 按预期生效。
//
// 宽度取舍：min-w-[9rem]（统一 144px 格宽）会把长金额钉死在固定宽度内
// 裁切——实测 ¥1,284,560 需要约 131px 可见区却只给 104px（padding 后），
// 数字被截断违反"数字不可截断"的红线。改用 min-w-fit：放弃 106-172px
// 的统一格宽观感，换取任意长值零裁切；短值格子会随内容自然收窄，
// 视觉参差由 StatBand 的横向滚动兜底（见下方验证）。
export function StatBand({ children }: { children: ReactNode }) {
  return <div className="flex bg-surface border border-line rounded-card shadow-card overflow-x-auto">{children}</div>
}
