# 竞品相册按日期窗口加载 + 标签多语言 + 封面取最新 —— 设计

## 1. 背景与目标

2026-10-10 修复了「截图库超过 1000 行后，新截图在页面上看不到」的问题：看板改为分页把整张表拉全（`fetchAllRows`）。但竞品页仍然**一次取全部截图记录**。当天实测截图表 1063 行、约 525KB JSON，占看板数据的 85%（快照约 68KB、竞品约 22KB、风格描述约 3KB）；近 4 周平均每周新增约 81 行。图片本身是懒加载的，一屏只看 5 个日期（`SHOT_WINDOW_SIZE`）。也就是说，下发的数据绝大部分用户根本看不到，而且会随历史线性增长。

本次做三件事：

1. **按日期窗口加载**：首屏只取最近一段截图记录，往历史翻时按需补取。
2. **标签按界面语言显示**：`live_auto` / `live_manual` 显示成三语文案，其余 tag 原样显示。
3. **封面取当天最新一张**：插件刚截的图立刻成为封面，相当于上传成功的回执。

成功标准：

- 首屏截图数据量和历史总量脱钩，只跟最近的采集量有关。
- 往前翻页正常情况下不需要等待。
- 卡片开播时段、地区标尺、统计条、导航条「待补」、问答面板这些地方的数字和现在**完全一致**。

## 2. 已确认的决策

| 决策 | 结论 |
| --- | --- |
| 加载方案 | 完整日期轴 + 截图按「有图日」分段取（方案 A） |
| 窗口单位 | **有图日**，不是日历日：日期轴只列有截图的日期，中间有空档（例如 9-17 到 9-29 一张图都没有），按日历天切会凑不满一屏 |
| 首屏与每段大小 | `SHOT_CHUNK_DAYS = 10` 个有图日（两屏） |
| 统计口径 | 所有统计都和相册的加载范围脱钩，口径保持现状（卡片开播时段用全量历史，标尺和问答沿用各自现有的窗口） |
| 问答面板 | 单独查它需要的几列，取全部历史，回答口径不变 |
| 封面 | 当天最新一张；当天的图仍按时间正序排列，灯箱打开时停在封面这张 |
| 标签文案 | `live_auto`：自动巡检 / Auto patrol / 自動巡回；`live_manual`：插件 / Extension / 拡張機能 |
| 日期轴交互 | 保持现状（整屏翻页 + 点选日期），不新增拖动 |

**不在本次范围**：灯箱里新增可见的标签位、统一卡片与问答的开播时段窗口、开播时段聚类在密集数据下塌成一档的老问题、日期轴拖动。

## 3. 数据与接口（服务端）

### 3.1 取数分三层（`service.ts` 的 `getCompetitorBoard`）

每一层都继续走 `fetchAllRows` 分页，单段截图将来也可能超过 1000 行。

1. **基础表**：竞品、快照、风格描述，跟现在一样整表取。
2. **截图索引（瘦查询）**：`competitor_shots` 只取 `competitor_id, shot_on, stream_started_at, captured_at` 四列，全量。交给纯函数 `buildShotIndex` 算出：
   - `shotAxis`：有图日期升序去重；存在无日期截图时，末尾追加 `UNDATED_KEY`。规则与现在的 `collectShotDates` 一致。
   - 每个账号的 `sessionShots`：全部历史的截图场次，每场一行——开播时刻 + 该场最晚的截图时刻（`SessionShot`）。聚合规则与 `liveSessions.ts` 里 `liveSpansOf` 对截图的分组完全一致（按开播时刻的毫秒值分组，读不出的跳过；截图时刻缺失或读不出时按开播时刻算，取最大），所以直接喂 `liveSpansOf` 的 `shots` 入参，结果与喂全部截图相同。
3. **截图本体（窗口）**：`select('*')`，条件为 `shot_on >= loadedFrom` **或** `shot_on is null`。
   - 默认 `loadedFrom` 由纯函数 `initialLoadedFrom(axis)` 算出：轴上（不含 `UNDATED_KEY`）倒数第 `SHOT_CHUNK_DAYS` 个日期。
   - 有日期的天数不超过 `SHOT_CHUNK_DAYS` 时返回 `null`，表示全取。
   - 第 3 步依赖第 2 步算出的轴，所以这两次查询串行，多一次往返。

`getCompetitorBoard(userId, opts?: { since?: string | null })`：

- 传入合法的 `since` 时，用它代替默认起点。改完数据后刷新要保住用户已经翻到的范围，靠的就是这个参数。
- 如果 `since` 早于或等于轴上第一个日期，结果等同于全取，`shotsLoadedFrom` 记为 `null`。

### 3.2 类型（`types.ts`）

- `CompetitorWithHistory<S = CompetitorShot>` 和 `CompetitorBoard<S = CompetitorShot>` 加上截图类型参数。默认值保证现有调用不用改。
- `CompetitorWithHistory.shots: S[]`：语义改为「**已加载范围内**的截图」，注释写明。
- 新增 `CompetitorWithHistory.sessionShots: SessionShot[]`：全量截图场次，供常见开播、近 30 天、开播记录弹窗、地区标尺使用（与导入的 `live_sessions` 合并去重）。
- 新增 `CompetitorBoard.shotAxis: string[]`：完整日期轴。
- 新增 `CompetitorBoard.shotsLoadedFrom: string | null`。约定如下：
  - **已加载** = 所有 `shot_on >= shotsLoadedFrom` 的截图 + 全部无日期截图；
  - `null` 表示全部已加载；
  - 已加载范围**总是包含最新一天**。

`assembleBoard` 改成对截图类型泛型，另外接收一个可选参数 `meta`（`shotAxis`、`sessionShotsBy`、`shotsLoadedFrom`），原样挂到结果上。不传 `meta` 时，视为传入的截图就是全部截图：日期轴和截图场次都从截图本身算，`shotsLoadedFrom = null`。截图排序的比较函数抽成 `compareShotsForBoard`，从 `shotGrid.ts` 导出，供合并时共用。放在 `shotGrid.ts` 而不是 `assemble.ts`，是为了避免 `assemble` 和 `shotWindow` 互相引用。

### 3.3 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/competitors?since=YYYY-MM-DD` | `since` 可选，非法值返回 400。给改完数据后的刷新用 |
| GET | `/api/competitors/shots?from=YYYY-MM-DD&before=YYYY-MM-DD` | **新增**。返回 `from <= shot_on < before` 的截图数组，带登录守卫。两个参数都必须是合法日期（`isValidShotDate`，且必须是字符串），并且 `from < before`，否则返回 400 |

新路由文件放在 `src/app/api/competitors/shots/route.ts`，和现有的 `shots/[shotId]` 并列。参数校验抽成纯函数 `parseShotRangeQuery`，放进 `shotWindow.ts`，可以单测。

### 3.4 问答面板（`getAskBoard`）

- 新增 `getAskBoard()`：基础表照常取；截图只查 `competitor_id, shot_on, sort_order, stream_started_at, viewer_count, captured_at` 这几列，取**全部历史**。
- 由同一份行数据算出 `shotAxis` 和 `sessionShots`，`shotsLoadedFrom = null`，表示全部已加载，这一点在语义上也成立。
- 开播记录（`competitor_live_sessions`）也全量拉取，作为 `assembleBoard` 的第 6 个实参：问答的开播时段与卡片同一口径，由导入场次与截图推断合并去重。
- 类型为 `CompetitorBoard<AskShot>`，其中 `AskShot = Pick<CompetitorShot, 上述列>`。
- `ask-context.ts` 的入参放宽为 `CompetitorBoard<AskShot>`，计算逻辑一行不改。完整的 `CompetitorBoard` 在结构上满足这个类型，所以现有测试照样能跑。
- `ask-service.ts` 的依赖注入口改为 `board?: typeof getAskBoard`。

## 4. 前端：加载、预取与「未加载」状态

### 4.1 状态

`CompetitorDossierView` 继续把整块 `board` 放在一个 state 里。

- 日期轴改用 `board.shotAxis`，不再在客户端从已加载的截图里拼。
- `resolveAnchor`、`windowOf`、`ShotDateStrip` 的翻页逻辑不变。现在它们操作的是完整的轴，所以「最早」那一端的禁用判断是准的。

### 4.2 什么时候补取：`nextChunk(axis, dateWindow, loadedFrom)`

返回 `{ from, before } | null`。

- `loadedFrom === null`（已全部加载）时返回 `null`。
- 定位 `loadedFrom` 在轴上的下标时，取「**轴上第一个不早于 `loadedFrom` 的日期**」。这样即使那一天的图刚被删光、日期已不在轴上，也不会卡住。
- 当前屏第一天之前，已加载的有图日不足一屏（`SHOT_WINDOW_SIZE`）时，需要补取：
  - `before = loadedFrom`；
  - `from` 取以下两个日期中较早的一个：已加载起点再往前 `SHOT_CHUNK_DAYS` 个有图日、当前屏第一天再往前一屏。两者都夹到轴首。这样即使将来出现一次跳很远的情况，这一段也能把整屏盖住。
- 实际体验：
  - 首屏加载 10 天，显示最近 5 天；
  - 点一次「更早」，那一屏已经在本地，立刻显示，后台同时去取下一段；
  - 之后每翻一屏都会提前一屏备好，只有连续快点时才会看到加载态。

`DossierView` 里用一个 effect 监听 `dateWindow`、`shotAxis`、`shotsLoadedFrom`，有缺口就请求 `/api/competitors/shots`。同一段请求用一个 ref 去重。

### 4.3 合并：`mergeShotRange(board, rows, from, before)`

- **前提是 `board.shotsLoadedFrom === before`**，否则视为过期结果，原样返回 board。比如刷新已经先一步把看板换掉了，这时 effect 会按新状态重新判断要不要补。
- 递归处理 `related` 子主播：
  1. 先移除各账号已有的、落在 `[from, before)` 区间内的截图；
  2. 再按 `competitor_id` 放入新取到的行，用 `compareShotsForBoard` 重新排序。
  
  这样合并是幂等的。
- 把 `shotsLoadedFrom` 推进到 `from`；如果 `from` 已经是轴上第一个日期，就置为 `null`。
- 找不到归属账号的行直接丢弃。可能是账号刚被删。

### 4.4 「未加载」和「没图」分开：`isShotDateLoaded(date, loadedFrom)`

- `loadedFrom === null` 或者是 `UNDATED_KEY` 时为真，否则看 `date >= loadedFrom`。
- **相册格子**：
  - 已加载：走现有的有图格 / 空格（空格带补图入口）；
  - 未加载：新增 `PendingCell`。尺寸和其他格子一样，显示骨架、带 `aria-busy`，**不提供补图入口**，免得有人往一个其实有图的日期里重复上传。
- **导航条「待补」**：改为 `isShotDateLoaded(selectedDate, loadedFrom) && missesShotOn(...)`。选中日还没加载时一律不标，不会出现刚翻过去的一瞬间全员变黄。

### 4.5 出错

补取失败时：

- 顶部报错行显示「截图加载失败」，旁边放一个「重试」按钮。点重试会清掉去重 ref，再触发一次判断。
- 未加载格子停止闪烁，改成静态占位，不会无限转圈。

### 4.6 改完数据后的刷新

现有的 `refresh()` 改为请求 `GET /api/competitors?since=<当前 shotsLoadedFrom>`（值为 `null` 即已全部加载时，带上轴上第一个有图日，服务端会把它归一成全部；轴上没有有图日时不带参数）。最新值通过 ref 读取，避免闭包拿到旧值。

- 翻到历史后，上传、改日期、删图之后刷新，不会被缩回最近 10 天。
- 刷新和补取同时进行、刷新后到时，补取的那一段会因为前提不成立而被丢掉，effect 发现缺口后会再补一次，能自行恢复。
- 用户在灯箱里把一张图的日期改到一个还没加载的更早日期：刷新后这张图从当前视图消失，因为它已归到那一天；日期轴随刷新更新，翻过去时会按需补取。

注：「`null` 时带上轴上第一个有图日」是终审发现后修正的规则。最初写的是 `null` 时不带参数，但服务端缺省会回最近 10 个有图日，翻到轴首之后再刷新就会缩回去（灯箱开着时当天的图还会整个消失）。

### 4.7 不改的地方

统计条的「最近采集日」（`summarizeBoard` 中的 `maxShotOn`）仍然从已加载的截图里取最大值。由于已加载范围总是包含最新一天，结果不变。在 `summary.ts` 的注释里写明这条依赖。

## 5. 统计口径脱钩

| 位置 | 现在的数据源 | 改为 | 结果 |
| --- | --- | --- | --- |
| 卡片「常见开播时段」「最近 8 场」「近 30 天」、档案摘要 | `liveSpansOf(c)`（读 `c.shots`，全量） | 经场次接缝 `accountSpans(c)`（`liveBoard.ts`），它喂 `liveSpansOf({ live_sessions: c.live_sessions, shots: c.sessionShots })` | 不变：`sessionShots` 与全部截图喂给 `liveSpansOf` 结果相同 |
| 开播记录弹窗 | `liveSpansOf(competitor)` | 同上，`accountSpans(competitor)` | 不变 |
| 开播时段页（国家月历 / 单个直播间 / 时段对比）的场次 | `flattenAccounts` → `accountSpans(c)`（原读 `c.shots`） | `accountSpans` 改喂 `c.sessionShots`（与上两行同一个接缝，组件里不再直接调 `liveSpansOf`） | 不变 |
| 开播时段页的巡检日（「无数据」斜线格的判据） | `patrolDaysOfBoard(board)` 遍历全部截图的 `shot_on` | `patrolDaysOfBoard` 改读 `board.shotAxis`（剔掉 `UNDATED_KEY`），入参只要 `{ shotAxis }` | 不变：轴就是全库有图日期 |
| 地区标尺 | `liveStartsOf({ live_sessions, shots })`，在近 14 天内过滤 | `RulerInput.sessionShots` 代替 `shots`，窗口过滤原样保留 | 不变 |
| 问答面板 | `getCompetitorBoard`（全量 `*`） | `getAskBoard`（全量、只取需要的列） | 不变 |
| 统计条最近采集日 | 已加载截图 | 不改（见 4.7） | 不变 |
| 导航条「待补」 | `missesShotOn(c.shots, selectedDate)` | 先判断 `isShotDateLoaded` | 已加载的日期不变，未加载的日期不标 |

上线前，用生产数据做一次**新旧口径对拍**（只读，一次性脚本，不进仓库）：

- 对每个账号，分别用全量截图和 `sessionShots` 计算开播时段与地区标尺，两边结果逐字节相同（聚合层面的等价已由 `shotWindow.test.ts` 的对拍用例钉住）；
- `buildAskContext` 分别吃旧看板和 `getAskBoard`，生成的数据包 JSON 逐字节相同。

## 6. 标签与封面

### 6.1 标签：`src/lib/competitors/shotTag.ts`

`shotTagDisplay(tag)` 返回三种结果之一：

- `null`：空值或纯空白，不显示；
- `{ kind: 'known', key: 'live_auto' | 'live_manual' }`：精确等于这两个值时返回。`live_manual` 复用 `quickShot.ts` 的 `QUICK_SHOT_TAG`，`live_auto` 在本文件中定义常量 `AUTO_SHOT_TAG`；
- `{ kind: 'text', text }`：其余情况，原样显示。

文案键为 `competitors.shotTag.live_auto` 和 `competitors.shotTag.live_manual`，三语同步。

用到的地方：

- 相册封面底部的标签角标；
- 相册封面图的 alt；
- 灯箱主图的 alt。

### 6.2 封面

- `groupShotsByDate` 的组内排序：`sort_order` 升序 → 截图时刻升序 → `id` 升序兜底。
  - 截图时刻取 `captured_at`，没有就用 `created_at`。
  - 比较时用 `Date.parse` 比数值，不比字符串。时间戳的写法不统一（`Z` 和 `+00:00` 混用，小数秒位数也不固定），按字符串比较会排错。
  - 当前 151 张自动截图有 `captured_at`，其中 27 张入库时间比截图时间晚 10 分钟以上，按入库时间排会排错。
- 新增 `coverOf(dayShots)`：取组内最后一张，即最新一张。相册格子的封面、在线人数角标、标签角标都取它。
- `ShotLightbox` 新增 `initialId` 参数，打开时停在封面这张，左边是更早的图。胶片条、下载文件名序号（`_1`、`_2`…）仍按时间正序排列。

## 7. 测试与验证

**单测（`node --test`，逻辑都放在 `src/lib` 里）**：

- `shotWindow.ts`：`buildShotIndex`（含无日期截图、重复开播时刻、空表）、`initialLoadedFrom`、`nextChunk`（缓冲刚好一屏 / 不足一屏、跳很远、`loadedFrom` 不在轴上、已加载到轴首、`null`）、`isShotDateLoaded`、`mergeShotRange`（子主播、幂等、过期结果丢弃、推进到轴首置 `null`、孤儿行）、`parseShotRangeQuery`。
- `shotTag.ts`：三类返回值、空白、大小写不同时不当作已知值。
- `shotGrid.ts`：新的组内排序（`captured_at` 优先、`created_at` 兜底、小数秒位数不同、`sort_order` 优先）、`coverOf`。
- `assemble.ts`：`sessionShots` / `shotAxis` / `shotsLoadedFrom` 原样挂到结果上，比较函数抽出来后排序不变。
- `regionRuler.ts`：改用 `sessionShots` 后，现有用例全部迁移且继续通过。
- `buildShotIndex` ↔ `liveSpansOf` 等价性对拍：同场多张、截图时刻为 null / 早于开播 / 读不出、同一时刻不同写法、读不出的开播、与导入场次重叠与不重叠、跨账号同一秒开播，两种喂法的结果 deepEqual。
- `ask-context`、`ask-prompt`、`ask-service`：测试夹具补上新字段，原断言全部不改。

**源码断言（守接线，仿照 `board-pagination.test.ts`）**：

- `getCompetitorBoard` 和 `getAskBoard` 里，每个 `db.from(...)` 都包在 `fetchAllRows` 里并带稳定排序；窗口查询带有无日期截图的 `or` 条件；`getAskBoard` 的截图查询不出现 `select('*')`。
- 两个路由都经过 `parseShotRangeQuery` / `since` 校验。
- `DossierView` 的刷新带 `since`，导航条「待补」带 `isShotDateLoaded` 守卫；`ShotAlbum` 对未加载的日期渲染 `PendingCell`；组件里不再直接渲染 `.tag` 原文。

**门禁**：

- 新测试文件登记进 `package.json` 的 `test` 行；
- 跑 `tsc --noEmit`、`npm test`、`test:i18n`、`test:no-bare-han`、`test:style`、`test:lint`；
- 每个任务都在已提交的基线上跑突变探针，并交出击杀表。

**实机验证（生产构建，`next build` + `next start`）**：

- 首屏网络中截图记录的体积与条数，和改动前对比。
- 往前翻：在预期的时机发出 `/api/competitors/shots` 请求；连续快点时出现骨架格；导航条不会误标「待补」。
- 断网或接口报错时出现「重试」，点了能恢复。
- 在已翻到的历史位置上传或改日期后，加载范围不回缩。
- 中、英、日三种界面下，标签文案正确；封面是当天最新一张，灯箱打开时停在这张。
- 问答面板问一句开播时段相关的问题，确认仍能正常作答。

## 8. 上线

- **无 DDL**：现有 `(competitor_id, shot_on)` 索引不覆盖单按 `shot_on` 的范围查询，但表只有千行量级，顺序扫描足够，暂不加索引；表到十万行量级时再评估。
- 更新 `docs/competitors.md` 的接口表和相册说明，更新日志 `src/lib/changelog/entries.ts` 追加一条用户可感知的变更。
- 走功能分支开 PR，合并前先问；合并后以 Vercel 生产部署状态和线上实测为准，不以 CI 绿灯推断已上线。
