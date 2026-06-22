import type { VenueItemType, VenueItemStatus, VenueLayout } from '@/venue/layoutData'

// 数据库行形态（text 主键，直接沿用画布的字符串 id）。
export interface VenueRow {
  id: string
  name: string
  width: number
  height: number
}

export interface VenueFloorRow {
  id: string
  venue_id: string
  name: string
  width: number
  height: number
  floor_height: number
  background_image: string | null
  sort_order: number
}

export interface VenueItemRow {
  id: string
  floor_id: string
  type: VenueItemType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  status: VenueItemStatus
  note: string
  height3d: number
  elevation: number
  z_index: number
}

// 嵌套布局 → 扁平行数组。sort_order / z_index 取数组下标，保留图层与楼层顺序。
export function layoutToRows(layout: VenueLayout): {
  venue: VenueRow
  floors: VenueFloorRow[]
  items: VenueItemRow[]
} {
  const venue: VenueRow = {
    id: layout.venueId,
    name: layout.name,
    width: layout.width,
    height: layout.height,
  }
  const floors: VenueFloorRow[] = layout.floors.map((floor, index) => ({
    id: floor.id,
    venue_id: layout.venueId,
    name: floor.name,
    width: floor.width,
    height: floor.height,
    floor_height: floor.floorHeight,
    background_image: floor.backgroundImage ?? null,
    sort_order: index,
  }))
  const items: VenueItemRow[] = layout.floors.flatMap((floor) =>
    floor.items.map((item, index) => ({
      id: item.id,
      floor_id: floor.id,
      type: item.type,
      name: item.name,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      status: item.status,
      note: item.note,
      height3d: item.height3d,
      elevation: item.elevation,
      z_index: index,
    })),
  )
  return { venue, floors, items }
}

// 扁平行数组 → 嵌套布局。按 sort_order / z_index 排序后组装。
export function rowsToLayout(
  venue: VenueRow,
  floors: VenueFloorRow[],
  items: VenueItemRow[],
): VenueLayout {
  const sortedFloors = [...floors].sort((a, b) => a.sort_order - b.sort_order)
  const sortedItems = [...items].sort((a, b) => a.z_index - b.z_index)

  return {
    venueId: venue.id,
    name: venue.name,
    width: venue.width,
    height: venue.height,
    floors: sortedFloors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      width: floor.width,
      height: floor.height,
      floorHeight: floor.floor_height,
      ...(floor.background_image ? { backgroundImage: floor.background_image } : {}),
      items: sortedItems
        .filter((item) => item.floor_id === floor.id)
        .map((item) => {
          return {
            id: item.id,
            type: item.type,
            name: item.name,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            rotation: item.rotation,
            status: item.status,
            note: item.note,
            height3d: item.height3d,
            elevation: item.elevation,
          }
        }),
    })),
  }
}
