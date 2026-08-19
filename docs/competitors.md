# 竞品监测 / 团播档案（Competitor Monitoring · TikTok）— 产品需求与技术实现

更新时间：2026-07-29
状态：已实现并上线（内部调研工具，位于「创作者」分组下的 `/competitors`）。

本文档是竞品监测能力的**权威参考**，合并了产品需求（PRD）与技术实现两部分，供后续调取。设计稿 / 实现计划见文末「参考」。

---

# 第一部分 · 产品需求（PRD）

## 1. 背景与要解决的问题

团队需要持续了解**日本区 TikTok 团播（多人团体直播）竞品**：它们是谁、长得怎么样、涨得怎么样、直播间在做什么内容（尤其**妆造 / 服饰**）。此前这些资料靠人工维护在 Lark 文档里，分散、不好比较、不好沉淀。

竞品监测把这套调研搬进 newWith，形成一个**归档可查、图为主**的竞品团播档案库。

## 2. 目标用户与定位

- 用户：内部运营 / 调研人员（所有登录用户，无需管理员）。
- 定位：**内部分析工具 + 临时调研能力**。按需驱动，不做线上定时跑数；只读公开信息 + 人工归档，不做直播间实时抓取。

## 3. 核心用户价值 / 能力

1. **竞品清单与档案**：以团播主账号为单位，记录团级档案字段（人数构成 / 本地·跨区 / 开团城市与日期 / MC 配置 / 在线人数观察 / 最新视频链接）。
2. **主页指标时间序列**：按天记录粉丝 / 获赞 / 作品数等，观察增长；卡片上给出**按周聚合的近 4 周粉丝曲线**。
3. **直播间截图归档（图为主）**：手动上传直播间截图（重点看妆造 / 服饰 / 场景），按团归档、按 ISO 周分组，大图展示、点击放大，不必逐张点开。
4. **团播主账号 → 主播子账号 两级层级**：一个团播主账号下挂它的主播个人号；首页只列主账号，主播子账号收在主账号的「关联主播」二级里（小图紧凑卡片），不平铺首页。
5. **关系维护**：既能自动（采集主账号时从其 bio 的 @提及下探发现主播），也能手动（添加时选父账号、存量卡片「归属」下拉改挂/移出）。

## 4. 关键用户流程

1. **加竞品**：粘贴 TikTok 主页链接或 `@handle` → 选「归属」（团播主账号 / 挂到某主账号下）→ 加入清单。
2. **采集一次打点（内部）**：用内置浏览器读主页指标 + bio → 跑采集脚本写快照；若 bio 里 @ 了其它主播，自动作为子账号挂进来（下探一跳）。
3. **上传直播间截图**：在某竞品卡片上传或 ⌘V 粘贴截图（客户端自动压缩），按拍摄日期归档。
4. **看趋势与档案**：卡片看最新指标 + 近 4 周粉丝曲线 + 截图墙；展开看完整团级字段 + 每日历史打点表。
5. **维护层级**：把主播子账号挂到正确的团播主账号下，或移出为独立主账号。

## 5. 范围与非目标

**范围**：单平台 TikTok；**以日区为主但不限于日区**（2026-08-19 核实：23 个顶层竞品里 `_k.queens` / `the_re_born` / `blank.s9` 是韩国团，简介自报 KST 与韩文成员名）；主页公开指标 + 人工上传截图 + 团级档案 + 两级层级。

> ⚠️ `region` 是**建档时人工填的**，采集从不刷新它。曾经 23 个账号被一律填成 `JP`（含上述 3 个韩国团），错了一个月没人发现——因为卡片上那个地区标签每张都一样，没人会去核。现在采集会额外带回主页语言（`competitor_snapshots.language`）做交叉校验，但它只是辅助参考，`competitors.region` 仍是唯一权威值。

**非目标（明确不做）**：
- 直播间实时数据（在线曲线、逐分钟人数、GMV 实时）——`online_note` 仅存人工观察近似值。
- 自动定时 / 线上爬虫跑数。
- 粉丝 / 视频量的完整历史趋势图（只留当前值 + 采集日期 + 按周聚合曲线）。
- 三级及以上层级（只允许「主账号 → 子账号」两级）。
- 单条视频 / 作品明细。
- 「一周妆造网格」（团 × 星期几 矩阵视图）——数据（带 `shot_on` 的截图）已备好，视图列为后续方向。

## 6. 权限

所有登录用户可读、可增删改（清单、团级字段、截图、归属）。service 层不做 `is_admin` 收紧，`canEdit` 恒为 `true`。快照写入只走 service-role 采集脚本。

---

# 第二部分 · 技术实现

## 7. 架构总览

沿用 newWith 既有分层，无新增架构范式：

```
supabase/migrations        建表 / 加列 / RLS / Storage 桶
src/lib/competitors/**     纯函数 + service.ts（ServiceResult<T>）
src/app/api/competitors/** REST（authGuard → service → NextResponse.json({data,error})）
src/app/[locale]/(app)/competitors/page.tsx   server page（force-dynamic）
src/components/competitors/**                  client 视图
scripts/record-competitor-snapshot.ts          service-role 采集脚本（唯一快照写入口）
```

技术栈：Next.js App Router、next-intl（zh/en/ja 三语 + parity 守卫）、Supabase（`@supabase/ssr` cookie 客户端 / service-role 脚本）、`node:test` + `--experimental-strip-types`、Tailwind、lucide-react。

## 8. 数据模型

### 8.1 迁移

| 迁移 | 内容 |
| --- | --- |
| `042_competitor_monitoring.sql` | `competitors` + `competitor_snapshots` 建表 + RLS `authenticated_only` |
| `043_competitor_dossier.sql` | `competitors` 补团级列；新建 `competitor_shots` + 索引 + RLS；建公开 Storage 桶 `competitor-shots` |
| `044_competitor_parent.sql` | `competitors` 加自引用 `parent_id`（`on delete cascade`）+ 索引 `idx_competitors_parent` |
| `20260818000000_competitor_shots_live_metrics.sql` | `competitor_shots` 加 `viewer_count` / `stream_started_at` / `captured_at`（直播态指标） |
| `20260819000000_competitor_snapshot_language.sql` | `competitor_snapshots` 加 `language`（主页语言，地区的辅助参考） |

> ⚠️ 迁移只能在 Supabase 面板 SQL Editor 手动跑（本仓库不本地 push 迁移）。线上项目 ref：`aumcmufpjkxkgaylrfzl`。042/043/044 均已应用。

### 8.2 表

**`competitors`（竞品清单 + 团级档案）** — 唯一键 `unique(platform, handle)`
- 基础：`id`、`platform`('tiktok' + check)、`handle`、`profile_url`、`display_name`、`note`、`created_at`
- 层级：`parent_id`（→ competitors.id，`on delete cascade`；空=团播主账号，非空=某主账号的主播子账号）
- 团级档案（043）：`avatar_url`、`region`(默认 'JP')、`member_count`、`composition`（如「女子团·本地」）、`launch_city`、`launched_on`、`mc_note`、`online_note`、`latest_videos`(jsonb `[{url,title?}]`)

**`competitor_snapshots`（每日主页打点）** — 唯一键 `unique(competitor_id, captured_on)`
- `followers`、`likes`、`videos`、`following`、`display_name`、`bio`、`region`、`verified`、`raw`(jsonb)、`captured_at`
- `language`（20260819 加）：主页 rehydration JSON 的 `user.language`，即**账号的应用语言设置**。它是国别的代理指标而非权威值（日本团把语言设成 `en` 完全可能），只用于展示与和人工 `region` 交叉校验，**不自动覆盖 `region`**。判定逻辑在 `src/lib/competitors/profileLanguage.ts`：只有 `ja/ko/th/vi/id` 这类能明确推出地区的语言才提示不一致，`en` 这类跨地区语言一律不提示。⚠️ 快照的 `region` 列实测一直是空的（采集脚本不读它），所以展开档案里的「地区」回退到 `competitors.region`。
- 同日重采幂等覆盖（upsert）；`captured_on` 默认脚本运行时 UTC 当天。

**`competitor_shots`（手动上传截图）**
- `competitor_id`(→competitors, cascade)、`image_url`、`shot_on`(date)、`tag`（全妆/常服/主题）、`caption`、`sort_order`、`created_at`

**Storage**：公开桶 `competitor-shots`（上传照搬 `items/photo` 套路，5MB + 图片类型校验）。

### 8.3 数据分工原则

随时间变化的身份/指标（`display_name`/`bio`/`region`/`language`/`verified`/`followers`/`likes`/`videos`）留在 `competitor_snapshots`，卡片取最新一条；团级稳定属性落在 `competitors`；粉丝曲线由 snapshots 按周聚合。

### 8.4 RLS

三表均 `authenticated_only`（`for all to authenticated using (auth.uid() is not null)`）。写权限在 service 层放开给所有登录用户；快照写入走 service-role（绕 RLS）。

## 9. 域层（`src/lib/competitors/`）

| 文件 | 职责 | 测试 |
| --- | --- | --- |
| `metrics.ts` | `parseCount("1.2M"→1200000)` / `formatCount(n→"1.2M")`（零 import，脚本+视图共用） | `metrics.test.ts` |
| `chart.ts` | `buildWeeklyCurve(weekly)` → 0–100 百分比点集 + polyline 几何（含日期刻度） | `chart.test.ts` |
| `weekly.ts` | `weekStartOf(date)`（ISO 周一）/ `bucketFollowersByWeek(history)`（每周取最后一次快照，空值跳过） | `weekly.test.ts` |
| `mentions.ts` | `extractMentionedHandles(bio, self)` 提取 bio 里 @ 的 handle（排除自身/邮箱域名/去尾点/大小写去重/上限20） | `mentions.test.ts` |
| `assemble.ts` | `parseHandleFromUrl` + `assembleBoard(competitors,snapshots,shots,canEdit)`：组装 latest/history/weekly/shots，并做**父子嵌套**（`parent_id` 空→顶层，非空→挂到父的 `related`；悬空 parent_id 回退顶层） | `assemble.test.ts` |
| `types.ts` | 领域类型（`Competitor`/`CompetitorSnapshot`/`CompetitorShot`/`WeeklyPoint`/`CompetitorWithHistory`(含 `related`)/`CompetitorBoard`） | — |
| `service.ts` | `ServiceResult<T>` + `getCompetitorBoard` / `addCompetitor` / `updateCompetitor` / `deleteCompetitor` / `addShot` / `updateShot` / `deleteShot` / `assertValidParent`；`CompetitorFields`（含 `parent_id`） | — |

> 迭代 Map/Set/matchAll 结果时用 `Array.from(...)` 包裹——本项目 tsconfig target 较低，`for...of` 直接迭代会触发 TS2802（strip-types 单测不报、build 才报）。

**父账号校验 `assertValidParent`**（只允许两级、天然防环）：父必须存在且本身是主账号（`parent_id` 为空）、不能选自己、已有子账号者不能再变成子账号。`addCompetitor` / `updateCompetitor` 在写入前校验。

## 10. API（`src/app/api/competitors/`）

| 方法 | 路由 | 说明 |
| --- | --- | --- |
| GET | `/api/competitors` | 看板（含 `canEdit`、嵌套 `related`、`weekly`、`shots`） |
| POST | `/api/competitors` | 加竞品，body `{ url? \| handle?, platform?, ...团级字段, parent_id? }` |
| PATCH | `/api/competitors/[id]` | 改团级字段 / 归属（`parent_id`） |
| DELETE | `/api/competitors/[id]` | 删竞品（级联删其快照 / 截图 / 子账号） |
| POST | `/api/competitors/upload` | 截图文件 → Storage → 返回公开 URL |
| POST | `/api/competitors/[id]/shots` | 加一条截图记录 `{image_url, shot_on?, tag?, caption?, sort_order?}` |
| PATCH·DELETE | `/api/competitors/shots/[shotId]` | 改 / 删截图 |

约定：`authGuard()` → `instanceof NextResponse` 兜 401 → service → `NextResponse.json({data,error})`。无 server action、无 `revalidatePath`；client 增删改后重取 `GET /api/competitors`。

## 11. 视图（`src/components/competitors/`）

- `CompetitorDossierView`：主视图。顶部添加框（输入 + 「归属」下拉：团播主账号 / 挂到某主账号）；只渲染顶层主账号；提供 `refresh` / `add` / `remove` / `assignParent`（PATCH `parent_id`）。
- `CompetitorCard`：单卡。档案条（头像 + 团名 + 认证 + @handle + `JP` + 一行指标）+ 「归属」下拉（叶子卡）+ 打开主页 + 展开 + 删除。
  - **主账号（顶层）**：1:3 双栏——左近 4 周粉丝曲线、右**半屏大图**截图墙；「关联主播 (N)」折叠区递归渲染子账号；展开区显示完整团级字段 + 每日历史打点表。
  - **子账号（nested，`compact`）**：紧凑堆叠——纤细一行粉丝曲线 + **小图**截图。
- `ShotAlbum`：截图相册。折叠态换行网格（大图约「上下 2 张≈一屏」/ 小图更密）；「查看全部」展开为按 ISO 周分组网格；lightbox 放大；每图删除；`compact` 小图模式。
- `ShotUploader`：上传格。点击选图或 ⌘V 粘贴（`compressImage` 客户端压缩后上传）；`compact` 小尺寸。
- `WeeklyFollowersCurve`：近 4 周粉丝曲线（复用 `chart.buildWeeklyCurve`）；`compact` 纤细一行。
- `compressImage.ts`：canvas 缩到长边 ≤1280 + 转 WebP(q0.82)，压不小则回退原图、GIF 跳过——降低 Supabase 存储 / 出网流量。

导航：侧栏「创作者」分组下 `/creators`（创作者列表）+ `/competitors`（竞品监测）。

## 12. 采集与「下探」工作流

`scripts/record-competitor-snapshot.ts`（service-role，唯一快照写入口）：
1. 用内置浏览器逐个打开 TikTok 主页，读指标 + bio。
2. 组装 JSON 跑脚本：`node --env-file=.env.local --experimental-strip-types scripts/record-competitor-snapshot.ts < payload.json`
3. 脚本按 `(platform,handle)` upsert 竞品、按 `(competitor_id,captured_on)` upsert 当日快照；数字缺失用 `raw` 缩写经 `parseCount` 解析。
4. **下探一跳**：从该竞品 bio 用 `extractMentionedHandles` 提取 @主播，作为子账号 upsert（`parent_id=父`、`note=来自 @父 简介`，`ignoreDuplicates`——已存在则不动、不重挂）。只加条目不递归、不强抓数据。

> `ignoreDuplicates` 意味着**存量账号不会被自动改归属**；批量纠正存量归属需显式 `UPDATE competitors SET parent_id ... WHERE handle=...`（按 handle 精确匹配）。注意部分主播 handle 是日文昵称，bio 的 @提及未必与库内 handle 一致，需人工核对。

## 13. 测试与守卫

- 单测（`node:test`）：`metrics` / `chart` / `weekly` / `mentions` / `assemble`（含嵌套、悬空 parent、周聚合、截图排序）。
- 守卫：`test:i18n`（三语 key 对齐）、`test:no-bare-han`（tsx 无裸中文，全部走 `t()`）、`npx tsc --noEmit`、`npm run lint && npm run build`。

## 14. 当前边界与后续方向

**边界**：单平台 TikTok；截图为人工归档非实时；只两级层级；`captured_on` 按 UTC，可能与本地差一天。

**后续方向**：多平台（快手/视频号，复用 `platform`）；半自动 / 定时采集；「一周妆造网格」聚合视图（数据已备）；竞品横向对比；与 Agent Service 结合做自然语言查询。

## 15. 参考

- 团播档案扩展设计：`docs/superpowers/specs/2026-07-28-competitor-live-dossier-design.md`
- 团播档案扩展实现计划：`docs/superpowers/plans/2026-07-28-competitor-live-dossier.md`
- 相关 PR：#131（功能）、#132（更新日志）、#133（导航收进「创作者」）、#136（团播档案：截图/团级字段/按周曲线）、#137（配色可读 + 粘贴上传）、#138（大图 + 上传压缩）、#139（bio 下探关联主播）、#140（手动归属映射）、#141（措辞「团播主账号」）、#142（关联主播小图紧凑卡片）
