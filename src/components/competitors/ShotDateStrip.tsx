// src/components/competitors/ShotDateStrip.tsx
'use client'

import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SHOT_WINDOW_SIZE, UNDATED_KEY } from '@/lib/competitors/shotGrid'

export default function ShotDateStrip({
  axis, dateWindow, selectedDate, onPick,
}: {
  axis: string[]
  dateWindow: string[]
  selectedDate: string | null
  onPick: (date: string) => void
}) {
  const t = useTranslations('competitors')
  // dateWindow 才是渲染依据,axis 非空不代表窗口非空
  if (axis.length === 0 || dateWindow.length === 0) return null

  const first = dateWindow[0]
  const last = dateWindow[dateWindow.length - 1]
  const atStart = axis.indexOf(first) <= 0
  const atEnd = axis.indexOf(last) >= axis.length - 1

  // 整屏翻,且连选中的那天一起挪 —— 高亮永远留在屏幕上。
  // 轴上累积几个月后逐天点会点到手废。
  const step = (direction: -1 | 1) => {
    const anchor = selectedDate ?? last
    const target = axis.indexOf(anchor) + direction * dateWindow.length
    const next = axis[Math.min(Math.max(target, 0), axis.length - 1)]
    if (next) onPick(next)
  }

  return (
    // 外层 px-4 对齐卡片的 p-4,内层轨道必须与卡片正文网格**逐字一致**:
    // CompetitorCard 的 minmax(0,2fr)/minmax(0,3fr) + gap-3 + max-lg 断点。
    // 这是必须的:格子里不显示任何日期文字,日期条是屏幕上唯一能看到日期的地方,
    // chip 必须正好落在它标注的那一列上方,否则用户只能靠数格子来对应。
    // 卡片那边动列宽或动断点,这里要跟着动 —— PR 282 把卡片从 1fr/2fr 调成
    // 2fr/3fr 时漏了这一层,1280px 下日期 chip 整体左偏 132px(实测格心
    // 471/620/768/917/1066 对相册 604/723/842/961/1080),等于指着隔壁列念日期;
    // 断点也曾错开一档(卡片 max-lg 单列、这里还是 max-md 两列),768-1023px 整段偏。
    // 吸顶不在这一层做:日期轴和账号导航条要作为一整块吸顶(否则两个
    // sticky top-0 会叠在一起),吸顶容器与不透明底色都提到
    // CompetitorDossierView 的 [data-sticky-head] 上。
    <div className="px-4 py-2">
      <div
        className="relative grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 max-lg:grid-cols-1"
        role="group"
        aria-label={t('shotDates')}
      >
        {/* lg 起:翻页键待在左侧标签列(与卡片曲线列同宽)的右端,紧挨着它翻的日期。
            lg 以下标签列消失,翻页键不能再自己占一行 —— 手机上吸顶块已经有
            搜索、账号芯片、日期三行,再加一行就吃掉近 1/5 屏;而且它孤零零悬在
            芯片正下方,会被读成「左右切换账号」。所以改成绝对定位浮在日期行两端,
            并用负边距挪进外层 px-4 的留白里:日期网格因此保持满宽,与相册的 5 列
            严格对齐(一旦让翻页键占宽,chip 就整体内缩、对不上列)。
            pointer-events 只在 lg 以下需要:容器铺满整行,不放行的话中间的日期点不动。*/}
        <div className="flex items-center justify-end gap-1 max-lg:pointer-events-none max-lg:absolute max-lg:inset-0 max-lg:justify-between">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={atStart}
            aria-label={t('earlierDates')}
            className="rounded border border-line px-1 py-1 text-ink-500 hover:text-ink-900 disabled:opacity-40 max-lg:pointer-events-auto max-lg:-ml-4"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={atEnd}
            aria-label={t('laterDates')}
            className="rounded border border-line px-1 py-1 text-ink-500 hover:text-ink-900 disabled:opacity-40 max-lg:pointer-events-auto max-lg:-mr-4"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${SHOT_WINDOW_SIZE}, minmax(0, 1fr))` }}>
          {dateWindow.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={d === selectedDate}
              title={d === UNDATED_KEY ? undefined : d}
              aria-label={d === UNDATED_KEY ? undefined : d}
              className={`truncate rounded px-1 py-1 text-center text-[11px] ${
                d === selectedDate
                  ? 'bg-primary-soft text-primary'
                  : 'text-ink-500 hover:bg-row-hover'
              }`}
            >
              {d === UNDATED_KEY ? t('undated') : d.slice(5)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
