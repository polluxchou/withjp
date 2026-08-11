export interface ScheduleRow {
  day: string
  program: string
  cast: string
  time: string
}

const COLS = 'lg:grid-cols-[minmax(0,0.6fr)_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)]'

/** 配信排班表。窄屏下每行折成「曜日 + 时间」一行、节目名一行、出演一行。 */
export default function ScheduleTable({
  rows,
  headers,
}: {
  rows: ScheduleRow[]
  headers: { day: string; program: string; cast: string; time: string }
}) {
  return (
    <div className="border border-site-line">
      <div
        className={`hidden gap-4 border-b border-site-line px-5 py-3.5 font-condensed text-[12px] tracking-[0.2em] text-site-fg/50 lg:grid ${COLS}`}
      >
        <span>{headers.day}</span>
        <span>{headers.program}</span>
        <span>{headers.cast}</span>
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
          <span className="text-[14px] text-site-fg/60">{row.cast}</span>
        </div>
      ))}
    </div>
  )
}
