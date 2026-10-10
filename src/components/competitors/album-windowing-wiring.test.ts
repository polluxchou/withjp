// src/components/competitors/album-windowing-wiring.test.ts
// 源码断言：竞品相册「按日期窗口加载」在组件层的接线。
// 本仓没有 DOM 测试环境，判据都在 src/lib/competitors/shotWindow.ts 里单测；
// 这里只钉「组件真的在用它们」——接线一旦被改回旧写法，别的测试一个都不会红。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
const CARD = read('./CompetitorCard.tsx')

test('卡片场次读全量 sessionShots，不读已加载截图（否则常见开播、近 30 天会跟着相册翻页变）', () => {
  assert.ok(
    CARD.includes('liveSpansOf({ live_sessions: c.live_sessions, shots: c.sessionShots })'),
    '卡片的场次必须由导入记录 + 全量截图场次合并',
  )
  assert.match(CARD, /\[c\.live_sessions, c\.sessionShots\]/)
  assert.doesNotMatch(CARD, /liveSpansOf\(c\)/, '整个 c 喂进去会读 c.shots（只是已加载的那段）')
  assert.doesNotMatch(CARD, /liveStartsOf\(c\)/)
  assert.doesNotMatch(CARD, /c\.shots\.map\(/)
})

const MODAL = read('./live/LiveSessionsModal.tsx')

test('开播记录弹窗的场次同样读全量 sessionShots，不读已加载截图', () => {
  assert.ok(
    MODAL.includes('liveSpansOf({ live_sessions: competitor.live_sessions, shots: competitor.sessionShots })'),
    '弹窗的场次必须由导入记录 + 全量截图场次合并',
  )
  assert.match(MODAL, /\[competitor\.live_sessions, competitor\.sessionShots\]/)
  assert.doesNotMatch(MODAL, /liveSpansOf\(competitor\)/)
  assert.doesNotMatch(MODAL, /competitor\.shots\b/)
})

test('开播记录弹窗的其它子组件不读截图本体（.shots 只是已加载的那段）', () => {
  for (const f of ['LiveCalendar', 'LiveCoverageHistogram', 'LiveKpiTiles', 'LiveLikesBars', 'LiveRecordsPanel', 'LiveSessionTable']) {
    assert.doesNotMatch(read(`./live/${f}.tsx`), /\.shots\b/, f)
  }
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

test('刷新用的 since ref 每次都同步到最新（起点 + 轴）：否则刷新会按过期起点缩回去；起点 null 也要带上轴首', () => {
  assert.match(
    VIEW,
    /useEffect\(\(\) => \{ refreshSinceRef\.current = refreshSince\(board\.shotsLoadedFrom, board\.shotAxis\) \}, \[board\.shotsLoadedFrom, board\.shotAxis\]\)/,
  )
  assert.match(VIEW, /useRef\(refreshSince\(board\.shotsLoadedFrom, board\.shotAxis\)\)/)
  assert.doesNotMatch(VIEW, /loadedFromRef/)
})

test('卡片调用处把已加载起点与失败态相邻透传', () => {
  assert.match(VIEW, /shotsLoadedFrom=\{board\.shotsLoadedFrom\}\s+shotLoadFailed=\{shotLoadFailed\}/)
})

test('刷新带上已加载起点，翻到历史后刷新不回缩', () => {
  assert.match(VIEW, /fetch\(boardRefreshPath\(refreshSinceRef\.current\)/)
  // 会抛的 loadBoard（开播记录弹窗导入后用）与不抛的 refresh 走同一条请求，两条路都不能缩回首屏
  const loadBoard = VIEW.slice(VIEW.indexOf('const loadBoard = useCallback('), VIEW.indexOf('const refresh = useCallback('))
  assert.ok(loadBoard.length > 0, '找不到 loadBoard（须在 refresh 之前定义）')
  assert.match(loadBoard, /fetch\(boardRefreshPath\(refreshSinceRef\.current\), \{ cache: 'no-store' \}\)/)
  assert.match(VIEW, /const refresh = useCallback\(async \(\) => \{\s*try \{\s*await loadBoard\(\)/)
  assert.match(VIEW, /onReload=\{loadBoard\}/)
  assert.doesNotMatch(VIEW, /boardRefreshPath\(board\./, '不能在 refresh 里直接读 state（useCallback 闭包会过期）')
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

test('标签：hook 把两个机器值各自接到对应的字面量文案键', () => {
  const hook = read('./useShotTagLabel.ts')
  assert.ok(
    hook.includes("live_auto: t('shotTag.live_auto'), live_manual: t('shotTag.live_manual')"),
    'live_auto 必须取 shotTag.live_auto，live_manual 必须取 shotTag.live_manual，且键写成字面量',
  )
  assert.match(hook, /shotTagLabel\(tag, /)
})

test('标签：相册封面角标与 alt 都用 tagLabel(cover.tag) 的结果', () => {
  assert.ok(ALBUM.includes('const coverTag = tagLabel(cover.tag)'), '角标文本必须是 tagLabel(cover.tag)')
  assert.ok(ALBUM.includes('{coverTag && ('), '角标的显示条件必须是转换后的 coverTag（纯空白 tag 才不会渲染空条）')
  assert.ok(ALBUM.includes('alt={cover.caption || coverTag || ('), '封面 alt 的兜底必须是 coverTag')
})

test('标签：灯箱主图 alt 的标签兜底必须经 tagLabel', () => {
  assert.ok(LIGHTBOX.includes("alt={selected.caption || tagLabel(selected.tag) || ''}"))
})

test('封面：相册格子取 coverOf，灯箱从封面那张打开', () => {
  assert.match(ALBUM, /const cover = coverOf\(shots\)/)
  assert.match(ALBUM, /initialId=\{coverOf\(grouped\.get\(openDate\) \?\? \[\]\)\?\.id\}/)
  assert.match(LIGHTBOX, /useState<string \| null>\(initialId \?\? null\)/)
})

test('封面：FilledCell 的图、人数角标都读 cover，不再碰 shots[0]', () => {
  const start = ALBUM.indexOf('function FilledCell')
  assert.ok(start >= 0, '找不到 FilledCell')
  const rest = ALBUM.slice(start + 'function FilledCell'.length)
  const end = rest.search(/\nfunction |\nexport default/)
  const body = end >= 0 ? rest.slice(0, end) : rest
  assert.doesNotMatch(body, /shots\[0\]/)
  assert.ok(body.includes('src={cover.image_url}'), '封面图必须读 cover.image_url')
  assert.ok(body.includes('{cover.viewer_count != null && ('), '人数角标必须读 cover.viewer_count')
})

test('灯箱：选中项被删后回落到最新一张，翻页的起点也一致', () => {
  assert.match(LIGHTBOX, /\?\? coverOf\(shots\)/)
  assert.match(LIGHTBOX, /at >= 0 \? at : shots\.length - 1/)
  assert.doesNotMatch(LIGHTBOX, /\?\? shots\[0\]/)
})

test('灯箱：胶片条把选中缩略图滚进可视区，用容器自己的 scrollLeft，不用 scrollIntoView', () => {
  assert.match(LIGHTBOX, /revealScrollDelta\(/)
  assert.match(LIGHTBOX, /\.scrollLeft \+=/)
  // scrollIntoView 会连祖先和页面一起滚，而灯箱开着时视口滚动是被锁住的
  assert.doesNotMatch(LIGHTBOX, /scrollIntoView/)
})
