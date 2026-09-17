'use client'

import { AlertTriangle, User } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface ExpenseGroupHeaderProps {
  /** 按天是 03/28（跨年时 2026/12/30），按人是姓名。 */
  label: string
  count: number
  /** 已格式化的小计。showTotal 为假时不读。 */
  total: string
  showTotal: boolean
  overThreshold: boolean
  unassigned: boolean
  byBuyer: boolean
}

/**
 * 支出列表的分组抬头。把整组共有的那点信息（哪天 / 谁、几笔、合计多少）收在
 * 这里，行里就不必每条都重复一遍日期和经办人。
 */
export default function ExpenseGroupHeader({
  label, count, total, showTotal, overThreshold, unassigned, byBuyer,
}: ExpenseGroupHeaderProps) {
  const t = useTranslations('expenses')

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-1.5 bg-canvas border-t border-line-soft first:border-t-0">
      <span className="flex items-center gap-1.5 min-w-0 text-xs">
        {byBuyer && <User className="w-3.5 h-3.5 text-ink-400 flex-none" aria-hidden />}
        <span className={`font-semibold truncate min-w-0 ${unassigned ? 'text-ink-400' : 'text-ink-700'} ${byBuyer ? '' : 'font-mono'}`}>
          {unassigned ? t('group.unassignedBuyer') : label}
        </span>
        <span className="text-ink-400 flex-none">· {t('group.count', { count })}</span>
      </span>

      {showTotal && (
        <span
          className={`flex items-center gap-1 flex-none text-xs font-semibold font-mono tabular-nums ${overThreshold ? 'text-danger-text' : 'text-ink-700'}`}
          title={overThreshold ? t('group.dailyAlertTitle') : undefined}
        >
          {overThreshold && <AlertTriangle className="w-3.5 h-3.5" aria-hidden />}
          {total}
        </span>
      )}
    </div>
  )
}
