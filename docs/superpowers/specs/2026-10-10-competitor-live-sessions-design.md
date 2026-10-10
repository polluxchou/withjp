# 竞品开播记录（TikTok LIVE History 粘贴导入）设计

日期：2026-10-10
状态：导入部分已定稿；展示部分待 mock 评审

## 背景

竞品卡片的「常见开播时段」目前只从 `competitor_shots.stream_started_at` 推，一个号往往只截到
寥寥几场。TikTok 主页的 LIVE History 列表能直接看到对方过去几个月每一场的日期、开播–下播时刻、
标题和点赞数——一个 JP 团播号三个月就有 80 场。把这份清单存下来，开播规律、频率时长、每场热度
都有了实打实的证据。

## 范围

本期（PR-A1，导入）：
- 新表 `competitor_live_sessions`，每场一行
- 后台粘贴导入：管理员把 LIVE History 原文贴进弹窗 → 实时预览 → 确认入库，重复粘贴按开播时刻覆盖
- 看板加载这张表；卡片展开区显示「开播记录 N 场 · 起止日期」+ 导入入口

下期（PR-A2 / PR-B，展示，待 mock 定稿）：场次清单、并入常见开播时段 / 地区标尺 / Ask、频率时长统计、热度走势。

不做：日文/中文界面格式（提示切英文再复制）、自动抓取、改截图采集链路。

## 已定的口径

- **每条记录都是独立场次**，不合并紧挨着主场的短场（断线重连、试播、加时）。统计里因此可能多出一档
  「午场后小场」，这是用户确认过的取舍。
- **时区**：TikTok 网页按浏览器本地时区渲染时刻，所以解析默认用浏览器时区，预览里明示、可切换。
  这与站内「展示时区跟界面语言走」不冲突——那是展示，这里是还原原始数据。
- **年份**：原文没有年份。从今天（解析时区）往回推，列表新→旧排列，月日一旦比上一条大就跨到上一年；
  每条再用原文的星期几校验，对不上的不入库、在预览里列出。
- **跨午夜**：下播时刻早于开播时刻 → 算到次日。
- **点赞**：`106.7K` → 106700，`1.6M` → 1600000，近似值，展示时仍按 K/M 缩写。
- **去重键**：`(competitor_id, started_at)`，分钟精度。重复粘贴更新标题、下播时刻、点赞。

## 数据表

```sql
create table if not exists competitor_live_sessions (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  title         text        not null default '',
  likes         bigint,
  source        text        not null default 'tiktok_history',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint competitor_live_sessions_uk unique (competitor_id, started_at),
  constraint competitor_live_sessions_range_ck check (ended_at >= started_at),
  constraint competitor_live_sessions_source_ck check (source in ('tiktok_history'))
);
```

RLS 沿用 `authenticated_only`。migration 只建表，不带任何竞品数据（仓库 public）。

**上线顺序**：先在库里执行 DDL，再合 PR——看板加载是四表并发拉取，任何一张表不存在都会让整个看板报错。

## 导入流程

1. 卡片展开区「开播记录」一行旁的「粘贴导入」按钮（canEdit）打开弹窗
2. 贴原文、确认时区
3. 预览：识别 N 场、日期范围、新增 X / 更新 Y、无法识别的行与星期对不上的行、逐场表格
4. 确认 → `POST /api/competitors/[id]/live-sessions` body `{ sessions: [...] }` → upsert → 看板刷新

解析在客户端做（纯函数，与预览共用），服务端对每行再做一遍边界校验（ISO 合法、下播 ≥ 开播、时长 ≤ 24h、
点赞非负整数、标题 ≤ 200 字、单次 ≤ 1000 行）。
