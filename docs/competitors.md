# 竞品监测 (Competitor Monitoring · TikTok) — 当前实现状态

更新时间：2026-07-29  
状态：已实现并上线（内部临时调研能力，作为「创作者」分组下的独立分析工具维护）。

## 1. 模块定位

竞品监测用来回答一个经营问题：**竞品在 TikTok 上长得怎么样、涨得怎么样？**

它把竞品 TikTok 创作者主页的关键指标（粉丝、获赞、作品数）和基础信息（昵称、简介、地区、认证等），按「一天一条」记录成时间序列，用于观察竞品的增长趋势。

模块已从单纯的「主页指标监测」扩展为「主页指标 + 团播档案」：在原有数字打点之外，现在还支持**手动上传直播间截图**（按团归档、展开后按 ISO 周分组）、维护 Lark 同步的**团级字段**（人数构成 / 开团城市与日期 / MC 配置 / 在线观察 / 最新视频链接）、以及**按周聚合的粉丝曲线**（近 4 周，数据来自 `competitor_snapshots`）。

定位是**内部分析工具 + 临时调研能力**：

- 采集不做线上定时跑数，由内部按需驱动（见第 4 节采集工作流）。
- 只读 TikTok 主页公开指标，**不涉及直播间实时数据**（截图为人工手动归档的静态图片，不是直播间实时抓取）。
- 数据为 app 级全局参考数据（非空间隔离），所有登录用户可读。

## 2. 入口与导航

页面入口：`/competitors`（多语言路由，如 `/zh/competitors`）。

导航位置：

```text
创作者
  - 创作者列表   (/creators)
  - 竞品监测     (/competitors)
```

「创作者」由单项改为可展开分组：第一项是原创作者列表页，第二项是竞品监测。分组模式与「团队」「成本管理」一致。

## 3. 核心能力

### 3.1 采集范围

每次采集记录一个竞品在某一天的主页快照：

| 指标 | 字段 | 说明 |
| --- | --- | --- |
| 粉丝 | `followers` | 主页头部数字 |
| 获赞 | `likes` | 主页头部数字 |
| 作品数 | `videos` | TikTok 主页头部不直接展示总数，通常为空 |
| 关注 | `following` | 可选 |

基础信息快照：`display_name`（昵称）、`bio`（简介）、`region`（地区）、`verified`（认证）。原始缩写文本（如 `"1.2M"`）与额外字段进 `raw` (jsonb)。

### 3.2 打点粒度

- 一个竞品一天一条快照，唯一键 `(competitor_id, captured_on)`。
- 同日重采为**幂等覆盖**（upsert），不会产生重复点。
- 采集日期 `captured_on` 默认取脚本运行时的 **UTC 当天**。

### 3.3 趋势可视化

- 每行展示：基础信息（`@handle`、昵称、认证、地区、简介）+ 最新一次的 粉丝 / 获赞 / 作品数。
- 展开：历史打点表（按日期倒序）+ **纯手写 SVG mini 折线图**（粉丝随时间；无第三方图表库，零新依赖）。

### 3.4 清单管理

- 添加竞品：粘贴 TikTok 主页链接或 `@handle`，从中解析出 handle。
- 「添加」语义为**确保存在**：若该竞品已在清单里，直接返回，不覆盖已维护的备注 / 链接。
- **所有登录用户可增删改**：service 层不再按 `is_admin` 收紧写权限，`canEdit` 恒为 `true`。
- 快照写入**不走清单 API**，只走 service-role 采集脚本（见第 4 节）。

### 3.5 数字解析

采集脚本与视图共用一组纯函数（`src/lib/competitors/metrics.ts`，零 import）：

- `parseCount("1.2M" | "34K" | "1,234" | 1200000) → number | null`
- `formatCount(number) → "1.2M"`（展示用紧凑格式；`null → "—"`）

## 4. 采集工作流

这是本模块区别于其他 CRUD 模块的核心：**快照数据不靠线上抓取，靠内部按需采集后跑脚本写库。**

1. 拿到一批竞品 URL / `@handle`（或已在 `competitors` 表内）。
2. 用内置浏览器逐个打开 TikTok 主页，读取指标与基础信息。
3. 组装成 JSON，跑采集脚本写库：

```bash
node --env-file=.env.local --experimental-strip-types \
  scripts/record-competitor-snapshot.ts < payload.json
```

payload 支持单个对象或数组，字段示例：

```json
{
  "platform": "tiktok",
  "handle": "example",
  "profile_url": "https://www.tiktok.com/@example",
  "followers": 1200000,
  "likes": 34000000,
  "videos": 812,
  "following": 120,
  "display_name": "Example",
  "bio": "...",
  "region": "US",
  "verified": true,
  "raw": { "followers": "1.2M", "likes": "34M" },
  "captured_on": "2026-07-23"
}
```

脚本行为：按 `(platform, handle)` upsert 竞品（缺失则创建、不清空已维护的昵称）；按 `(competitor_id, captured_on)` upsert 当日快照；数字缺失时用 `raw` 里的缩写经 `parseCount` 解析；用 service-role 客户端写入；逐条打印结果。

> 脚本用 `--experimental-strip-types` 运行（而非常规 `.mjs`），以便用相对路径复用已测的 `parseCount`。

## 5. 数据模型

相关 migration：

- `supabase/migrations/042_competitor_monitoring.sql`
- `supabase/migrations/043_competitor_dossier.sql` — 给 `competitors` 补团级列（`avatar_url` / `region` / `member_count` / `composition` / `launch_city` / `launched_on` / `mc_note` / `online_note` / `latest_videos`）；新建 `competitor_shots` 表；RLS 同样为 `authenticated_only`。

核心表：

- `competitors`（竞品清单，唯一键 `unique(platform, handle)`；现已扩展团级字段）
- `competitor_snapshots`（每日打点，唯一键 `unique(competitor_id, captured_on)`）
- `competitor_shots`（手动上传的直播间截图归档：`image_url` / `shot_on` / `tag` / `caption` / `sort_order`）

三表均启用 RLS + `authenticated_only`（`for all to authenticated`）策略；写权限**不再按 `is_admin` 收紧**，所有登录用户可写，快照写入仍走 service-role。`platform` 带 `check (platform in ('tiktok'))`，为将来扩平台预留。

Storage：新增桶 `competitor-shots`，用于存放上传的截图文件。

核心域层与服务：

- `src/lib/competitors/metrics.ts` — `parseCount` / `formatCount`（纯函数，零 import）
- `src/lib/competitors/chart.ts` — `buildSparklinePoints`（sparkline 几何，纯函数）
- `src/lib/competitors/assemble.ts` — `parseHandleFromUrl` / `assembleBoard`（纯函数）
- `src/lib/competitors/weekly.ts` — `bucketFollowersByWeek` / `weekStartOf`（按 ISO 周聚合粉丝快照，纯函数，配套 `weekly.test.ts`）
- `src/lib/competitors/types.ts` — 领域类型
- `src/lib/competitors/service.ts` — 看板加载 + 清单 CRUD + 快照 upsert + 团级字段 / 截图 CRUD（`ServiceResult<T>`）

核心页面与组件：

- `src/app/[locale]/(app)/competitors/page.tsx`
- `src/components/competitors/CompetitorDossierView.tsx` — 新的以图为主的主视图，替换旧的 `CompetitorMonitoringView`
- `src/components/competitors/CompetitorCard.tsx` — 单个竞品的档案条：1:3 双栏布局，左侧按周粉丝曲线、右侧截图墙 + 展开档案
- `src/components/competitors/ShotAlbum.tsx` — 截图相册：折叠态横滑、展开态按周网格、支持 lightbox
- `src/components/competitors/ShotUploader.tsx` — 截图上传控件
- `src/components/competitors/WeeklyFollowersCurve.tsx` — 按周粉丝曲线
- `src/components/competitors/Sparkline.tsx` — 保留（原有 mini 折线图）

> 旧的 `CompetitorMonitoringView.tsx` 已删除，由 `CompetitorDossierView` 承接原视图职责。

采集脚本：

- `scripts/record-competitor-snapshot.ts`

API：

- `GET /api/competitors`（看板，含 `canEdit`）
- `POST /api/competitors`（添加竞品；现接受团级字段）
- `PATCH /api/competitors/[id]`（更新备注 / 昵称 / 团级字段）
- `DELETE /api/competitors/[id]`（删除竞品及其全部打点与截图）
- `POST /api/competitors/upload`（截图文件上传 → Storage → 返回 URL）
- `POST /api/competitors/[id]/shots`（为某竞品新增一条截图记录）
- `PATCH /api/competitors/shots/[shotId]`（更新截图元信息）
- `DELETE /api/competitors/shots/[shotId]`（删除截图记录）

单元测试（`node:test`）：`metrics.test.ts`、`chart.test.ts`、`assemble.test.ts`、`weekly.test.ts`。

## 6. 用户流程

### 6.1 查看竞品看板

1. 侧栏展开「创作者」→ 进入「竞品监测」。
2. 每行看到该竞品最新的粉丝 / 获赞 / 作品数与基础信息。
3. 展开某行，查看历史打点表与粉丝走势折线。

### 6.2 采集一次打点（内部）

1. 任意登录用户在看板粘贴 TikTok 主页链接 / `@handle` 添加竞品（也可直接由脚本创建）。
2. 用内置浏览器读取该主页指标。
3. 组装 JSON 跑 `record-competitor-snapshot.ts` 写库。
4. 回到看板刷新，即可看到最新指标与趋势（≥2 个打点才画折线）。

## 7. 当前边界

- 不做线上 / 定时自动跑数（无 cron、无 serverless 抓取），采集为内部按需驱动。
- 只做 TikTok；表结构预留 `platform`，其他平台（快手 / 视频号）未实现。
- 不采集直播间实时数据（在线人数等瞬时指标）；**直播间截图为人工手动归档的静态图片，不是实时抓取**，上传时机、频率均由人工决定。
- 不采集单条视频 / 作品明细数据。
- 清单增删改、截图上传均已放开给所有登录用户；快照写入只走脚本。
- 更新备注 / 昵称的 `PATCH` API 已具备，且已接入团级字段编辑 UI。
- `captured_on` 按 UTC 取当天，对 UTC 以西时区可能与本地日期差一天。

## 8. 后续方向

- 扩展多平台（快手 / 视频号），复用 `platform` 字段与同一分层。
- 视需要接入定时 / 半自动采集，减少人工跑脚本。
- 增加更多指标口径（互动率、发布频率等）与对比视图（竞品间横向对比）。
- 与 Agent Service 结合，实现「帮我看看某竞品最近涨粉情况」这类自然语言查询。
- 「一周妆造网格」（团 × 星期几的截图矩阵视图）：v1 只备好带 `shot_on` 的截图数据，尚未实现该聚合视图。

## 9. 设计与实现参考

- 设计稿（原为 LHH 项目撰写，落地时适配到 newWith）：`~/Code/LHH/docs/superpowers/specs/2026-07-21-competitor-monitoring-design.md`
- 实现计划：`docs/superpowers/plans/2026-07-21-competitor-monitoring.md`
- 团播档案扩展设计：`docs/superpowers/specs/2026-07-28-competitor-live-dossier-design.md`
- 团播档案扩展实现计划：`docs/superpowers/plans/2026-07-28-competitor-live-dossier.md`
- 相关 PR：#131（功能）、#132（更新日志）、#133（导航收进「创作者」子菜单）
