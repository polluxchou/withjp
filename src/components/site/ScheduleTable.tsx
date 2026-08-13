export interface ScheduleRow {
  day: string
  program: string
  focus: string
  time: string
}

/* 第一列用固定 118px 而不是 fr：原来是 0.6fr，够放「MON」这种三字母曜日，
   但排期改成阶段计划后这一列装的是「DAY 11–15」「TIME SLOT」，按比例分到的
   72px 会把 7 行里的 5 行挤断成两行。这一列内容长度可预期，给足固定宽度，
   剩下的空间仍按比例分给后三列。 */
const COLS = 'lg:grid-cols-[118px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)]'

/** 配信排班表。窄屏下每行折成「阶段 + 时间」一行、内容一行、重点一行。 */
export default function ScheduleTable({
  rows,
  headers,
}: {
  rows: ScheduleRow[]
  headers: { day: string; program: string; focus: string; time: string }
}) {
  return (
    <div className="border border-site-line">
      <div
        className={`hidden gap-4 border-b border-site-line px-5 py-3.5 font-condensed text-[12px] tracking-[0.2em] text-site-fg/50 lg:grid ${COLS}`}
      >
        <span>{headers.day}</span>
        <span>{headers.program}</span>
        <span>{headers.focus}</span>
        <span>{headers.time}</span>
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className={`grid gap-x-4 gap-y-1 border-b border-site-line px-5 py-5 transition-colors last:border-b-0 hover:bg-site-panel lg:items-center ${COLS}`}
        >
          <div className="flex items-baseline justify-between gap-4 lg:contents">
            <span className="font-condensed text-[18px] tracking-[0.14em] text-site-accent">{row.day}</span>
            <span className="font-condensed text-[17px] tracking-[0.06em] lg:order-last">{row.time}</span>
          </div>
          <span className="text-[16px]">{row.program}</span>
          <span className="text-[14px] text-site-fg/60">{row.focus}</span>
        </div>
      ))}
    </div>
  )
}
