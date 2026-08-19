import type { AriaAttributes, ReactNode } from 'react'

interface StatProps {
  label: string
  value: ReactNode
  // value 为 ReactNode，无法自动判定负数——负值由调用方显式传 tone="danger"。
  delta?: { text: string; tone?: 'success' | 'danger' }
  note?: string
  tone?: 'default' | 'danger'
  // 可选：整卡可点击（列表页 KPI 常见"点击筛选，再点一次清除"交互）。传入时
  // 根节点渲染为真正的 <button>（键盘可达 + focus ring），不传时保持纯展示
  // <div>——两种形态视觉完全一致，只是语义/可交互性不同。
  onClick?: () => void
  // 可选：toggle 语义的按下态（渲染 aria-pressed）。与 onClick 独立传——有些
  // 调用方（如弹层触发器）需要 aria-haspopup/aria-expanded 而非 aria-pressed，
  // 走 ariaProps 单独透传，两者不互斥。
  pressed?: boolean
  // 逃生舱：调用方需要 Stat 未内置的 aria-* 属性（如弹层触发器的
  // aria-haspopup/aria-expanded）时透传给根 button，不为这些一次性场景
  // 单独开 prop。仅在 onClick 存在（根节点是 button）时有意义。
  ariaProps?: AriaAttributes
}

export function Stat({ label, value, delta, note, tone = 'default', onClick, pressed, ariaProps }: StatProps) {
  const Root = onClick ? 'button' : 'div'
  return (
    <Root
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick && pressed !== undefined ? pressed : undefined}
      {...(onClick ? ariaProps : undefined)}
      // w-full：非 flex 上下文（调用方需要自己包一层 div 承载弹层定位时，Stat
      // 就不再是 StatBand 的直接 flex 子项）下，button/div 默认收缩到内容宽度，
      // 留出一大片视觉在卡片内、实际点不中的死区。flex-1 在真正的 flex 容器
      // （StatBand 本身）里已经决定尺寸，w-full 在那种场景是无操作的安全值。
      // 分隔线只在 md+ 由自己画：窄屏是 2 列网格，竖/横分隔线都得看"第几格"，
      // 只有容器数得清，Stat 自己数不出来（见 StatBand 上方的说明）。两侧都带
      // 断点前缀，同一属性绝不出现两条无前缀的候选类。
      // min-w-fit 同理只在 md+ 生效：网格列里它会把列撑宽、把横向溢出推到整页。
      className={`w-full flex-1 min-w-0 px-4 py-3.5 text-left sm:px-5 sm:py-4 md:min-w-fit md:border-r md:border-line-soft md:last:border-r-0 ${
        onClick ? 'transition-colors hover:bg-row-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset' : ''
      }`}
    >
      <div className="text-xs text-ink-500 mb-1.5 truncate">{label}</div>
      {/* 手机上降一档到 text-xl：375px 下每格净宽约 155px，text-2xl 的 ¥1,284,560
          这类长金额会顶到 truncate（"数字不可截断"是红线），降一档后留出余量。 */}
      <div className={`text-xl sm:text-2xl font-bold tracking-kpi tabular-nums truncate ${tone === 'danger' ? 'text-danger-text' : 'text-ink-900'}`}>{value}</div>
      {(delta || note) && (
        <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
          {delta && <span className={`text-micro font-semibold px-1.5 py-px rounded-btn ${delta.tone === 'danger' ? 'bg-danger-soft text-danger-text' : 'bg-success-soft text-success-text'}`}>{delta.text}</span>}
          {note && <span className="text-micro text-ink-400 truncate">{note}</span>}
        </div>
      )}
    </Root>
  )
}

// 窄屏（<768px）走 2 列换行网格，桌面仍是单行横滑：4 格在 375px 下单行需要
// 横向拖动条才看得全，而横滚条在手机上是很"PC"的交互。换行后不再有滚动容器，
// 所以 overflow-x-auto 也收进 md:。断点取 md 而不是 sm：640px 恢复单行时 4 格
// 各需约 184px（min-w-fit + text-2xl 的 10 位日期），合计 736px 又会溢出，横滚条
// 会在 640–740px 之间回来。
//
// 网格模式的分隔线全部由本容器发（Stat 自己那份加了 md: 前缀）：谁该画竖线、
// 谁该画横线取决于"第几格"，只有容器数得清。两种模式各自锁在 max-md: / md:
// 里，同一属性永不出现两条同权重的候选类——那种情况下谁生效由 Tailwind 生成
// 顺序决定、不看书写顺序（FilterChip 踩过一次）。
//
// 行数随格数变（在用的 StatBand 有 2/3/4/5 格），所以横线规则从"头"数不从"尾"
// 数：每格都画上边线、再撤掉永远属于首行的前两格，就不必判断总数奇偶。奇数格
// 时最后一格独占整行（否则右半格空着像掉了一格），它的右边线会压在卡片外框上，
// 单独撤掉。
//
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
// 视觉参差由 StatBand 的横向滚动兜底（见下方验证）。以上只在 md+ 成立——
// 窄屏是等宽网格列，min-w-fit 会把列撑宽、把横向溢出推到整页，故降级为 min-w-0
// ＋值降一档字号来保住“数字不可截断”。
const BAND_MOBILE_GRID = [
  'max-md:grid max-md:grid-cols-2',
  'max-md:[&>*]:border-line-soft max-md:[&>*]:border-t',
  'max-md:[&>*:nth-child(-n+2)]:border-t-0',
  'max-md:[&>*:nth-child(odd)]:border-r',
  'max-md:[&>*:last-child:nth-child(odd)]:col-span-2',
  'max-md:[&>*:last-child:nth-child(odd)]:border-r-0',
].join(' ')

export function StatBand({ children }: { children: ReactNode }) {
  return (
    <div className={`bg-surface border border-line rounded-card shadow-card ${BAND_MOBILE_GRID} md:flex md:overflow-x-auto`}>
      {children}
    </div>
  )
}
