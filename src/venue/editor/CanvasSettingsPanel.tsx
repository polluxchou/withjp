'use client'

import { useTranslations } from 'next-intl'
import { Download, Image as ImageIcon } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import {
  centimetersToMeters,
  metersToCentimeters,
  type VenueFloor,
  type VenueItemType,
} from '@/venue/layoutData'
import TypeFilter from './TypeFilter'

// 属性面板未选中组件时的内容:画布尺寸/层高/底图(仅可编辑时)+ 类型筛选 + 导出。
export default function CanvasSettingsPanel({
  canEdit,
  floor,
  onFloorDefaultsChange,
  onBackgroundImageChange,
  visibleTypes,
  onVisibleTypesChange,
  onExportJson,
  onExportPng,
}: {
  canEdit: boolean
  floor: VenueFloor
  onFloorDefaultsChange: (patch: Pick<Partial<VenueFloor>, 'width' | 'height' | 'floorHeight'>) => void
  onBackgroundImageChange: (backgroundImage: string) => void
  visibleTypes: VenueItemType[]
  onVisibleTypesChange: (next: VenueItemType[]) => void
  onExportJson: () => void
  onExportPng: () => void
}) {
  const t = useTranslations('venue')

  return (
    <div className="space-y-4">
      {canEdit && (
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-700">{t('canvasSettings')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('canvasWidth')}>
            <Input
              type="number" min="1" step="0.1"
              value={centimetersToMeters(floor.width)}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isFinite(value) && value > 0) onFloorDefaultsChange({ width: metersToCentimeters(value) })
              }}
              className="tabular-nums"
            />
          </Field>
          <Field label={t('canvasHeight')}>
            <Input
              type="number" min="1" step="0.1"
              value={centimetersToMeters(floor.height)}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isFinite(value) && value > 0) onFloorDefaultsChange({ height: metersToCentimeters(value) })
              }}
              className="tabular-nums"
            />
          </Field>
          <div className="col-span-2">
            <Field label={t('floorStoreyHeight')}>
              <Input
                type="number" min="1" step="0.1"
                value={centimetersToMeters(floor.floorHeight)}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isFinite(value) && value > 0) onFloorDefaultsChange({ floorHeight: metersToCentimeters(value) })
                }}
                className="tabular-nums"
              />
            </Field>
          </div>
        </div>
        <Field label={t('backgroundImage')}>
          <Input
            value={floor.backgroundImage ?? ''}
            onChange={(event) => onBackgroundImageChange(event.target.value)}
            placeholder={t('backgroundPlaceholder')}
          />
        </Field>
      </div>
      )}
      <div className="space-y-2">
        <TypeFilter visibleTypes={visibleTypes} onChange={onVisibleTypesChange} fullWidth />
        <Button variant="secondary" onClick={onExportJson} className="w-full justify-center">
          <Download className="w-4 h-4" strokeWidth={1.5} />
          {t('exportJson')}
        </Button>
        <Button variant="secondary" onClick={onExportPng} className="w-full justify-center">
          <ImageIcon className="w-4 h-4" strokeWidth={1.5} />
          {t('exportImage')}
        </Button>
      </div>
    </div>
  )
}
