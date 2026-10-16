import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendBookmark,
  applyFloorDefaults,
  applyToAreaPairs,
  areasFullyMerged,
  cloneVenueItems,
  firstItemSelection,
  layoutsEqual,
  localImportCandidate,
  nextBookmarkIndex,
  parseVisibleTypes,
  pickActiveVenueId,
  reconcileSelection,
  removeBookmark,
  replaceBookmark,
  resolveVenueShortcut,
  safeBookmarkIndex,
  selectedAreaItems,
  toggleVisibleType,
  updateHistoryBookmarks,
  zoomInStep,
  zoomOutStep,
} from './editor.ts'
import { DEFAULT_VENUE_LAYOUT, createHistory, mergeVenueAreas, unmergeVenueAreas } from '../../venue/layoutData.ts'
import type { VenueFloor, VenueItem, VenueItemType, VenueLayout } from '@/venue/layoutData'

function item(id: string, patch: Partial<VenueItem> = {}): VenueItem {
  return {
    id,
    type: 'area',
    name: id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    status: 'planned',
    note: '',
    height3d: 0,
    elevation: 0,
    thickness: 0,
    placement: 'ground',
    ...patch,
  }
}

function floor(id: string, items: VenueItem[], patch: Partial<VenueFloor> = {}): VenueFloor {
  return { id, name: id, width: 1000, height: 800, floorHeight: 280, items, ...patch }
}

function layout(floors: VenueFloor[], patch: Partial<VenueLayout> = {}): VenueLayout {
  return { venueId: 'v', name: 'V', width: 1000, height: 800, floors, ...patch }
}

// ── 选中 ──

test('firstItemSelection: 第一件组件;空楼层/无楼层为空', () => {
  assert.deepEqual(firstItemSelection(floor('f', [item('a'), item('b')])), ['a'])
  assert.deepEqual(firstItemSelection(floor('f', [])), [])
  assert.deepEqual(firstItemSelection(undefined), [])
})

test('reconcileSelection: 保留仍存在的选中,剔除已删除的', () => {
  const present = layout([floor('f1', [item('a'), item('b'), item('c')])])
  assert.deepEqual(reconcileSelection(present, 'f1', ['c', 'gone', 'a']), { floorId: 'f1', itemIds: ['c', 'a'] })
  assert.deepEqual(reconcileSelection(present, 'f1', ['gone', 'b']), { floorId: 'f1', itemIds: ['b'] })
})

test('reconcileSelection: 选中全被剔空时退回该楼层第一件', () => {
  const present = layout([floor('f1', [item('a'), item('b')])])
  assert.deepEqual(reconcileSelection(present, 'f1', ['gone']), { floorId: 'f1', itemIds: ['a'] })
})

test('reconcileSelection: 楼层不在了退回第一层,只认第一层里的组件', () => {
  const present = layout([floor('f1', [item('a')]), floor('f2', [item('b')])])
  assert.deepEqual(reconcileSelection(present, 'gone', ['b']), { floorId: 'f1', itemIds: ['a'] })
  assert.deepEqual(reconcileSelection(present, 'f2', ['b']), { floorId: 'f2', itemIds: ['b'] })
})

test('reconcileSelection: 空楼层没有默认选中', () => {
  const present = layout([floor('f1', [])])
  assert.deepEqual(reconcileSelection(present, 'f1', ['a']), { floorId: 'f1', itemIds: [] })
})

// ── 场馆加载 ──

test('pickActiveVenueId: 上次打开的仍在 → 用它', () => {
  assert.equal(pickActiveVenueId([{ id: 'x' }, { id: 'main' }, { id: 'y' }], 'y', 'main'), 'y')
})

test('pickActiveVenueId: 上次的不在了/没有 → 默认主场馆,再不行取第一个', () => {
  assert.equal(pickActiveVenueId([{ id: 'x' }, { id: 'main' }], 'gone', 'main'), 'main')
  assert.equal(pickActiveVenueId([{ id: 'x' }, { id: 'main' }], null, 'main'), 'main')
  assert.equal(pickActiveVenueId([{ id: 'x' }, { id: 'y' }], null, 'main'), 'x')
  assert.equal(pickActiveVenueId([{ id: 'x' }, { id: 'y' }], '', 'main'), 'x')
})

test('layoutsEqual: 结构相同即相等,任意字段不同即不等', () => {
  const a = layout([floor('f1', [item('a')])])
  assert.equal(layoutsEqual(a, structuredClone(a)), true)
  assert.equal(layoutsEqual(a, { ...a, name: 'other' }), false)
})

test('localImportCandidate: 云端仍是种子且本机不同 → 提供本机版', () => {
  const local = { ...DEFAULT_VENUE_LAYOUT, name: '本机改过' }
  const offered = localImportCandidate(DEFAULT_VENUE_LAYOUT, JSON.stringify(local), DEFAULT_VENUE_LAYOUT)
  assert.equal(offered?.name, '本机改过')
})

test('localImportCandidate: 本机为空/与云端相同/云端已改过 → 不提供', () => {
  assert.equal(localImportCandidate(DEFAULT_VENUE_LAYOUT, null, DEFAULT_VENUE_LAYOUT), null)
  assert.equal(localImportCandidate(DEFAULT_VENUE_LAYOUT, '', DEFAULT_VENUE_LAYOUT), null)
  assert.equal(localImportCandidate(DEFAULT_VENUE_LAYOUT, JSON.stringify(DEFAULT_VENUE_LAYOUT), DEFAULT_VENUE_LAYOUT), null)
  const cloud = { ...DEFAULT_VENUE_LAYOUT, name: '云端改过' }
  const local = { ...DEFAULT_VENUE_LAYOUT, name: '本机改过' }
  assert.equal(localImportCandidate(cloud, JSON.stringify(local), DEFAULT_VENUE_LAYOUT), null)
})

// ── 类型筛选 ──

const ALL: VenueItemType[] = ['equipment', 'area', 'door_inward', 'fire']

test('parseVisibleTypes: 与有效类型取交集,顺序跟有效类型走', () => {
  assert.deepEqual(parseVisibleTypes(JSON.stringify(['fire', 'retired', 'area']), ALL), ['area', 'fire'])
})

test('parseVisibleTypes: 空/脏数据/非数组/交集为空 → null', () => {
  assert.equal(parseVisibleTypes(null, ALL), null)
  assert.equal(parseVisibleTypes('', ALL), null)
  assert.equal(parseVisibleTypes('{not json', ALL), null)
  assert.equal(parseVisibleTypes(JSON.stringify({ area: true }), ALL), null)
  // 字符串也有 includes,不挡掉会被当成数组取交集
  assert.equal(parseVisibleTypes(JSON.stringify('area'), ALL), null)
  assert.equal(parseVisibleTypes(JSON.stringify(['retired']), ALL), null)
})

test('toggleVisibleType: 勾上追加到末尾、取消移除', () => {
  assert.deepEqual(toggleVisibleType(['area'], 'fire'), ['area', 'fire'])
  assert.deepEqual(toggleVisibleType(['area', 'fire'], 'area'), ['fire'])
})

test('toggleVisibleType: 最后一个类型取消不掉', () => {
  assert.equal(toggleVisibleType(['area'], 'area'), null)
})

// ── 缩放 ──

test('zoomOutStep/zoomInStep: 每步 0.1,两位小数,各自只夹一端', () => {
  assert.equal(zoomOutStep(1.2), 1.1)
  assert.equal(zoomInStep(1.2), 1.3)
  assert.equal(zoomOutStep(0.55), 0.5)
  assert.equal(zoomOutStep(0.5), 0.5)
  assert.equal(zoomInStep(4.95), 5)
  assert.equal(zoomInStep(5), 5)
  // 浮点尾差被 toFixed(2) 消掉
  assert.equal(zoomInStep(0.7), 0.8)
  // 书签恢复的超界缩放:缩小不管上限、放大不管下限
  assert.equal(zoomOutStep(6), 5.9)
  assert.equal(zoomInStep(0.3), 0.4)
})

// ── 编辑操作 ──

test('cloneVenueItems: 新 id(类型-时间戳-序号-后缀)、位移 24、其余字段照抄', () => {
  const suffixes = ['aaaaa', 'bbbbb']
  const copies = cloneVenueItems(
    [item('a', { type: 'equipment', x: 10, y: 20, name: '设备' }), item('b', { x: 0, y: 0 })],
    1700000000000,
    () => suffixes.shift()!,
  )
  assert.deepEqual(copies.map((c) => c.id), ['equipment-1700000000000-0-aaaaa', 'area-1700000000000-1-bbbbb'])
  assert.deepEqual(copies.map((c) => [c.x, c.y]), [[34, 44], [24, 24]])
  assert.equal(copies[0].name, '设备')
  assert.equal(copies[0].width, 100)
})

test('cloneVenueItems: 默认后缀是 5 位 base36', () => {
  const [copy] = cloneVenueItems([item('a')], 1)
  assert.match(copy.id, /^area-1-0-[0-9a-z]{1,5}$/)
})

test('selectedAreaItems: 只取空间组件,按选中顺序,少于两个选中时为空', () => {
  const f = floor('f', [item('a1'), item('eq', { type: 'equipment' }), item('a2'), item('a3')])
  assert.deepEqual(selectedAreaItems(f, ['a3', 'eq', 'a1']).map((i) => i.id), ['a3', 'a1'])
  assert.deepEqual(selectedAreaItems(f, ['a1']), [])
  assert.deepEqual(selectedAreaItems(f, ['a1', 'gone']).map((i) => i.id), ['a1'])
  assert.deepEqual(selectedAreaItems(undefined, ['a1', 'a2']), [])
})

test('areasFullyMerged: 两两都已合并才算;少于两个不算', () => {
  const a = item('a', { mergedWith: ['b', 'c'] })
  const b = item('b', { mergedWith: ['a', 'c'] })
  const c = item('c', { mergedWith: ['a', 'b'] })
  assert.equal(areasFullyMerged([a, b, c]), true)
  assert.equal(areasFullyMerged([a, b, item('c', { mergedWith: ['a'] })]), false)
  assert.equal(areasFullyMerged([item('x'), item('y')]), false)
  assert.equal(areasFullyMerged([a]), false)
})

test('applyToAreaPairs: 对选中空间两两合并,再两两拆开', () => {
  const start = layout([floor('f', [item('a'), item('b'), item('c')])])
  const areas = start.floors[0].items
  const merged = applyToAreaPairs(start, 'f', areas, mergeVenueAreas)
  assert.deepEqual(merged.floors[0].items.map((i) => i.mergedWith), [['b', 'c'], ['a', 'c'], ['a', 'b']])
  const split = applyToAreaPairs(merged, 'f', merged.floors[0].items, unmergeVenueAreas)
  assert.deepEqual(split.floors[0].items.map((i) => i.mergedWith), [[], [], []])
})

test('applyFloorDefaults: 改第一层同步场馆宽高', () => {
  const f1 = floor('f1', [], { width: 1000, height: 800 })
  const start = layout([f1, floor('f2', [])], { width: 1000, height: 800 })
  const wider = applyFloorDefaults(start, f1, { width: 1500 })
  assert.equal(wider.floors[0].width, 1500)
  assert.equal(wider.width, 1500)
  assert.equal(wider.height, 800)
  const taller = applyFloorDefaults(start, f1, { height: 900 })
  assert.equal(taller.height, 900)
  assert.equal(taller.width, 1000)
})

test('applyFloorDefaults: 改其它楼层不动场馆宽高;层高照常写入', () => {
  const f2 = floor('f2', [], { width: 600, height: 500 })
  const start = layout([floor('f1', []), f2], { width: 1000, height: 800 })
  const next = applyFloorDefaults(start, f2, { width: 700, height: 1200, floorHeight: 350 })
  assert.equal(next.floors[1].width, 700)
  assert.equal(next.floors[1].height, 1200)
  assert.equal(next.floors[1].floorHeight, 350)
  assert.equal(next.width, 1000)
  assert.equal(next.height, 800)
})

test('applyFloorDefaults: 场馆宽高取楼层归一化之后的值(下限 100)', () => {
  const f1 = floor('f1', [])
  const next = applyFloorDefaults(layout([f1]), f1, { width: 20 })
  assert.equal(next.floors[0].width, 100)
  assert.equal(next.width, 100)
})

// ── 视角书签 ──

const V1 = { zoom: 1, left: 0, top: 0 }
const V2 = { zoom: 2, left: 10, top: 20 }
const V3 = { zoom: 3, left: 30, top: 40 }

test('updateHistoryBookmarks: 只改 present、不进撤销栈;清空写回 undefined', () => {
  const history = createHistory(layout([floor('f', [])]))
  const added = updateHistoryBookmarks(history, (prev) => [...prev, V1])
  assert.deepEqual(added.present.viewBookmarks, [V1])
  assert.equal(added.past, history.past)
  assert.equal(added.future, history.future)
  const cleared = updateHistoryBookmarks(added, () => [])
  assert.equal(cleared.present.viewBookmarks, undefined)
  assert.equal('viewBookmarks' in cleared.present, true)
})

test('appendBookmark: 到上限就不再加', () => {
  assert.deepEqual(appendBookmark([V1], V2, 3), [V1, V2])
  const full = [V1, V2, V3]
  assert.equal(appendBookmark(full, V1, 3), full)
})

test('replaceBookmark/removeBookmark: 按序号覆盖与删除', () => {
  assert.deepEqual(replaceBookmark([V1, V2], 1, V3), [V1, V3])
  assert.deepEqual(replaceBookmark([V1, V2], 5, V3), [V1, V2])
  assert.deepEqual(removeBookmark([V1, V2, V3], 1), [V1, V3])
})

test('safeBookmarkIndex/nextBookmarkIndex: 越界回到第一个,主按钮循环切换', () => {
  assert.equal(safeBookmarkIndex(2, 3), 2)
  assert.equal(safeBookmarkIndex(2, 2), 0)
  assert.equal(nextBookmarkIndex(0, 3), 1)
  assert.equal(nextBookmarkIndex(2, 3), 0)
  assert.equal(nextBookmarkIndex(0, 0), 0)
})

// ── 快捷键 ──

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, ...mods })
const ctx = (hasSelection: boolean, hasClipboard = false) => ({ hasSelection, hasClipboard })

test('resolveVenueShortcut: Delete/Backspace 无需修饰键,没选中不处理', () => {
  assert.equal(resolveVenueShortcut(key('Delete'), ctx(true)), 'delete')
  assert.equal(resolveVenueShortcut(key('Backspace'), ctx(true)), 'delete')
  assert.equal(resolveVenueShortcut(key('Delete'), ctx(false)), null)
  assert.equal(resolveVenueShortcut(key('Backspace', { metaKey: true }), ctx(true)), 'delete')
})

test('resolveVenueShortcut: 复制/粘贴/再制要 ⌘ 或 Ctrl,且各有前提', () => {
  assert.equal(resolveVenueShortcut(key('c', { metaKey: true }), ctx(true)), 'copy')
  assert.equal(resolveVenueShortcut(key('C', { ctrlKey: true }), ctx(true)), 'copy')
  assert.equal(resolveVenueShortcut(key('c', { metaKey: true }), ctx(false)), null)
  assert.equal(resolveVenueShortcut(key('c'), ctx(true)), null)
  assert.equal(resolveVenueShortcut(key('v', { metaKey: true }), ctx(false, true)), 'paste')
  assert.equal(resolveVenueShortcut(key('v', { metaKey: true }), ctx(true, false)), null)
  assert.equal(resolveVenueShortcut(key('d', { ctrlKey: true }), ctx(true)), 'duplicate')
  assert.equal(resolveVenueShortcut(key('d', { ctrlKey: true }), ctx(false)), null)
})

test('resolveVenueShortcut: 撤销/重做(⇧Z 与 Y 都是重做),不依赖选中', () => {
  assert.equal(resolveVenueShortcut(key('z', { metaKey: true }), ctx(false)), 'undo')
  assert.equal(resolveVenueShortcut(key('Z', { metaKey: true, shiftKey: true }), ctx(false)), 'redo')
  assert.equal(resolveVenueShortcut(key('y', { ctrlKey: true }), ctx(false)), 'redo')
  assert.equal(resolveVenueShortcut(key('z'), ctx(false)), null)
  assert.equal(resolveVenueShortcut(key('x', { metaKey: true }), ctx(true, true)), null)
})
