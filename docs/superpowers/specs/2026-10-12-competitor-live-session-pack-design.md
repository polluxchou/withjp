# 竞品开播记录瘦身下发（列式紧凑编码）—— 设计

## 1. 背景与目标

PR 324 把相册截图改成按日期窗口加载之后，竞品看板（`getCompetitorBoard`）里最大的一块变成了开播记录（`competitor_live_sessions`，LIVE History 粘贴导入）。它仍然是整表 `select('*')` 下发，挂在每个账号的 `c.live_sessions` 上。

2026-10-12 生产只读实测（2594 场、39 个账号）：

| | 原始 JSON | gzip |
| --- | --- | --- |
| 整个看板 | 1063KB | 157KB |
| 其中开播记录 | 872KB（82%） | 约 121KB |
| 看板去掉开播记录 | 191KB | 36KB |

三个事实决定了方案：

1. **每行约 344B，约 70% 是没人读的列**：`id / competitor_id / source / created_at / updated_at`。所有消费方只读 `started_at / ended_at / likes / title`。
2. **标题只在开播记录弹窗的清单里显示**。标题重复度极高，原始约 55KB，gzip 后只占约 2KB，单独做按需取不划算。
3. **不能按时间窗口下发**：卡片「常见开播」在全部历史上聚类，弹窗「全部」、国家月历、单个直播间都能翻到最早一个月。开窗口要么改口径，要么做服务端预聚合；而消费方都吃 `LiveSpan[]`、各自窗口不同，预聚合等于重写。

增长：近两个月每月新增约 1000 场，一年后约 1.2 万场。

成功标准：

- 看板原始体积从 1063KB 降到约 300KB，gzip 从 157KB 降到约 60KB；一年后（约 1.2 万场）整个看板约 670KB 原始 / 100KB gzip，照现状则是约 4.2MB / 460KB。
- 卡片、开播记录弹窗、开播时段页、地区标尺、问答、导入预览的所有数字与显示**逐字节不变**（含弹窗清单里的标题）。

## 2. 已确认的决策

| 决策 | 结论 |
| --- | --- |
| 方案 | 只查用得到的列 + 按账号的列式紧凑编码，标题随行带上（方案 B） |
| 标题 | 内联在看板里，不新增按需接口（按需只再省约 2KB gzip，却要多一个接口和弹窗的加载 / 失败状态） |
| 时间范围 | 仍然全量历史，不开窗口 |
| 时刻单位 | 按账号选：全部整分钟用分钟，否则整个账号退回毫秒。打包恒无损，不改导入校验器 |
| 字段名 | `c.live_sessions` 改名 `c.liveSessionPack`，旧名从类型里消失，漏改处由 tsc 拦下 |
| 问答 | 同样只查这几列、同样打包，经同一个访问器解包；行仍全量，口径不变 |
| 写入路径 | 不动：库行类型 `CompetitorLiveSession`、粘贴解析、upsert 接口、校验器原样 |

## 3. 下发格式 `LiveSessionPack`

```ts
/** 一个账号的开播记录，列式存放；第 i 场 = 各数组的第 i 个元素。 */
interface LiveSessionPack {
  /** 时刻单位（毫秒）：本账号全部开播、下播都是整分钟时为 60000，否则为 1。 */
  unitMs: 60000 | 1
  /** 开播时刻 = epoch 毫秒 ÷ unitMs。 */
  start: number[]
  /** 时长 = (下播 − 开播) 毫秒 ÷ unitMs；库里有约束 ended_at >= started_at，恒 ≥ 0。 */
  dur: number[]
  likes: (number | null)[]
  title: string[]
}
```

- 键名可读：每个账号只出现一次，39 个号合计不到 2KB，不值得缩写。
- 顺序：与现在 `live_sessions` 一致，按开播时刻倒序（最新在前）。
- 没有开播记录的账号是四个空数组（`unitMs` 取 60000）。
- 无损：所有消费方读到的都是毫秒时刻（`Date.parse` 之后），分钟编码只在整分钟时启用，退回毫秒时原样保存。库里时刻带微秒的话 `Date.parse` 本来就截到毫秒，与现状一致。
- 读不出时刻的行跳过。库里两列都是 `not null timestamptz`，实际不会出现；跳过与 `liveSpansOf` 的处理一致。

纯函数放在新文件 `src/lib/competitors/liveSessionPack.ts`：

- `packLiveSessions(rows)`：吃 `{ started_at, ended_at, likes, title }[]`（已排好序），出 `LiveSessionPack`。
- `unpackLiveSessions(pack)`：还原成 `{ started_at, ended_at, likes, title }[]`，时刻写成 `toISOString()`。
- `liveSessionRows(c)`：`unpackLiveSessions(c.liveSessionPack)`，组件和 lib 读开播记录只经过它。

解包后的时刻写法（`…000Z`）与库里读回来的（`+00:00`）不同，但所有下游都按时刻比：`liveSpansOf` 统一成 `toISOString()`，`diffAgainstExisting` 用 `getTime()`。

## 4. 服务端

- 新常量 `LIVE_SESSION_COLUMNS = 'competitor_id, started_at, ended_at, title, likes'`（`service.ts`），`getCompetitorBoard` 与 `getAskBoard` 都用它，替换 `select('*')`。仍走 `fetchAllRows` 分页拉全。
- `assembleBoard` 的第 6 个入参类型收窄为这 5 列（新类型 `BoardLiveSession`，放 `types.ts`，与 `BoardShot` 同一写法：`Pick<CompetitorLiveSession, …>`），按账号分组、按时刻倒序排好后调 `packLiveSessions`，结果挂到 `liveSessionPack`。
- 类型：`CompetitorWithHistory.live_sessions: CompetitorLiveSession[]` 换成 `liveSessionPack: LiveSessionPack`。

## 5. 消费方

| 消费方 | 改法 | 覆盖的界面 |
| --- | --- | --- |
| `liveBoard.accountSpans(c)` | `liveSpansOf({ live_sessions: liveSessionRows(c), shots: c.sessionShots })` | 卡片常见开播 / 最近场次 / 近 30 天，开播记录弹窗，开播时段页三个数据视图 |
| `regionRuler` 的 `RulerInput` | 入参 `live_sessions` 换成 `liveSessionPack`，内部解包后照旧调 `liveStartsOf` | 地区标尺 |
| `ask-context` 的 `startsUpTo` | `liveStartsOf({ live_sessions: liveSessionRows(c), shots: c.shots })`（问答看板的 shots 本来就是全量） | 问答 |
| `LiveSessionsModal` → `LiveImportPanel` | `existing={liveSessionRows(competitor)}`，prop 类型收窄为 `{ started_at: string }[]` | 导入预览「新增 X · 更新 Y」 |

`liveSpansOf` 的入参名（`live_sessions`）与 `LiveSpan`、`liveStats`、`liveCoverage` 都不变。

## 6. 测试与验证

**单测**（新文件 `liveSessionPack.test.ts`，登记进 `package.json` 的 test 行）：

- 往返：分钟路径、毫秒退回路径（任一行带秒即整账号退回）、点赞为 null、空标题、空列表、顺序保持。
- 等价：`liveSpansOf({ live_sessions: unpack(pack(rows)), shots })` 与 `liveSpansOf({ live_sessions: rows, shots })` 深度相等（含标题、含截图合并去重）。
- 读不出的时刻被跳过。
- `assemble.test.ts`、`liveBoard.test.ts`、`regionRuler.test.ts`、`ask-context.test.ts`、`ask-prompt.test.ts`、`shotWindow.test.ts` 造数据处改用 `packLiveSessions`。

**接线测试**（源码断言）：

- 两个看板都用 `LIVE_SESSION_COLUMNS` 查开播记录，不再 `select('*')`。
- `src/` 里没有任何地方再从竞品对象上读 `.live_sessions`（`liveSpansOf` 自己的入参字段、写入路径的导入解析与 upsert 除外）。
- 四个消费方都经 `liveSessionRows` / `liveSessionPack`。

**突变探针**：每个任务在已提交的基线上、在独立 detached worktree 里跑，交击杀表。

**生产只读对拍**（以 origin/main 为基线，scratchpad 里建 detached worktree，两边的 lib 直接 import，逐字节比 JSON）：

- 每个账号的 `accountSpans`（含标题）、`flattenAccounts`。
- 卡片：`summarizeLiveHabit`、`recentSessionStarts`、固定 today 下近 30 天与前 30 天的 `windowStats`、`likesSeries`。
- 开播时段页：每个国家 × 每个月的 `monthRow`，单个直播间的 `roomHistoryRange` / `roomMonthSummary`，番组表的 `densityColumn`。
- 每个地区在固定 now 下的 `buildRegionRuler`。
- 固定 now 下问答数据包的完整 JSON。
- 用当前全部开播记录喂 `diffAgainstExisting` 的计数。
- 改动前后的看板体积（原始 / gzip）。

**生产构建实看**（`next build` + `next start`）：卡片数字、弹窗清单的标题、导入预览计数、开播时段页四个视图正常渲染。

**更新日志**：补一条「竞品看板加载更快」。

## 7. 风险

- **部署瞬间的新旧版本错位**：部署前打开、没刷新的页面，如果在部署后重新取看板，旧前端读不到 `live_sessions`。场次会暂时只剩截图推断的那部分，导入预览会报错，刷新页面即恢复。影响面只是部署那一刻开着的标签页，接受，不做兼容层。

## 8. 不在本次范围

- 开播时段页仍带相册截图本体（约 114KB 原始），这页用不上，另开 PR。
- 导入校验器不改（`ended_at` 允许带秒的情况由按账号退回毫秒兜住）。
- 相册补取的其它优化。
