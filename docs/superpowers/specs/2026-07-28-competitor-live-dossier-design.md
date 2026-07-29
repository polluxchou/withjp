# 竞品团播档案（Competitor Live Dossier）设计文档 —— 扩展已上线的竞品模块

> 状态：设计待用户复核 → 写实现计划（writing-plans）。
> 本文档是对**已上线** `competitors` 模块（PR #131/#132/#133，文档 `docs/competitors.md`）的**扩展**，不是新建模块。

## 1. 背景与目标

已上线的竞品监测回答的是「竞品 TikTok 主页涨得怎么样」——按天打点粉丝 / 获赞 / 视频量，展示为历史表 + 粉丝折线。

用户实际的调研工作流（Lark 文档）比这更进一步，聚焦**日区 TikTok 团播**（多人团体直播），且**以视觉为主**：

- **「4.6 近期挖掘日区团」**：每个团一份档案——团名 + @handle、人数与构成（女子5人团 / 本地·跨区）、开团城市+日期、MC 配置、在线人数与 PK 观察、**全妆截图**、粉丝数（带采集日期）。
- **「4.4 一周妆造比较」**：团 × 星期几 的截图网格，逐日比对每个团的妆造。

**本次目标**：在现有模块上扩展出一个**图为主的团播档案库**——
1. 支持**手动上传直播间截图**（重点看服饰 / 场景），按团归档、随时翻看。
2. 把 Lark 的**团级档案字段**（人数构成 / 开团 / MC / 在线观察 / 最新视频 / 头像）补进来。
3. 首页 `/competitors` 改为**截图墙优先**（图为主），文字档案退居紧凑条 + 展开区。
4. 保留并强化**粉丝趋势**：在卡片上给出**按周聚合**的粉丝曲线（数据来自现有 `competitor_snapshots`）。
5. 写权限从「仅管理员」放开为「**所有登录用户**」。

**非目标（明确不做）**：
- 直播间实时数据采集（在线曲线、逐分钟人数、GMV 实时）——`online_note` 只存人工观察到的近似值。
- 自动化定时爬虫 / 定时跑数（沿用现有「内部按需 + Claude 采集」）。
- 单个团员（成员级）拆分建档。
- 「一周妆造」网格视图——**第二期**；本次只把带 `shot_on` 的截图数据备好。

## 2. 现有模块基线（改造前）

| 层 | 现状 |
| --- | --- |
| 表 | `competitors`(handle/profile_url/display_name/note/platform)、`competitor_snapshots`(每日 followers/likes/videos/following/display_name/bio/region/verified/raw) |
| 域 | `metrics.ts`(parseCount/formatCount)、`chart.ts`(buildSparklinePoints)、`assemble.ts`(parseHandleFromUrl/assembleBoard)、`types.ts`、`service.ts`(看板 + CRUD，**三处 requireAdmin**) |
| API | `GET/POST /api/competitors`、`PATCH/DELETE /api/competitors/[id]` |
| 视图 | `CompetitorMonitoringView`(每行基础信息 + 最新指标 + 展开历史表 + `Sparkline` 粉丝日折线) |
| 采集 | `scripts/record-competitor-snapshot.ts`(service-role，写快照) |
| 导航 | 「创作者」分组下：创作者列表 `/creators` + 竞品监测 `/competitors` |
| 写权限 | **仅管理员** `is_admin` |

数据分工原则（延续）：**随时间变化的身份 / 指标**（display_name / bio / region / verified / followers / likes / videos）留在 `competitor_snapshots`，卡片取最新一条；**团级稳定属性**（本次新增）落在 `competitors`。

## 3. 数据模型改动

### 3.1 迁移 `043_competitor_dossier.sql`

> main 当前最大迁移号为 042，本扩展用 043。⚠️ **跨分支编号冲突风险**：并行的 `feat/worktask-taskitem-link` 分支已各自新增 042/043 号迁移（内容不同）。合并顺序靠后的一方需重编号——落地时与主仓核对。

**A. 扩 `competitors`（团级稳定属性，均可空，不破坏现有行）**

```sql
alter table competitors add column if not exists avatar_url    text;
alter table competitors add column if not exists region        text not null default 'JP';
alter table competitors add column if not exists member_count  integer;
alter table competitors add column if not exists composition   text;   -- 如 '女子团·本地' / '女子团·跨区'
alter table competitors add column if not exists launch_city   text;
alter table competitors add column if not exists launched_on   date;
alter table competitors add column if not exists mc_note        text;   -- 'MC 不出镜男' / '一男一女双MC'
alter table competitors add column if not exists online_note    text;   -- '在线40人左右，PK 100~300'
alter table competitors add column if not exists latest_videos jsonb;  -- [{ url, title? }]
```

> `bio / followers / videos / 采集日期` 不加到 competitors——继续从 `competitor_snapshots` 最新一条取（`采集日期` = 最新 `captured_on`）。

**B. 新表 `competitor_shots`（截图，手动上传）**

```sql
create table if not exists competitor_shots (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  image_url     text        not null,
  shot_on       date,                                  -- 拍摄/直播日期（→ 第二期排「团×星期几」网格）
  tag           text,                                  -- '全妆' / '常服' / '主题'（自由文本）
  caption       text        not null default '',
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_competitor_shots_competitor
  on competitor_shots(competitor_id, shot_on);
```

**C. RLS**：`competitor_shots` 启用 RLS + `authenticated_only`（`for all to authenticated using (auth.uid() is not null)`），与现有两表同一 `do $$ ... $$` 套路。

### 3.2 Storage

新建 public bucket `competitor-shots`（与现有 `item-photos` 同套路，非 SQL——经 Supabase 控制台 / API 建桶）。上传路由照搬 `src/app/api/items/photo/route.ts`：校验 `image/png|jpeg|webp|gif` + 限 5MB → `storage.from('competitor-shots').upload` → `getPublicUrl`。头像走 Claude 抓取先存远程 URL；如需稳定可后续再落桶（本期不强制）。

## 4. 域层改动（`src/lib/competitors/`）

### 4.1 `types.ts`

- `Competitor` 追加：`avatar_url / region / member_count / composition / launch_city / launched_on / mc_note / online_note / latest_videos`（均可空，`latest_videos: { url: string; title?: string }[] | null`）。
- 新增 `CompetitorShot`（对应新表列）。
- 新增 `WeeklyPoint { week_start: string; followers: number | null }`（按周聚合点）。
- `CompetitorWithHistory` 追加 `shots: CompetitorShot[]` 与 `weekly: WeeklyPoint[]`。
- `CompetitorBoard.canEdit`：语义改为「所有登录用户」恒 true。

### 4.2 新纯函数 `weekly.ts`（+ 单测）

```ts
// bucketFollowersByWeek：把日快照按 ISO 周聚合，每周取该周最后一次快照的 followers。
// 输入按 captured_on 升序的快照点，输出按 week_start(周一 YYYY-MM-DD) 升序的 WeeklyPoint[]。
export function bucketFollowersByWeek(
  history: { captured_on: string; followers: number | null }[],
): WeeklyPoint[]
```

- 复用现有 `chart.ts` 的 `buildSparklinePoints` 画曲线几何（把 `weekly.map(w => w.followers)` 过滤非空后喂进去）。
- 单测：单周多点取最后一条、跨周分桶、空 followers 跳过、空输入返回 `[]`、跨年 ISO 周边界。

### 4.3 `assemble.ts`

`assembleBoard` 扩展：额外接收 `shots: CompetitorShot[]`，按 `competitor_id` 聚合进各团（`shot_on` 倒序 + `sort_order`）；对每个团调 `bucketFollowersByWeek(history)` 填 `weekly`。保持纯函数、补单测。

### 4.4 `service.ts`

- **放开写权限**：删除 `addCompetitor / updateCompetitor / deleteCompetitor` 里的 `requireAdmin` 调用；`getCompetitorBoard` 的 `canEdit` 直接置 `true`（不再查 `is_admin`）。`requireAdmin` / `getActorProfile` 若无其他引用则一并移除。（`ServiceErrorCode` 保留 `forbidden` 不碍事。）
- `getCompetitorBoard`：并行多查一张 `competitor_shots`，传入扩展后的 `assembleBoard`。
- `addCompetitor` / `updateCompetitor`：入参扩展到接受新团级字段（`avatar_url / region / member_count / composition / launch_city / launched_on / mc_note / online_note / latest_videos`），供 Claude 抓取回填与手填共用。`addCompetitor` 维持「确保存在」语义。
- 新增 `addShot / updateShot / deleteShot`（截图 CRUD，`ServiceResult`）。

## 5. API 改动

| 方法 | 路由 | 说明 |
| --- | --- | --- |
| GET | `/api/competitors` | 看板（现有；返回体扩展含 shots + weekly + canEdit=true） |
| POST | `/api/competitors` | 加团（现有；body 扩展新字段） |
| PATCH | `/api/competitors/[id]` | 改团（现有；body 扩展新字段） |
| DELETE | `/api/competitors/[id]` | 删团（现有；级联删 shots） |
| POST | `/api/competitors/upload` | **新增** 截图文件 → Storage → 返回 URL（照搬 items/photo） |
| POST | `/api/competitors/[id]/shots` | **新增** 加截图记录 `{ image_url, shot_on?, tag?, caption?, sort_order? }` |
| PATCH·DELETE | `/api/competitors/shots/[shotId]` | **新增** 改 / 删截图 |

所有路由沿用现约定：`authGuard()` → service → `NextResponse.json({ data, error })`，`authGuard` 失败返回 401（`instanceof NextResponse`）。无 server action、无 `revalidatePath`；client 增删改后重取 `GET /api/competitors`。

**Claude 协助抓取工作流**（延续现有采集脚本 + API）：用户贴主页链接 → Claude 用内置浏览器读 profile（头像 / 简介 / 粉丝 / 视频量 / 最新视频）→（a）写一条快照（`record-competitor-snapshot.ts`，落 followers/bio/region 等时序字段）+（b）`PATCH /api/competitors/[id]` 回填团级字段（avatar_url / 人数 / 开团 / MC…）。**截图始终由用户手动上传**。

## 6. 视图改动（图为主）

`/competitors` 从「历史表 + 日折线」改版为**截图墙优先**的档案库。新增/改写组件：

- `CompetitorDossierView`（改写自 `CompetitorMonitoringView`）：顶部添加框（贴 URL / @handle 建团）+ 按团分区列表。
- `CompetitorCard`：卡头**紧凑档案条**（头像 + 团名 + 认证 + @handle + `JP` 标 + 一行指标：视频 / 人数构成 / 在线 / 采集日期）；卡体为 **1:3 双栏**——左 1/4 `WeeklyFollowersCurve`，右 3/4 `ShotAlbum`；档案条下方是**展开档案**区。窄屏（移动端）双栏回落为上下堆叠。
- `WeeklyFollowersCurve`（左栏 1/4）：`粉丝 · 近4周` 小曲线（复用 `Sparkline` / `buildSparklinePoints`），顶部当前值 + 周环比，取 `weekly` 的**最近 4 个周点**。
- `ShotAlbum`（右栏 3/4）：竖屏 9:16 缩略图，角标显示日期 + tag；点击 → lightbox 放大看服饰。**混合浏览**：
  - **默认（折叠态）**：横向单行只显示**最近一段**（最近一周或最近 ~6 张，横向滚动），保持首页对多团的总览可扫；行尾 `ShotUploader` 上传格。
  - **「查看全部（N）」展开态**：在该团卡内展开成**按周分组的纵向网格**——每周一行（新周在上），行内该周截图横向平铺。横向=同周内、纵向=跨周，与按周曲线 + 第二期「一周妆造」网格一致。
  - 分组依据 `shot_on` 的 ISO 周；`shot_on` 为空的截图归入「未标日期」分组垫底。
- 展开区（`⌄`）：完整团级字段（开团城市/日期、MC、online_note、最新视频链接、备注）+ 保留**原有历史打点表**（按日期倒序的 followers/likes/videos）。

现有 `Sparkline.tsx` 保留复用（曲线组件基础）。UI 文案全部走 `useTranslations('competitors')`，禁止裸中文（`test:no-bare-han`）。

**入口**：不变——已在「创作者」分组下 `/competitors`（无需改 Sidebar）。

**第二期（先不做，留好料）**：「一周妆造」网格——选一周 → 团 × 星期几 排 `shot_on` 落在该周的截图 + 一周汇总。数据全靠已存的 `shot_on`。

## 7. 错误处理

沿用现有 `ServiceResult<T>` 与 `httpStatusForError`（`invalid_input 400 / forbidden 403 / not_found 404 / db_error 500`）。加团 url/handle 非法 → `invalid_input`；上传类型/体积不符 → 400（照搬 items/photo 文案）；client `addFailed` / `uploadFailed` 提示，删除前 `confirm`。

## 8. 测试

- 新增 `weekly.test.ts`：`bucketFollowersByWeek`（单周取末点 / 跨周分桶 / 空值跳过 / 空输入 / 跨年 ISO 周）。
- 扩 `assemble.test.ts`：截图按团聚合 + 排序、`weekly` 填充、无截图团 `shots=[]`、`canEdit` 恒 true。
- 现有 `metrics.test.ts` / `chart.test.ts` 保持通过；新增测试文件接入 `package.json` 的 `test`。
- 触库 service / route 不做单测，靠类型检查 + 浏览器手测（空态、加团、Claude 抓取回填、传截图后墙内出现、周曲线随快照增长、删除级联）。
- 守卫：`npm run test:i18n`、`npm run test:no-bare-han`、`npx tsc --noEmit`、`npm run lint && npm run build`。

## 9. 文档

改写 `docs/competitors.md`：模块定位从「主页指标监测」升级为「主页指标 + 团播档案（截图 / 团级字段 / 按周粉丝曲线）」；更新数据模型、API、写权限（改为所有登录用户）、边界（截图为人工归档、非实时直播数据）。

## 10. Key Decisions

| 维度 | 决策 |
| --- | --- |
| 与现有模块 | **扩展**已上线 `competitors` 模块，非新建 |
| 结构 | 团档案卡 + 截图相册 + 按周粉丝曲线（图为主落地页） |
| 字段分工 | 时序身份/指标留 `competitor_snapshots`（含粉丝/视频）；团级稳定属性加到 `competitors` |
| 粉丝曲线 | **按周聚合**（每周取最后一次快照），复用现有 snapshots + Sparkline |
| 截图 | 新表 `competitor_shots` + 新桶 `competitor-shots`，复用 items/photo 上传，手动上传 |
| 录入 | Claude 抓 profile 回填（快照 + 团级字段 PATCH）+ 手填；截图始终手动 |
| 写权限 | ⚠️ **从仅管理员放开为所有登录用户**（改动已上线行为，需确认） |
| 视图 | ⚠️ 首页从「历史表+日折线」**改版**为截图墙优先；日历史表移入展开区保留 |
| 迁移编号 | 043（⚠️ 与 worktask 分支存在跨分支编号冲突风险，合并时核对） |
| 入口 | 不变，仍在「创作者」分组下 `/competitors` |
| 一周妆造网格 | 第二期；v1 只备好带 `shot_on` 的截图数据 |
