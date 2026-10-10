// src/components/competitors/album-windowing-wiring.test.ts
// 源码断言：竞品相册「按日期窗口加载」在组件层的接线。
// 本仓没有 DOM 测试环境，判据都在 src/lib/competitors/shotWindow.ts 里单测；
// 这里只钉「组件真的在用它们」——接线一旦被改回旧写法，别的测试一个都不会红。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
const CARD = read('./CompetitorCard.tsx')

test('卡片开播时段读全量 sessionStarts，不读已加载截图（否则数字会跟着相册翻页变）', () => {
  assert.match(CARD, /summarizeLiveHabit\(c\.sessionStarts, timeZoneForLocale\(locale\)\)/)
  assert.match(CARD, /recentSessionStarts\(c\.sessionStarts, RECENT_SESSIONS\)/)
  assert.doesNotMatch(CARD, /c\.shots\.map\(\(s\) => s\.stream_started_at\)/)
})

const VIEW = read('./CompetitorDossierView.tsx')
const ALBUM = read('./ShotAlbum.tsx')

test('日期轴用服务端下发的完整轴，不再从已加载截图拼', () => {
  assert.match(VIEW, /const shotAxis = board\.shotAxis/)
  assert.doesNotMatch(VIEW, /collectShotDates/)
})

test('补取：nextChunk 判缺口，经 chunkLoader 取回，结果经 mergeShotRange 以函数式更新并入（过期结果才丢得掉）', () => {
  assert.match(VIEW, /nextChunk\(shotAxis, dateWindow, board\.shotsLoadedFrom\)/)
  assert.match(VIEW, /createChunkLoader<CompetitorShot>\(/)
  assert.match(VIEW, /fetchRows: \(range\) => fetchShotRange<CompetitorShot>\(range\)/)
  assert.match(VIEW, /merge: \(rows, range\) => setBoard\(\(b\) => mergeShotRange\(b, rows, range\)\)/)
  assert.match(VIEW, /setFailed: setShotLoadFailed/)
})

test('补取：缺口变化才喂给 loader，重试走 loader.retry()（状态机本身在 chunkLoader.test.ts 里测）', () => {
  assert.match(VIEW, /useEffect\(\(\) => \{ loader\.want\(pendingChunk\) \}, \[loader, pendingChunk\]\)/)
  assert.match(VIEW, /onClick=\{\(\) => loader\.retry\(\)\}/)
})

test('补取不取消在途请求：StrictMode 双挂载下取消会卡在占位格', () => {
  assert.doesNotMatch(VIEW, /AbortController/)
  assert.doesNotMatch(VIEW, /\.abort\(/)
})

test('补取失败：报错行有文案与重试按钮，由失败态包裹', () => {
  assert.match(VIEW, /\{shotLoadFailed && \(/)
  assert.match(VIEW, /t\('shotsLoadFailed'\)/)
  assert.match(VIEW, /tCommon\('retry'\)/)
})

test('刷新用的起点 ref 每次都同步到最新已加载起点（否则刷新会按过期起点缩回去）', () => {
  assert.match(VIEW, /useEffect\(\(\) => \{ loadedFromRef\.current = board\.shotsLoadedFrom \}, \[board\.shotsLoadedFrom\]\)/)
})

test('卡片调用处把已加载起点与失败态相邻透传', () => {
  assert.match(VIEW, /shotsLoadedFrom=\{board\.shotsLoadedFrom\}\s+shotLoadFailed=\{shotLoadFailed\}/)
})

test('刷新带上已加载起点，翻到历史后刷新不回缩', () => {
  assert.match(VIEW, /fetch\(boardRefreshPath\(loadedFromRef\.current\)/)
  assert.doesNotMatch(VIEW, /fetch\('\/api\/competitors', \{ cache/)
})

test('导航条「待补」：选中日未加载时不标', () => {
  assert.match(VIEW, /isShotDateLoaded\(selectedDate, board\.shotsLoadedFrom\) && missesShotOn\(/)
})

test('相册：未加载的日期渲染 PendingCell，且先于空格子判断（空格子带补图入口）', () => {
  assert.match(ALBUM, /if \(!isShotDateLoaded\(d, loadedFrom\)\) return <PendingCell /, '相册里要先判 isShotDateLoaded，同一行直接返回 PendingCell')
  const pending = ALBUM.indexOf('if (!isShotDateLoaded(d, loadedFrom))')
  assert.ok(pending < ALBUM.indexOf('<EmptyCell'), 'PendingCell 分支必须在 EmptyCell 之前')
  const cell = ALBUM.slice(ALBUM.indexOf('function PendingCell'), ALBUM.indexOf('function FilledCell'))
  assert.doesNotMatch(cell, /uploadShot|type="file"|onPaste/, 'PendingCell 不能有补图入口')
})

test('卡片把已加载起点与失败态透传给相册和子卡', () => {
  assert.match(CARD, /loadedFrom=\{shotsLoadedFrom\}/)
  assert.match(CARD, /loadFailed=\{shotLoadFailed\}/)
  assert.match(CARD, /shotsLoadedFrom=\{shotsLoadedFrom\}\s+shotLoadFailed=\{shotLoadFailed\}/)
})

test('占位格：失败时停止闪烁，且对读屏标明是否仍在加载', () => {
  assert.match(ALBUM, /\$\{failed \? '' : 'animate-pulse'\}/)
  assert.match(ALBUM, /aria-busy=\{!failed\}/)
})

test('shotGrid.ts 里不再残留 collectShotDates（日期轴只来自服务端）', () => {
  assert.doesNotMatch(read('../../lib/competitors/shotGrid.ts'), /collectShotDates/)
})

const LIGHTBOX = read('./ShotLightbox.tsx')

test('标签：相册与灯箱不直接渲染 tag 原文，一律经 useShotTagLabel', () => {
  assert.match(ALBUM, /useShotTagLabel\(\)/)
  assert.match(LIGHTBOX, /useShotTagLabel\(\)/)
  assert.doesNotMatch(ALBUM, /\{cover\.tag\}|cover\.caption \|\| cover\.tag/)
  assert.doesNotMatch(LIGHTBOX, /selected\.caption \|\| selected\.tag/)
})
