import {
  AppWindow,
  ArrowLeftRight,
  Building2,
  DoorClosed,
  DoorOpen,
  Flame,
  GitCommitHorizontal,
  Grid3X3,
  LampCeiling,
  LampFloor,
  Map as MapIcon,
  Monitor,
  Network,
  Octagon,
  Plug,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import {
  VENUE_ITEM_TYPE_OPTIONS,
  VENUE_MARKER_TYPE_OPTIONS,
  type VenueItemType,
} from '@/venue/layoutData'

export const TOOL_ICON: Record<VenueItemType, LucideIcon> = {
  equipment:    Monitor,
  renovation:   Wrench,
  area:         Building2,
  corridor:     MapIcon,
  window:       AppWindow,
  truss:        GitCommitHorizontal,
  light_grille4:       Grid3X3,
  light_grille4_stand: LampFloor,
  light_grille8_stand: Octagon,
  light_spot:          LampCeiling,
  door_inward:  DoorOpen,
  door_outward: DoorClosed,
  door_sliding: ArrowLeftRight,
  fire:         Flame,
  power:        Plug,
  network:      Network,
}

export const ALL_VENUE_TYPES = VENUE_ITEM_TYPE_OPTIONS.map((option) => option.value)
// 「+ 标识」下拉:门/消防/电源/网络口。「+ 设施」下拉:窗户/桁架/灯。
export const MARKER_MENU_TYPES: VenueItemType[] = VENUE_MARKER_TYPE_OPTIONS.map((option) => option.value)
export const FACILITY_MENU_TYPES: VenueItemType[] = ['window', 'truss', 'light_grille4', 'light_grille4_stand', 'light_grille8_stand', 'light_spot']
