# 截图放大页「同期在播」—— 设计

## 1. 背景与目标

直播截图扩展（`extensions/live-shot`，PR 318）每次上传截图时，会把 TikTok 左侧 Following 侧栏里**同一秒**其它在播竞品的在线人数一并写进 `competitor_viewer_readings`（`source = 'sidebar'`，每个账号一行，与截图共用 `captured_at` 和 `shot_id`）。截至 2026-10-12，这张表已有两百多行 sidebar 读数，但后台没有任何页面读它：数据只写不看。

单个房间的人数只能说「它有多少人」；配上同一秒别家的数，才能说「这个数在同行里算高还是低」。本设计把这份横截面接到**相册放大页**（`ShotLightbox`）：运营放大某张截图时，在直播态那行下面看到「同期在播 N 家 · 本号第 k 位」，点开是同一秒各家的人数名单。

**目标**

1. 放大页对有读数的截图显示同期摘要与名单，本号高亮，名单可跳到对应竞品卡片。
2. 口径固定下来，后续「当日横截面」「相对大盘」两期沿用同一纯函数，不改表、不改接口。

**不做**

- 不改采集端（扩展、页内探针）与写入接口。
- 不做当日横截面视图、不做相对大盘指标（另起两期）。
- 不给自动巡检（`live_auto`）的老截图补读数；它们没有 `shot_id` 关联的读数行，放大页这一段整段不出现。
- 不在相册卡片、开播记录页加任何东西。

## 2. 口径

| 项 | 约定 |
| --- | --- |
| 比较基准 | 只用 `source = 'sidebar'` 的行做横向比较（扩展设计稿第 6 节已定：横向统一用 sidebar） |
| 本号的数 | 本号若也在 Following 里，用它的 sidebar 行；若没有，退回 `source = 'current'` 那一行参与排名，并在界面上标注「本号按房间内读数」 |
| 时刻 | 全部取截图的 `captured_at`，同一秒，不做时间对齐 |
| 排序 | `viewer_count` 降序；解析失败（`viewer_count` 为 null）的行显示 `viewer_text` 原文、排在末尾、不参与名次 |
| 名次 | 标准竞赛名次：并列同名次，下一名次跳过（212 / 117 / 117 / 67 → 1 / 2 / 2 / 4） |
| 覆盖范围 | 名单只覆盖「截图人的 TikTok 账号关注了、且侧栏当时显示出来的在库竞品」，不是全市场。界面上的「N 家」旁带说明提示 |
| 去重 | 同一 `shot_id` + `competitor_id` + `source` 在写入时已由唯一约束保证一行；纯函数不再去重 |

## 3. 数据与接口

### 3.1 取数方式：按需拉取

放大某张截图时，前端按 `shot_id` 请求一次该截图的读数，结果按 `shot_id` 缓存在放大页组件状态里（组件卸载即丢，下次打开重取）。翻到下一张再请求下一张。

不随相册窗口一起 join：相册按日期窗口一次取几十上百张，绝大多数不会被放大看，每个窗口多查一张表不划算；按需拉取对老截图零成本。

### 3.2 新接口 `GET /api/competitors/shots/[shotId]/readings`

- 鉴权：`authGuard()`，与 `GET /api/competitors/shots` 相同（未登录回 401 / 跳转）。
- 实现放 `src/lib/competitors/service.ts` 新函数 `getShotReadings(shotId)`：查 `competitor_viewer_readings` 按 `shot_id` 过滤，join `competitors` 取 `handle`、`display_name`。单张截图的读数最多几十行，不分页。
- `shotId` 必须是 uuid，否则 400。
- 响应：

```json
{
  "data": {
    "capturedAt": "2026-10-12T06:52:08.897Z",
    "rows": [
      { "competitorId": "…", "handle": "a", "displayName": "A", "source": "sidebar", "viewerCount": 212, "viewerText": "212" },
      { "competitorId": "…", "handle": "b", "displayName": null, "source": "current", "viewerCount": 67, "viewerText": "67" }
    ]
  },
  "error": null
}
```

- 截图不存在或没有任何读数：`data.rows` 为空数组，`capturedAt` 为 null，HTTP 200。前端把空数组当「没有同期」处理，不是错误。
- 查询失败：`{ data: null, error }`，状态码走 `httpStatusForError`。

### 3.3 不改表

`competitor_viewer_readings` 已有唯一约束 `(competitor_id, captured_at, source)` 与 `shot_id` 部分索引（`idx_competitor_viewer_readings_shot`），按 `shot_id` 查走该索引，不加迁移。

## 4. 纯函数 `src/lib/competitors/coLive.ts`

```ts
export interface CoLiveReading {
  competitorId: string
  handle: string
  displayName: string | null
  source: 'current' | 'sidebar'
  viewerCount: number | null
  viewerText: string | null
}

export interface CoLiveRow {
  competitorId: string
  label: string            // displayName || handle
  viewerCount: number | null
  viewerText: string | null
  rank: number | null      // 解析失败为 null
  isSelf: boolean
  barRatio: number         // viewerCount / 本批最大值，0..1；解析失败为 0
}

export interface CoLiveView {
  rows: CoLiveRow[]        // 已排序
  total: number            // 名单行数（含本号）
  selfRank: number | null  // 本号名次；本号没有可用读数时为 null
  selfFromCurrent: boolean // 本号的数来自 current 行（不在 Following 里）
}

export function buildCoLiveView(readings: CoLiveReading[], selfCompetitorId: string): CoLiveView | null
```

规则：

1. 取全部 `sidebar` 行。若本号没有 `sidebar` 行但有 `current` 行，把 `current` 行作为本号加入，`selfFromCurrent = true`。
2. 名单为空（既无 sidebar 行、本号也没有 current 行）返回 `null`，放大页整段不画。只有本号一行（`total = 1`）也返回 `null`：「同期在播 1 家 · 本号第 1 位」没有信息量。
3. 按 `viewerCount` 降序；null 排末尾、`rank` 为 null、`barRatio` 为 0。同值并列同名次。
4. `barRatio` 以本批最大 `viewerCount` 为分母；最大值为 0 或不存在时全部为 0。
5. `label` 取 `displayName`，空则 `handle`。

测试（`coLive.test.ts`，node --test）：

- 降序与并列名次（212 / 117 / 117 / 67 → 1 / 2 / 2 / 4）。
- 本号在 sidebar 里：用 sidebar 行，`selfFromCurrent = false`，current 行被忽略。
- 本号不在 sidebar 里：用 current 行，`selfFromCurrent = true`。
- 解析失败的行：排末尾、`rank = null`、`barRatio = 0`，显示原文。
- 空输入、只有本号一行：返回 `null`。
- `barRatio` 归一化：最大值为分母，最大值为 0 时全 0。

组件目录里没有 DOM 测试环境，所有判定逻辑必须在这个文件里，组件只做取数、缓存与渲染。

## 5. 放大页

### 5.1 位置与形态

`ShotLightbox` 底部渐变层，直播态 chips 那行（在线 / 开播 / 已播）的正下方、备注段之上，新加一段「同期」。

- **折叠（默认）**：一行摘要「同期在播 {total} 家 · 本号第 {rank} 位」+ 右侧展开箭头。`selfRank` 为 null 时摘要只写「同期在播 {total} 家」。摘要行整行可点，展开/收起与备注段同一套交互。
- **展开**：名单按 `rows` 顺序，每行三列：名字 / 人数（右对齐、等宽数字）/ 条形（宽度 = `barRatio`）。本号那行高亮（文字与条形换成强调色），其余灰色。名单下方一行小字：「{时刻} 同一秒读数 · 仅限截图人关注且侧栏可见的在库账号」，时刻按账号地区时区显示（复用 `useRegionZone`，与开播时刻同口径）。
- 摘要行「N 家」旁放一个信息图标，`title` 为覆盖范围说明；`selfFromCurrent` 为 true 时本号名字旁加一个小点，`title` 为「本号按房间内读数」。
- 名单里点别家那一行：先 `onClose()`，再 `scrollToCompetitorCard(competitorId)`。本号那行不可点。
- 手机（`< sm`）名单最多显示 8 行，超出内部滚动，摘要行始终可见；桌面不限。

### 5.2 渐变层开关

`shotOverlaySections` 加一项 `coLive: boolean`，由调用方传入「这张截图有可用的 CoLiveView」；`footer` 判据加上它。老截图与没有读数的截图 `coLive = false`，渲染结果与现在完全一致。`shotOverlay.test.ts` 补：只有 coLive 为 true 时 footer 也为 true；coLive 为 false 不影响其它段。

### 5.3 取数与状态

- 选中截图变化时，若缓存里没有该 `shot_id`，发请求；响应到达时若选中项已换，仍写入缓存但不触发显示。
- 加载中：这一段不画（不占位、不闪骨架），数据到了再出现。单次请求几十毫秒，闪骨架比晚出现更扰。
- 请求失败：摘要行位置显示一行「同期数据读取失败」，不可展开，不影响看图与其它段；再次切回该张时重试。
- 展开/收起状态随选中截图重置为折叠。

### 5.4 文案（三语，`competitors` 命名空间）

| key | zh | en | ja |
| --- | --- | --- | --- |
| `coLiveSummary` | 同期在播 {total} 家 · 本号第 {rank} 位 | {total} live at the same time · ranked #{rank} | 同時配信 {total} 件 · 本アカウント {rank} 位 |
| `coLiveSummaryNoRank` | 同期在播 {total} 家 | {total} live at the same time | 同時配信 {total} 件 |
| `coLiveScopeHint` | 仅限截图人关注且侧栏可见的在库账号，不是全市场 | Only tracked accounts the uploader follows and the sidebar showed; not the whole market | 撮影者がフォロー中でサイドバーに表示されていた登録アカウントのみ。市場全体ではありません |
| `coLiveSelfFromRoom` | 本号按房间内读数 | This account uses the in-room count | 本アカウントは配信画面内の数値 |
| `coLiveFootnote` | {time} 同一秒读数 | Same-second readings at {time} | {time} 時点の同時刻データ |
| `coLiveLoadFailed` | 同期数据读取失败 | Couldn't load co-live data | 同時配信データを読み込めませんでした |
| `coLiveExpand` / `coLiveCollapse` | 展开 / 收起 | Show list / Hide list | 一覧を表示 / 一覧を閉じる |

## 6. 文件清单

| 文件 | 变更 |
| --- | --- |
| `src/lib/competitors/coLive.ts` + `coLive.test.ts` | 新增：纯函数与测试 |
| `src/lib/competitors/service.ts` | 新增 `getShotReadings(shotId)` |
| `src/app/api/competitors/shots/[shotId]/readings/route.ts` | 新增接口 |
| `src/lib/competitors/shotOverlay.ts` + `shotOverlay.test.ts` | 加 `coLive` 开关 |
| `src/components/competitors/ShotLightbox.tsx` | 取数、缓存、渲染「同期」段 |
| `messages/{zh,en,ja}.json` | 七个 key |
| `src/lib/changelog/entries.ts` | 加一条 feat |
| `package.json` | 新测试文件登记进 test 脚本 |

## 7. 验收

- 单元：`coLive.test.ts`、`shotOverlay.test.ts` 全过；`npm run lint`、`tsc` 零警告。
- 真机（生产构建 `next build && next start`，dev 的 StrictMode 会让批量取数卡 loading）：
  1. 放大一张扩展上传、Following 里有多家在播的截图：摘要行数字与库里该 `shot_id` 的 sidebar 行数一致，名单顺序与人数一致，本号高亮。
  2. 放大一张本号不在 Following 里的截图：本号用 current 行，名字旁有小点。
  3. 放大一张自动巡检的老截图：没有「同期」段，底部与改动前一致。
  4. 点别家一行：灯箱关闭，页面滚到该竞品卡片。
  5. 手机宽度：名单超过 8 行时内部滚动，摘要行可见。
- 突变探针：把 `buildCoLiveView` 的排序方向、并列名次、current 回退各改坏一次，对应测试必须红。

## 8. 后续两期（不在本期）

- **当日横截面**：开播记录页按日期列出当天每次采样，横向排出各房间人数。聚合层在 `buildCoLiveView` 之上按 `captured_at` 分组，数据与接口不变。
- **相对大盘**：账号卡片加「本号人数 ÷ 同期中位数」；采样稀疏时波动大，口径需先用一个月数据试算再定。
