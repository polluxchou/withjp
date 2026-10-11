// src/components/competitors/live/useRegionZone.ts
'use client'

import { useLocale, useTranslations } from 'next-intl'
import { regionTimeZone } from '@/lib/competitors/liveSessions'
import { normalizeRegion } from '@/lib/competitors/regions'
import { timeZoneForLocale } from '@/lib/time/localeZone'

/**
 * 竞品开播时刻的显示时区与时区名。卡片、开播记录弹窗、截图灯箱、地区标尺、开播时段页共用这一份推导，
 * 免得几处各写一遍、哪天改了一处没改另一处，同一场直播在两个地方报出两个钟点。
 *
 * - timeZone：账号所在地区的时区（看的是对方当地作息，且与界面语言无关，三地同事读到同一个数）；
 *   地区没填或不在清单里才回落到界面语言的时区。
 * - zoneLabel：地区在清单里时的时区名（「日本时间」）。回落到界面语言时区时为 null——
 *   那时没有对应的地区时区名可报，宁可不写也不写错。
 */
export function useRegionZone(region: string | null | undefined): { timeZone: string; zoneLabel: string | null } {
  const t = useTranslations('competitors')
  const locale = useLocale()
  const code = normalizeRegion(region)
  return {
    timeZone: regionTimeZone(region, timeZoneForLocale(locale)),
    zoneLabel: code ? t(`zoneName.${code}`) : null,
  }
}
