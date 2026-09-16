# 单直播间分钟级打点与场次报表 —— 设计

> 状态：已与 pollux 确认范围，待实现计划
> 日期：2026-08-20
> 关联能力：[竞品监测（Competitor Monitoring）](2026-07-28-competitor-live-dossier-design.md)、[TikTok 直播开播自动截图归档](2026-08-15-tiktok-live-shot-automation-design.md)

## 1. 背景与目标

现有竞品监测能力提供两种粒度的数据：

- **周粒度**：`competitor_snapshots` 记录主页粉丝/赞/关注，每周一个点，画周曲线。
- **场次粒度**：`competitor_shots` 每场直播归档一张截图，附带截图那一刻的 `viewer_count` / `stream_started_at` / `captured_at`。

两者之间缺一层：**一场直播内部发生了什么**。周曲线看不出节奏，单张截图只是一个孤立采样点——看不到起播爬坡、中段峰值、尾部掉人，也无法回答「他们做了什么动作让人数涨上去」。

本设计新增能力：**对单个竞品直播间做全场分钟级打点，产出一份可读的单场报表**。

核心价值不在于多一条曲线，而在于**数据点与画面证据在同一条时间轴上对齐**——看到某分钟的人数尖峰，能直接点开那一分钟的直播画面，看清是几个人在台前、在什么环节。数据说明「什么时候有效」，画面说明「做了什么」，合起来才是可复制的运营动作。

## 2. 已确认的范围决策

| 决策项 | 结论 |
| --- | --- |
| 跟踪对象 | 竞品直播间（非自家主播），反检测约束全程有效 |
| 采集范围 | 全场，从进房到检测下播，每分钟不落 |
| 采集字段 | 核心指标（在线人数 / 已播时长 / 主播粉丝数）+ 互动热度（弹幕条数·分、发言人数·分、点赞增量）+ 画面证据 |
| 截图策略 | 多采少留：全程高频候选，收工后按内容去重，一场 2h 收敛到 10~12 张有代表性的图 |
| 启动方式 | 人工启动。人看到对手开播后跑一行命令，采集器自己跑到下播收工 |
| 报表落点 | 独立场次详情页 `/competitors/[id]/lives/[sessionId]`，档案页加场次入口卡 |
| 并发 | 一次只跟一个房间，不做多房间并发 |

## 3. 关键约束

1. **不新建常驻服务器**。跑在 pollux 自己的 Mac 上，人工触发的前台进程。
2. **不新开无头浏览器**。沿用既有的专用 Chrome + 本机 CDP 通道（同 `scripts/live-watch/*`）。
3. **反检测优先于数据完整性**。任何为了多拿一个字段而增加暴露面的做法都不采纳。挂一整场本身是真实观众行为，但账号身份必须最小暴露。
4. **半自动，非无人值守**。启动、异常介入、收工确认都有人在旁边。这与现有直播截图自动化的定调一致。
5. **不采集弹幕原文**。只存计数，避免囤积无用文本与他人个人信息。

## 4. 架构总览

```
[人工] node scripts/live-watch/track-room.mjs --handle <handle>
   │
   ▼
专用 Chrome（CDP :9222）
   └─ 新 tab → /@handle/live → Target.activateTarget（前台）→ 静音
        └─ 页内探针（Runtime.evaluate 注入一次，幂等）
             ├─ MutationObserver 挂弹幕容器 → 持续累计消息数 + 发言人 Set
             └─ setInterval 60s → 读即时值 + 收割累计值并清零 → push window.__lw.buf
   ▲
   │  Runtime.evaluate 排空 buf（每 60s）
   │  Page.captureScreenshot 精裁（每 150s）
   │  健康探测 + 重注入（看门狗）
   │
runner（node 进程，全程驻留）
   │
   ├─ 每分钟 append 本地 JSONL：~/live-watch/<handle>/<session>/samples.jsonl
   ├─ 每 150s  写本地候选图：~/live-watch/<handle>/<session>/frames/<elapsed>.png
   │
   ▼（检测到下播 / 人工 Ctrl-C）
收工流水线（离线，不占直播时资源）
   ├─ 截图收敛：dHash 粗筛 → DeepSeek 视觉打标 → 按数据挑选 → 10~12 张
   ├─ 批量 upsert：competitor_live_sessions + competitor_live_samples
   └─ 上传选中截图 → competitor-shots 桶 + competitor_shots（带 session_id）
   ▼
报表页 /competitors/[id]/lives/[sessionId]
```

## 5. 采集机制

### 5.1 为什么必须是页内探针

外部每 60s 读一次 DOM 无法计算弹幕速率：弹幕是流式的，容器只保留当前可见的最后若干条，两次采样之间刷过去的消息读不到。**只要「互动热度」在采集范围内，累计逻辑就必须运行在页面上下文里**。这一条不是取舍，是需求推导出的结论。

即时值（在线人数、粉丝数、点赞总数）本可以外部读，但既然探针已经存在，统一由探针在同一时刻读取更好——保证一个采样点里的所有字段来自同一瞬间，而不是分散在几百毫秒的多次 evaluate 里。

### 5.2 页内探针职责

注入一次，常驻页面。挂载在 `window.__lw` 下，带 `version` 字段；重复注入时检测到同版本直接返回，不重复挂 observer。

- **MutationObserver**：监听弹幕列表容器的 `childList`。每个新增节点计一次消息，从节点内提取发言人标识加入 Set。只计数，不保留文本。
- **setInterval 60s**：读取当前在线人数、主播粉丝数、点赞总数、页面 `startTime`；连同本轮累计的 `chat_msgs` / `chat_speakers`（Set.size）一起打成一个采样点 push 进 `__lw.buf`，随后计数器与 Set 清零。
- **自检字段**：每个采样点带 `observer_alive`（observer 是否仍挂在有效节点上）与 `selectors_ok`（各字段是否成功读到）。这两个字段驱动看门狗，也决定报表上该点是否可信。

点赞增量在收工流水线里由相邻两点的 `like_total` 差分得出，探针只负责如实记录累计值——避免探针重启导致增量口径断裂。

### 5.3 外部 runner 职责

- **建链与准备**：连 CDP → 新建 tab → 导航 `/@handle/live` → `Target.activateTarget` 置前台 → 静音（复用 `sweep-live.mjs` 的 `EVAL`，它同时负责静音和计算 `object-fit` 真实画面矩形）→ 注入探针。
- **排空**：每 60s `Runtime.evaluate` 取走 `__lw.buf` 并清空，逐行 append 到本地 JSONL。采集期间不写数据库。
- **截图**：每 150s 用 `Page.captureScreenshot` + 探针返回的 clip 精裁一张，落本地。沿用现有的黑屏字节重试逻辑（小于 120KB 视为未渲染，重试）。
- **看门狗**：每轮排空后检查——buf 为空且上次也为空、`observer_alive` 为假、`<video>` 消失、页面 rehydration 出现 `status: 4` 且无 `status: 2`（复用 `sweep-live.mjs` 的 `roomEnded` 判法）。命中则先尝试重注入探针；重注入两次仍无数据则判定下播，进入收工。
- **前台要求**：tab 必须全程前台。截图需要渲染是显性原因；隐性原因是后台 tab 会被 Chrome 节流定时器，页内 60s 打点会漂成不规则间隔。运行时把这个 Chrome 窗口放到独立的 macOS Space。

### 5.4 场次边界

`session_key = stream_started_at`（页面 `startTime`，epoch 秒）。采集过程中若读到的 `startTime` 变化，说明对方下播后重开了一场——runner 收工当前场次，不自动续采新场次（人工启动的定调，新场次由人决定要不要跟）。

## 6. 身份与反检测策略

**首选游客态（不登录）**。不出现在观众列表，暴露面最小。

**已知冲突**：现有读在线人数的实现依赖登录后左侧「已关注」侧栏里匹配 handle 的 `person-count`（`scripts/live-watch/sweep-live.mjs` 的 `extractLiveMeta`），游客态没有这个侧栏。代码注释同时记录了右侧「观众」面板不稳定、常不渲染。因此游客态能否稳定读到在线人数是**开工前必须实测的第一件事**，决策规则见第 11 节。

其余硬约束，无论最终用哪种身份都成立：

- 全程 passive：不发弹幕、不点赞、不关注、不分享。
- 若必须登录，用与公会无关的干净小号，且**只登录不关注**——关注会把账号放进对方的关注者列表，比单纯登录暴露更大。
- 一次只跟一个房间。
- 出现验证码类异常时立即停止本场采集并发 macOS 通知，不自动重试。

## 7. 数据模型

采集期间只写本地 JSONL，收工后批量入库。理由：一场 2h 是 120 个采样点，逐点直写就是 120 次跨洋写入，笔记本休眠或网络抖动会直接丢数据；本地 append 永不丢，且失败后可以拿 JSONL 重新补录。

### 7.1 `competitor_live_sessions`

一行一场。

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid pk | |
| `competitor_id` | uuid fk | → `competitors(id)` on delete cascade |
| `stream_started_at` | timestamptz | 页面 `startTime`，场次身份 |
| `tracking_started_at` | timestamptz | 采集器进房时刻（通常晚于开播） |
| `tracking_ended_at` | timestamptz | 收工时刻 |
| `peak_viewers` | integer | |
| `avg_viewers` | integer | 按有效采样点平均 |
| `viewer_minutes` | bigint | Σ(viewer_count × 1 分钟)，即观看人次·分钟 |
| `follower_start` / `follower_end` | bigint | 首末有效采样点的粉丝数 |
| `follower_delta` | bigint | 本场净涨粉 |
| `chat_msgs_total` | integer | |
| `sample_count` | integer | 实际有效采样点数 |
| `expected_count` | integer | 采集时长 ÷ 60s |
| `notes` | text | 人工备注（异常、验证码、中断原因） |

`unique(competitor_id, stream_started_at)` —— 同一场重复入库走 upsert。

### 7.2 `competitor_live_samples`

一行一分钟。

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid pk | |
| `session_id` | uuid fk | → `competitor_live_sessions(id)` on delete cascade |
| `sampled_at` | timestamptz | 采样时刻 |
| `elapsed_seconds` | integer | 距开播秒数，报表 x 轴用这个 |
| `viewer_count` | integer | |
| `follower_count` | bigint | |
| `like_total` | bigint | 页面累计点赞 |
| `like_delta` | bigint | 相对上一有效点的增量，收工时算 |
| `chat_msgs` | integer | 本分钟弹幕条数 |
| `chat_speakers` | integer | 本分钟发言人数 |
| `raw` | jsonb | 原始读数与自检标记，留给以后加字段不用迁移 |

`unique(session_id, elapsed_seconds)` —— 防重复入库。

### 7.3 缺样语义

**采不到就不写行，绝不补 0**。报表必须能区分「0 人在看」和「那一分钟没采到」：

- 曲线在缺样区间画灰色断带，不连线。
- 覆盖率（`sample_count / expected_count`）上报表首屏。低覆盖率的场次在场次列表里打标，避免被当成可信数据引用。

### 7.4 截图表复用

不新建表。给现有 `competitor_shots` 加两列：

- `session_id` uuid，可空，→ `competitor_live_sessions(id)`
- `elapsed_seconds` integer，可空

可空是为了兼容全部存量截图（人工上传的、`live_auto` 单张的）。有 `session_id` 的截图天然钉在曲线上，同时仍然出现在现有相册里，不破坏 `ShotAlbum` / `ShotDateStrip` 的行为。

### 7.5 RLS

两张新表沿用仓库既有约定：`enable row level security` + `authenticated_only` 策略（`for all to authenticated using (auth.uid() is not null)`），与 `044_competitor_dossier.sql` 中的写法一致。

## 8. 截图成片流水线

收工后离线执行，不占直播时的资源。一场 2h 约 48 张候选，收敛到 10~12 张。

1. **粗筛**：按时间顺序算 dHash，与上一张保留帧的汉明距离低于阈值的直接丢弃。滤掉画面几乎静止的重复帧。
2. **打标**：存活帧送 DeepSeek 视觉模型，输出结构化结果 `{ people: '单人' | '双人' | '多人', scene: string, caption: string }`。`caption` 是一句中文描述，会作为截图的 `caption` 入库并显示在报表时间轴上。
3. **按标签收敛**：`people + scene` 相同且时间上连续的帧归为一段，**每段只保留一张——取该段内 `viewer_count` 最高的那一分钟**。让数据决定留哪一张，而不是取段首或段中。
4. **强制保留**：全场峰值、涨粉最快、掉人最狠这三个分钟对应的帧无条件保留，即使标签与相邻段重复。这三个时刻正是报表要解释的地方。
5. **入库**：选中帧上传 `competitor-shots` 桶，写 `competitor_shots`（`tag = 'live_track'`，带 `session_id`、`elapsed_seconds`、模型 `caption`）。

dHash 阈值、目标张数、强制保留规则都做成命令行参数。第一场跑完人工看结果再定默认值——这类阈值凭空拍数字必然要返工。

LLM 选型走 DeepSeek，与仓库既有的轻量 LLM 任务取向一致。

## 9. 报表页

路由 `/competitors/[id]/lives/[sessionId]`。档案页（`CompetitorDossierView`）加一排「直播场次」入口卡，每张显示日期、时长、峰值在线、净涨粉。

**首屏五个数字**：峰值在线 / 均值在线 / 观看人次 / 净涨粉 / 时长。下面一行小字挂采样覆盖率（如 `118/120`）。

**主图**：一条时间轴。

- x 轴用**开播后时长**而非墙上时间——这样不同场次可以叠在一起横向比较，也不受进房时间早晚影响。
- 主区面积图：在线人数。
- 右轴叠线：粉丝数。
- 底部条带：弹幕条数·分，作为热度带。
- 缺样区间：灰色断带，不连线。
- 时间轴上钉截图缩略图，hover 展开预览并显示模型 `caption`。

**下方胶片条**：本场保留的 10~12 张截图横排，点击任一张 → 曲线定位到对应 `elapsed_seconds`。

**复用**：图表底子沿用 `WeeklyFollowersCurve` 的实现路子，灯箱复用 `ShotLightbox`，保持竞品模块内部一致。

## 10. 不做

- **礼物与榜单**：本轮不采。这块 DOM 最不稳（面板需展开才渲染、结构改动频繁），且不在确认的字段范围内。
- **弹幕原文入库**：只存计数。
- **自动开播探测**：人工启动。轮询探测会把已经避开的「反复导航」行为加回来。
- **WebSocket 帧解码**：抓 webcast 帧能拿到最完整的礼物/进场/关注事件流，但是 protobuf 编码、逆向成本高且脆弱。列为以后真需要礼物流水时的升级路径，本轮不做。
- **多房间并发**：一次一个房间。
- **跨场次对比视图**：先把单场报表做对，多场叠加留到有三五场真实数据之后再谈。

## 11. 开工前必须验证的三件事

第一场当探路跑，不指望它直接产出漂亮报表。以下三项各自带明确的决策规则，验证结果直接改变方案形状：

**① 游客态能否稳定读到在线人数**
未登录打开一个在播的竞品直播间，检查 room header 区域是否存在稳定的观众数节点，连续观察 10 分钟看是否持续更新。
- 能稳定读到 → 采用游客态，暴露面最小。
- 读不到或频繁失效 → 降级为干净小号登录态，沿用现有侧栏 `person-count` 读法，且只登录不关注。

**② 弹幕容器的 MutationObserver 挂点是否稳定**
注入探针后观察 10 分钟，确认新增消息节点被正确计数、容器不会被整体替换导致 observer 脱落。
- 稳定 → 互动热度字段全部保留。
- 容器频繁重建 → 改为监听更高层的稳定祖先节点 + `subtree: true`，代价是需要过滤非弹幕的 DOM 变动。
- 仍不稳定 → 互动热度这组字段整体降级为「尽力而为」，报表上单独标注可信度，不作为核心指标呈现。

**③ 连挂 2 小时是否会被中断**
实测一整场，记录是否出现「你还在看吗」类挽留弹窗、自动降码率、断流重连、页面被动刷新。
- 无中断 → 看门狗保持轻量（探针失联才重注入）。
- 出现弹窗类中断 → 看门狗增加弹窗识别与关闭动作。
- 出现页面刷新 → 探针需要能在刷新后自动重挂（runner 侧监听 `Page.frameNavigated` 后重注入），且场次不能因为刷新被误判为结束。

## 12. 分期与验收

**第一期 —— 采集链路跑通**
交付 `scripts/live-watch/track-room.mjs`（探针 + runner + 看门狗）与本地 JSONL 输出。验收：完整跟完一场真实直播，JSONL 采样点数达到预期的 90% 以上，第 11 节三项验证有明确结论。

**第二期 —— 入库与成片**
交付两张新表的迁移、`competitor_shots` 加列、收工流水线（截图收敛 + 批量 upsert）。验收：第一期那场的 JSONL 能完整补录入库，截图收敛到 10~12 张且人工确认「每张内容确实不同」。

**第三期 —— 报表页**
交付场次入口卡与场次详情页。验收：报表上的峰值时刻能点开对应画面，缺样区间正确显示为断带而非零值。

迁移文件写完必须真正执行（用 agent-service 的 `SUPABASE_DB_URL` + `psql`），并跑 `npm run audit:rls` 核查 RLS——迁移文件本身只是意图，不代表数据库状态。
