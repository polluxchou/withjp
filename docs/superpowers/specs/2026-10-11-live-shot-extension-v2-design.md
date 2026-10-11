# 竞品直播截图插件第二版 —— 设计

第一版设计见 `2026-10-09-live-shot-extension-design.md`（下称「第一版」），本文只写改动。

## 1. 背景与目标

第一版已上线：人在 TikTok 直播间点插件图标，自动截下竖屏直播画面、读当前房间与 Following 侧栏同期竞品的在线人数，点「上传」写进后台。上线后有三个问题：

1. **截图只活在弹窗里**：弹窗一关，没上传的图就丢了。本机只记了一个当日截图计数。
2. **晚传的图会归错日期**：后台只认 1 小时内的截图时刻，再晚就改用服务器时间，归档日期可能错一天。
3. **侧栏同期人数时有时无**：首日真机上传中，前 10 次一条侧栏读数都没写进去，之后 21 次每次都有。

第二版的目标：

1. 插件本地暂存最近 9 张还没上传的截图，可以逐张补传或删掉。
2. 后台接受 24 小时内的截图时刻，补传的图按截图时刻归档。
3. 堵住侧栏判定的漏洞，并在弹窗里显示侧栏有没有读到、没读到的原因。

## 2. 已确认的决策

| 决策 | 结论 |
| --- | --- |
| 暂存位置 | 插件自己的 IndexedDB（图片直接存为 Blob），不用 `chrome.storage.local` |
| 暂存上限 | 9 张；满了新截的挤掉最旧的，并提示被挤掉的是哪张 |
| 是否含刚截的这张 | 含。「未上传 N 张」就是本地实际存着的张数 |
| 处理方式 | 逐张放大确认后「上传」或「删掉」；不做一键全部上传，不跨浏览器同步 |
| 暂存区版式 | 横排缩略图，可横向滚动；每张下面两行小字：时:分、`@账号` |
| 过期 | 插件这边截图满 23 小时 50 分置灰，只能删；后台窗口 24 小时 |
| 「今日 截图 N」 | 口径不变：本机截图成功次数，日本时间每天归零 |
| 「今日 上传 M」 | 改按**上传时刻**的日本日期计（第一版按截图日期），补传昨天的图当天也加一 |
| 侧栏判定 | 按频道标题认 Following；认不出标题才退回「2 个以上取第一个」 |
| 侧栏状态 | 读取时附带状态码，弹窗显示「同期 N 个」或没读到的原因 |
| 权限 | 不新增；manifest 版本号升到 0.2.0 |

## 3. 本地暂存区

### 3.1 一条暂存记录

```js
{
  id: string,          // crypto.randomUUID()
  handle: string,      // 小写，来自直播间网址
  blob: Blob,          // 裁好的 webp，与第一版上传的是同一个对象
  reading: {           // api.upload 现有入参的子集，原样存、原样传
    capturedAt: number,          // 页内读数时刻（毫秒），上传时作 captured_at，重试去重靠它
    viewer: string | null,
    viewerSource: 'room' | 'anchored' | 'sole' | null,
    coLive: { handle: string, viewer: string | null }[] | null,
    coLiveStatus: string | null, // 见 6.3
  },
  partial: boolean,    // 上传回过 207：截图已入库、人数待补
}
```

`api.upload({ blob, handle, reading })` 的签名不变，暂存记录可直接喂给它。

### 3.2 规则：`extensions/live-shot/lib/stash.js`（纯函数）

| 名称 | 说明 |
| --- | --- |
| `STASH_MAX = 9` | 上限 |
| `STALE_AFTER_MS = 23h50m` | 比后台的 24 小时提前 10 分钟，留给上传耗时与本机时钟偏慢。后台遇到超窗口的时刻不是拒收，而是改用服务器时间，卡在边界上传会归错日期 |
| `planInsert(items, incoming)` | 返回要挤掉的记录：把现有记录与新记录按 `reading.capturedAt` 升序（同一时刻按 `id` 升序，结果确定）排好，总数超出 `STASH_MAX` 的部分从最前面挤掉；新记录本身不会被挤掉 |
| `isStale(item, nowMs)` | `nowMs - capturedAt >= STALE_AFTER_MS`。截图时刻在未来（本机时钟被往回拨过）不算过期 |
| `stripOrder(items)` | 新的在左 |
| `tileTime(capturedAt, nowMs, timeZone?)` | 按 `timeZone`（缺省为本机时区）比日期：与 `nowMs` 同一天给「14:05」，前一天给「昨 09:02」，其它（更早或在未来）给「10-08 09:02」 |
| `evictionNotice(evicted, timeZone?)` | 「最早 1 张未上传的已被挤掉（@xxx 10:02）」；挤掉多张时写张数和最早那张 |

### 3.3 存储：`extensions/live-shot/lib/stashDb.js`（IndexedDB 薄外壳）

- 库名 `live-shot`，版本 1，对象仓库 `stash`，`keyPath: 'id'`。
- `listStash()`：取全部记录。
- `insertStash(item)`：**一个 readwrite 事务内**读全部 → `planInsert` → 写新记录、删被挤掉的，返回被挤掉的记录。两个窗口同时开弹窗截图时，事务排队执行，不会出现 10 张或删错。
- `markPartial(id)`、`removeStash(id)`。
- 外壳只做读写，不含判断。node 没有 IndexedDB，这一层靠真机验收覆盖（见第 8 节）。

### 3.4 出错兜底

- IndexedDB 打不开或写失败（如磁盘空间不足）：刚截的这张仍可直接上传（只在内存里），顶部提示「本地暂存失败」，不卡住流程。
- 弹窗在上传途中被关掉：记录还在暂存区，再上传时后台按（上传人、竞品、截图时刻）认出是同一张，不会多出一张。

## 4. 弹窗交互

宽度不变。文案中文直写。

### 4.1 主界面

- **顶部卡片**（同第一版）：打开弹窗即自动截当前直播间 → 缩略图、`@账号`、「✓ 截图」「✓ 人数数据」，**新增第三行侧栏状态**（见 6.3）。按钮「上传」，回车即上传。截好即写入暂存区；挤掉了旧图时，卡片下方显示 `evictionNotice` 一行小字。
- **暂存区**：标题「未上传 N 张」，下面横排缩略图（新的在左，可横向滚动）。每张下面两行小字：`tileTime`、`@账号`（放不下用省略号截断，鼠标悬停显示全名）。
  - 刚截的这张：蓝色描边；
  - `partial`：右上角黄点；
  - 过期：缩略图与文字置灰。
  - 暂存区为空时整块不显示。
- **底部**（同第一版）：「今日 截图 N · 上传 M」+「退出」。
- 不在直播间页面、截图失败时：顶部卡片显示原因与「重试」（同第一版），**暂存区照常可用**。

### 4.2 放大确认页

点任意一张缩略图进入，替换主界面：

- 大图预览；`@账号 · 10-10 13:41`（本机时区）；「人数 1.2K · 同期 3 个」，没读到的项按 6.3 的文案显示。
- 按钮「上传」（主按钮）、「删掉」、「返回」。
- **删掉要点两次**：第一次点后按钮变成「确认删掉」，3 秒内再点才删，超时复原。
- 过期的图：「上传」换成灰字「已过期，请重新截」，只能删或返回。

### 4.3 上传结果（顶部卡片与确认页一致）

| 后台响应 | 显示 | 暂存区 |
| --- | --- | --- |
| 201 | 「已上传」；确认页 1.5 秒后自动回主界面 | 移出 |
| 207 `readings_failed` | 「截图已上传，人数没写进去」+「补写人数」 | 留着，`partial = true`；再传成功（201）后移出 |
| 401 | 回登录表单 | 不动 |
| 404 `not_in_library` 等其它错误 | 原因 +「重试」（文案同第一版 `uploadErrorMessage`） | 留着 |

上传成功后用响应里的 `today_uploads` 刷新底部计数（同第一版）。退出登录不清暂存区。

## 5. 后台改动（不改表结构）

### 5.1 截图时刻窗口放宽到 24 小时

- `src/lib/competitors/quickShot.ts`：`MAX_PAST_SKEW_MS` 由 1 小时改为 24 小时；快 5 分钟的上限不变；超窗口仍改用服务器时间。同步改注释。
- 归档日期 `shotOnFor(capturedAt)` 算法不变：昨晚截、今早补传的图归昨天。
- 重试去重不变：`findShot(created_by, competitor_id, captured_at)` + 部分唯一索引。

### 5.2 「今日上传」按上传时刻计

- `quickShot.ts` 新增 `jstDayBounds(ms) → { startIso, endIso }`：`ms` 所在日本时间自然日的 [00:00, 次日 00:00)，日本无夏令时，终点 = 起点 + 24 小时。
- `QuickShotDeps.countTodayUploads(userId, bounds)`：第二个参数由日期字符串改为 `{ startIso, endIso }`。POST 与 GET 都传 `jstDayBounds(deps.now())`。
- `route.ts` 的查询：`created_by = userId`、`tag = 'live_manual'`、`created_at >= startIso`、`created_at < endIso`。现有部分索引 `(created_by, shot_on)` 的前缀可先按上传人缩小范围，数据量小，不另建索引。
- 第一版已知限制「跨日本时间零点上传时今日上传不加一」随之消失。
- 去重命中（同一张重传）不新增行，计数不变，这是对的。

## 6. 侧栏同期人数

### 6.1 排查结论

- 首日真机上传共 31 次：前 10 次侧栏读数全为 0，之后 21 次每次 5–9 条。期间插件与后台代码未改，上传人相同。
- 在负责人的 Chrome 里实测（已登录）：频道 2 个，第一个标题「Following」、第二个「Suggested LIVE creators」；Following 下 5 个在播账号都有账号名、人数、链接，且全部在竞品库。窗口缩到 500px（侧栏收成头像）时，页面里账号名与人数仍在，读取不受影响。
- 实测当时点插件上传，写入当前房间 1 条 + 侧栏 5 条，整条链路正常。

结论：失败的 10 次是页面状态问题，侧栏当时只剩 1 个频道。可能是 TikTok 未登录（只有推荐区），也可能是只有 Following、没有推荐区。后者暴露了第一版判定的漏洞：「频道不足 2 个就当作只剩 Suggested」会把唯一的 Following 频道也丢掉。

### 6.2 修法：按标题认 Following

`ProbeConfig` 新增两个可选字段，只在设置了 `sidebarChannel` 时生效：

- `sidebarChannelTitle?: string[]`：频道标题元素的候选选择器，扩展配置为 `['[data-e2e="live-side-nav-channel-title"]']`；
- `followingTitles?: string[]`：Following 频道的标题（小写、去首尾空白、连续空白压成一个后**整串相等**才算），扩展配置为 `following`、`关注`、`已关注`、`正在关注`、`追蹤中`、`フォロー中`、`フォロー`。

`sidebarRoot()` 的判定顺序：

1. 未设 `sidebarChannel`：整页读，与现在完全一致（分钟级采集器）。
2. 频道容器一个都没找到 → `no_channels`，不读。
3. 有频道的标题命中 `followingTitles` → 读这个频道（不论一共几个、排第几）。
4. 没有标题命中、频道 ≥ 2 → 读第一个（第一版规则，兜底标题文案变化）。
5. 否则（只有 1 个频道且标题不像 Following）→ `no_following`，不读，绝不拿推荐区顶替。

未配置 `sidebarChannelTitle` / `followingTitles` 时跳过第 3 步，其余与第一版一致。

### 6.3 侧栏状态与弹窗提示

- 探针在设置了 `sidebarChannel` 时，读数里多一个 `co_live_status`：`ok` / `no_channels` / `no_following` / `empty`（找到了 Following 频道，但没有带账号名的条目）。**未设置时读数结构不变**，不出现这个键，分钟级采集器不受影响。
- `pageReader.ts` 的读取函数把它带出为 `coLiveStatus`；`extensionProbeConfig()` 加上 6.2 的两个字段。改完重跑 `scripts/gen-extension-reader.mjs` 并提交 `generated/page-reader.js`。
- `lib/view.js` 新增 `coLiveLine(status, coLive)`，弹窗第三行与确认页用同一份文案：

| 状态 | 文案 | 色调 |
| --- | --- | --- |
| `ok` | ✓ 同期 N 个（N = 读到的 Following 条目数，含当前房间与不在库的，入库时再过滤） | ok |
| `no_following` | ⚠ 同期没读到：侧栏只有推荐区（TikTok 没登录，或关注的人都没在播） | warn |
| `no_channels` | ⚠ 同期没读到：没找到侧栏（页面结构可能变了） | warn |
| `empty` | ⚠ 同期没读到：Following 区是空的 | warn |
| 其它 / 缺失 | ⚠ 同期没读到 | warn |

- 只是提示，不拦上传。后台不接收也不存这个状态码。

## 7. 文件改动一览

| 文件 | 改动 |
| --- | --- |
| `src/lib/competitors/liveProbe.ts` / `.test.ts` | `ProbeConfig` 两个新字段、`sidebarRoot` 判定与状态码、`co_live_status` |
| `src/lib/competitors/pageReader.ts` / `.test.ts` | 扩展配置加字段、读取函数带出 `coLiveStatus` |
| `extensions/live-shot/generated/page-reader.js` | 重新生成 |
| `src/lib/competitors/quickShot.ts` / `.test.ts` | 24 小时窗口、`jstDayBounds` |
| `src/lib/competitors/quickShotService.ts` | `countTodayUploads` 传区间 |
| `src/app/api/competitors/quick-shot/route.ts` | 计数查询改按 `created_at` |
| `src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts` | 计数区间、隔天补传用例 |
| `extensions/live-shot/lib/stash.js` / `stash.test.ts` | 新增：暂存规则 |
| `extensions/live-shot/lib/stashDb.js` | 新增：IndexedDB 外壳 |
| `extensions/live-shot/lib/view.js` / `lib.test.ts` | `coLiveLine` |
| `extensions/live-shot/popup.{html,css,js}` | 暂存区、确认页、第三行状态 |
| `extensions/live-shot/manifest.json` | 版本 0.2.0 |
| `extensions/live-shot/README.md` | 使用说明、已知限制、换加载目录的注意事项 |
| `docs/competitors.md` | 「今日上传」口径、扩展说明 |
| `docs/superpowers/specs/2026-10-09-live-shot-extension-design.md` | 顶部加一句指向本文 |
| `src/lib/changelog/entries.ts` | 更新日志条目 |
| `package.json` | `test` 行登记 `extensions/live-shot/lib/stash.test.ts` |

## 8. 测试

- `stash.test.ts`：满 9 张挤掉最旧（含一次挤多张、同一时刻按 id 定序）、未满不挤；`isStale` 在 23h49m59s / 23h50m 两侧、未来时刻不过期；`stripOrder`；`tileTime` 同日 / 昨天 / 更早（显式传时区，不依赖跑测试机器的时区）；`evictionNotice` 单张 / 多张。
- `lib.test.ts`：`coLiveLine` 每个状态的文案与色调、`ok` 时 N 的计法。
- `liveProbe.test.ts`：只有一个标题为 Following 的频道 → 读它；Suggested 在前、Following 在后 → 读 Following；标题都不认识且 ≥ 2 → 读第一个；只有一个 Suggested → `no_following`；无频道 → `no_channels`；Following 无条目 → `empty`；未设 `sidebarChannel` → 读数里没有 `co_live_status` 键，`defaultProbeConfig()` 不含新字段（采集器 `cfgKey` 不变）。
- `pageReader.test.ts`：扩展配置含新字段；注入模拟返回 `coLiveStatus`；生成文件逐字一致。
- `quickShot.test.ts`：23h59m 前的时刻原样保留、24h 多 1 秒回落到服务器时间；`jstDayBounds` 在日本时间零点前后、UTC 跨日时的取值。
- 集成测试：POST / GET 的计数依赖收到 `jstDayBounds(now)`；昨天截、今天传 → `shot_on` 是昨天、计数区间是今天。
- 新测试文件登记进 `package.json` 的 `test` 行；审查时跑突变探针并交击杀表。
- **真机验收**（IndexedDB 与弹窗没有 node 测试，必须过）：
  1. 截 3 张不传、关弹窗再开 → 3 张都在，刚截的蓝框；
  2. 补传其中一张 → 移出暂存区，「上传 M」加一，竞品相册里按截图时刻的日期出现；
  3. 连截到第 10 张 → 最旧的被挤掉并有提示；
  4. 删掉要点两次，3 秒不点复原；
  5. 非直播间页面打开弹窗 → 顶部报原因、暂存区可用；
  6. 退出再登录 → 暂存区还在；
  7. 侧栏第三行：正常页面显示「✓ 同期 N 个」，与 `competitor_viewer_readings` 里该次的 sidebar 行数（只算在库账号）对得上；
  8. 过期置灰：在真机上把一条记录的截图时刻改成一天前（DevTools → Application → IndexedDB 手改），确认置灰且只能删。

## 9. 已知限制（有意不在本期处理）

- 在直播间页面打开弹窗总会自动截一张，哪怕只是想处理积压；满 9 张时会挤掉最旧的一张（有提示）。
- 暂存区只在当前浏览器、当前插件目录里，不跨浏览器同步。退出登录不清；同一浏览器换另一个后台账号登录后上传，记在新账号名下。
- Chrome 按加载目录区分未打包插件：**换加载目录相当于换了一个插件**，需要重新登录，原目录下的暂存图不会跟过去。
- 本机时钟比服务器慢 10 分钟以上时，临近过期的图仍可能被后台改用服务器时间。
- 第一版已知限制里「时钟慢 1 小时」的阈值相应变为 24 小时。

## 10. 不做

- 一键全部上传、跨浏览器同步、修改人数或截图时刻。
- 后台拒收超窗口的截图时刻（维持「改用服务器时间」）。
- 后台存侧栏状态码、展示人数读数。
- 第一版「不做」清单照旧。

## 11. 上线顺序

1. 合并后核对 Vercel 生产部署（后台改动对第一版插件向下兼容：第一版不传新字段，24 小时窗口只是放宽）。
2. 插件改从主仓目录加载并重新生成配置；按第 9 节，换目录后需要重新登录一次。确认新目录可用后，才能清理旧的插件目录。
