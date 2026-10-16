'use client'

import { useTranslations } from 'next-intl'
import { Box, Building2, Layers, Map as MapIcon } from 'lucide-react'

export default function ToolRail({ activeFloor }: { activeFloor: string }) {
  const t = useTranslations('venue')
  const tools = [
    { key: 'venues', icon: Building2, label: t('railVenues') },
    { key: 'areas', icon: MapIcon, label: t('railAreas') },
    { key: 'library', icon: Box, label: t('railLibrary') },
    { key: 'layers', icon: Layers, label: t('railLayers') },
  ]

  return (
    <aside className="bg-surface border-r border-line py-3 flex flex-col items-center gap-2">
      {tools.map(({ key, icon: Icon, label }, index) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-label={label}
          className={`w-11 h-11 rounded-card inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1 ${
            index === 0 ? 'bg-primary-soft text-primary-hover' : 'text-ink-500 hover:bg-line-soft hover:text-ink-900'
          }`}
        >
          <Icon className="w-5 h-5" strokeWidth={1.5} />
        </button>
      ))}
      <div className="flex-1" />
      <div className="w-10 min-h-10 rounded-field bg-line-soft text-micro font-semibold text-ink-500 flex items-center justify-center">
        {activeFloor}
      </div>
    </aside>
  )
}
