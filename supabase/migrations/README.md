# supabase/migrations 约定

本目录的迁移**不经过任何自动化 runner**：每个文件都是在 Supabase Dashboard 的 SQL Editor 里
**手工执行**的。「合并进 main」和「在线上跑过」是两件事，中间靠两样东西连起来：

- **命名纪律**——时间戳文件名保证顺序唯一（见下）。
- **已应用账本**——`public.applied_migrations` 记录哪些文件跑过，`npm run audit:migrations`
  拿本目录和它比对（2026-11-10 起，见「已应用账本」一节）。

## 为什么改成时间戳命名（2026-08-08）

历史上采用 `NNN_描述.sql` 顺序编号，并行分支各自取"下一个号"，先后产生了 7 组重复编号
（011/016/018/022/033/038/042）。手工按编号勾对"应用到第几号"时，同号的第二个文件容易
被跳过——2026-08-08 确认 `022_intent_audit.sql` 和 `027_notifications.sql` 因此漏应用，
直接导致线上 `/api/notifications` 500。

2026-08-08 起全部迁移为 Supabase CLI 标准的时间戳命名，时间取**该文件首次进入 git 的
提交时间（Asia/Tokyo）**，因此**按文件名升序 = 按真实应用顺序**。旧编号与新文件名的
完整对照见文末附录。

## 命名约定

```
<YYYYMMDDHHMMSS>_<snake_case描述>.sql
```

- 时间戳生成：`TZ=Asia/Tokyo date +%Y%m%d%H%M%S`，取创建当刻，不要手编。
- 描述用小写 snake_case，说清"做了什么"（如 `add_platform_id`、`enable_rls_all_tables`）。
- CI 会跑 `npm run test:migrations`（`scripts/check-migrations.mjs`）：格式不符或时间戳
  前缀重复直接失败。

## 新增迁移的流程

1. 生成文件名：`TZ=Asia/Tokyo date +%Y%m%d%H%M%S` 拼上描述，放进本目录。
2. SQL 尽量幂等（`if not exists` / `create or replace`），方便重复执行核对。
   注意 `alter type ... add value` 不能包在事务里，SQL Editor 单独跑。
3. SQL 写定后运行 `npm run migrations:stamp`，在文件末尾生成账本登记语句。之后只要再改
   上面的 SQL，就要重跑一次（登记语句里带内容校验和，CI 会拦住过期的）。
4. 随功能 PR 合并到 main。
5. **合并后立即手工应用**：把**整个文件**（含末尾的登记语句）粘到 Supabase Dashboard →
   SQL Editor 执行。不要攒批——攒批就是漏应用的温床。
6. 运行 `npm run audit:migrations` 确认没有未登记的文件；涉及结构变更的，再按
   「手工应用 + 核对远端 schema」一节核对确实生效。

## 已应用账本（2026-11-10 起）

线上有一张 `public.applied_migrations`（文件名、内容校验和、执行时间、是否回填），只给
`service_role` 授权、开 RLS 且无策略，`anon` / `authenticated` 什么都拿不到。

**怎么登记**：时间戳 ≥ `20261110084920` 的迁移，文件最后一段是这样的登记语句
（`npm run migrations:stamp` 生成，不要手写）：

```sql
-- @applied-migrations-ledger（由 npm run migrations:stamp 生成，勿手改；…）
insert into public.applied_migrations (filename, checksum)
values ('<文件名>', '<sha256>')
on conflict (filename) do update
  set checksum = excluded.checksum, applied_at = now(), backfilled = false;
```

- 它是文件的**最后一句**。SQL Editor 把一次粘贴当成一个批次执行，前面任何一句失败，
  整批回滚，登记也不会落库——所以「账本里有」等于「整个文件跑完了」（文件里自己写了
  `begin` / `commit` 的除外，那样的文件要保证登记语句在最后一个 `commit` 之后）。前提是粘贴整个
  文件：只选中一部分执行、或把文件拆成几段跑（例如 `alter type ... add value`），
  最后一段必须带上登记语句。
- 校验和算的是登记语句**之上**的 SQL（`scripts/migration-ledger.mjs`），换行符和文件末尾
  空行不影响结果。
- CI（`npm run test:migrations`）对门槛之后的迁移检查：登记语句存在、是文件最后一段、
  文件名和校验和与文件一致。不通过时运行 `npm run migrations:stamp` 即可。
- `npm run migrations:stamp -- <文件名>` 可以给门槛之前的文件补登记语句（并行分支里
  时间戳早于门槛、但合并时还没应用的迁移用这个）。

**怎么比对**：

```bash
SUPABASE_DB_URL='postgres://...' npm run audit:migrations
```

连接串在 `agent-service/.env.local`，需要本机有 `psql`。脚本只读（查询包在
`begin transaction read only` 里），报三类情况：

| 结果 | 含义 | 怎么处理 |
| --- | --- | --- |
| 未登记 | 仓库里有、账本里没有 | 合并了但没跑：按文件名顺序在 SQL Editor 执行 |
| 登记后被改过 | 账本里的校验和与文件不一致 | 文件在执行后被改了：确认改动是否需要落库，再重跑该文件更新登记 |
| 账本里有、仓库里没有 | 文件被改名或删除 | 仅列出，不算失败 |

前两类会让脚本以退出码 1 结束。**每次合并带迁移的 PR 并应用之后跑一次**；怀疑线上和
仓库对不上时也先跑它。它只证明「文件被执行过」，不证明执行后没人在 Dashboard 里手改过
结构——后者仍按下文方法核对，或跑 `npm run audit:rls`。

**历史迁移的回填**：账本建立前的 79 个文件由 `20261110084921_applied_migrations_backfill.sql`
一次性登记（`backfilled = true`，`applied_at` 是回填时间而非真实执行时间）。回填前用只读
查询逐个核对过线上库；其中 2 个纯数据更新的迁移（`20260511221935`、`20260512015620`，
费用 period 回填）从结构上无法确认是否执行过，在回填文件末尾注释着，判断后再登记。

**为什么不用 Supabase CLI 的 `supabase_migrations.schema_migrations`**：`db push` 会把执行
方式从 SQL Editor 改成本机 CLI 直连生产库，需要先对 79 个历史文件逐个
`migration repair --status applied`；而且历史文件并不都幂等，一旦 repair 漏了哪个，
`db push` 会把它当成待执行的重跑。自登记只是在现有流程上多一句 insert，不改变谁来执行、
在哪执行。将来若改用 CLI，账本里的文件名可以直接换算成 `schema_migrations.version`。

## 新建表必须显式 grant（2026-10-30 起）

Supabase 从 **2026-10-30** 起不再自动给 `public` 下的新表授予 Data API 权限。之前建的表
保留原有授权，不受影响；之后新建的表如果没有显式 `grant`，supabase-js / PostgREST 会直接
返回 `permission denied`——**包括 service_role**，也就是所有服务端路由
（`src/lib/supabase/server.ts`）。我们的迁移是在 SQL Editor 手工执行的，CI 拦不住运行时
报错，所以必须在建表的**同一个迁移文件**里写好 grant：

```sql
-- 必写：服务端（service role）要能读写
grant select, insert, update, delete on public.<表名> to service_role;

-- 若新表使用 serial / bigserial / smallserial 或 nextval() 默认值，还要给序列授权
grant usage on sequence public.<序列名> to service_role;

-- 按需：浏览器直连（createBrowserClient）要读写时才给，按最小权限
grant select on public.<表名> to authenticated;
-- anon 默认不给；官网等公开内容走服务端渲染，不需要 anon 直连
```

- 给 `authenticated` / `anon` 授权时同时要有对应的 RLS 策略，否则 grant 了也读不到。
  需要收紧时沿用 `20260814112723_site_content.sql` 的写法：先 `revoke all ... from anon,
  authenticated`，再 grant 回最小集（`TRUNCATE` 不受 RLS 约束，只 revoke CRUD 不够）。
- **浏览器端角色默认无权（2026-11-10 起）**：`20261110084614_revoke_client_table_grants.sql`
  收回了 `anon` / `authenticated` 对业务表的全部表级权限，并把 `postgres` 在 `public` 下的
  默认授权也改成不再发给这两个角色。所有读写走服务端的 `service_role`；要让浏览器直连某张
  表，必须在迁移里显式 grant 最小集、配 RLS 策略，并登记进 `scripts/audit-rls.mjs` 的
  `CLIENT_GRANT_ALLOWLIST`——`npm run audit:rls` 会对名单外的任何授权报错。
- CI（`npm run test:migrations`）对时间戳 ≥ `20261020000000` 的迁移检查：每张在 `public`
  新建的表最终必须给 `service_role` 留下 `SELECT/INSERT/UPDATE/DELETE`；若使用 `serial`
  或 `nextval()`，还须给相关序列 `USAGE` 或 `UPDATE`。检查器会按 SQL 顺序处理授权和撤销。
  `anon` / `authenticated` 是逐表决定，CI 不强制。
- `SELECT INTO`、`ALTER TABLE ... SET SCHEMA public`、`DO` 中动态建表等未被当前静态解析器
  完整理解的写法会让 CI 报错；请改成显式 `CREATE TABLE` 加授权，或先扩展检查器与测试。
- 此门槛按**文件名**而非远端执行时间判断。若旧建表文件至今仍未在某个远端项目执行，
  在默认权限变更后补跑也需要显式授权；上线前必须按下节方法核对各项目实际 schema。
- 应用后在 SQL Editor 核对有效权限（把占位符替换为实际对象名）：

```sql
select
  has_table_privilege('service_role', 'public.<表名>', 'SELECT') as can_select,
  has_table_privilege('service_role', 'public.<表名>', 'INSERT') as can_insert,
  has_table_privilege('service_role', 'public.<表名>', 'UPDATE') as can_update,
  has_table_privilege('service_role', 'public.<表名>', 'DELETE') as can_delete;

-- 使用 serial / nextval() 时再核对
select has_sequence_privilege('service_role', 'public.<序列名>', 'USAGE')
    or has_sequence_privilege('service_role', 'public.<序列名>', 'UPDATE') as can_nextval;
```

## 手工应用 + 核对远端 schema

应用顺序永远是**文件名升序**。怀疑"某个迁移到底应用没应用"时，先跑 `npm run audit:migrations`；
要确认结构本身（账本建立前的迁移、或怀疑有人手改过）时，不要靠记忆，直接核对远端：

**方法一：SQL Editor 查 information_schema（能查表、列、约束、枚举、策略）**

```sql
-- 表和列
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = '<表名>';

-- 枚举值（核对 alter type add value 是否生效）
select t.typname, e.enumlabel
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname = '<枚举名>';

-- RLS 策略
select tablename, policyname from pg_policies where schemaname = 'public';
```

**方法二：整体巡检** —— 逐个文件抽其"标志物"（建的表、加的列、建的 policy）按方法一查询，
任何缺失说明该文件漏应用，补跑即可（幂等 SQL 可安全重跑）。
不要用 anon key 请求 `/rest/v1/` 根路径做 OpenAPI 核对；Supabase 已停止向 anon key
提供 schema 规范，失败不能说明迁移未应用。

## 历史注意点

- `20260512180441_creator_terminated_status.sql` 与 `20260512202100_add_terminated_creator_status.sql`
  内容等效（都是给 `creator_status` 加 `terminated`），幂等所以无害，保留仅为存档。
- ~~旧编号 026、028 从未存在过（当年直接跳号），不是丢了文件。~~ **2026-08-29 更正**：
  026/027(第二个)/028/036(第二个)/044(第二个) 共 5 个文件当年一直躺在维护者工作区
  **从未提交进 git**，时间戳化时因此看不到、被误判为跳号。生产库 information_schema
  核对确认它们都已手工执行过（`agent_runs` 表、`conversations.user_id/deprecated_at`、
  `items.name_ja`、`competitors.likes_count` 等对象均存在）。2026-08-29 已按各文件
  mtime 换算 Asia/Tokyo 时间戳补录进本目录（见对照表带「补录」标注的行），内容未改。
- `enable_rls_all_tables`（旧 038）实际写于旧 039 之后，时间戳命名已还原真实顺序。
- 本次重命名**只改文件名不改内容**，对已应用的远端数据库无任何影响。
- `docs/` 下 2026-08-08 之前的计划/设计文档引用的是旧文件名，属历史存档，按下表对照即可。

## 附录：旧编号 → 新文件名对照表

| 旧文件名 | 新文件名 |
| --- | --- |
| 001_initial_schema.sql | 20260510190403_initial_schema.sql |
| 002_agent_model_config.sql | 20260510190404_agent_model_config.sql |
| 003_chat_schema.sql | 20260510190405_chat_schema.sql |
| 004_milestones.sql | 20260510190406_milestones.sql |
| 005_add_platform_id.sql | 20260510190407_add_platform_id.sql |
| 006_creator_activity_logs.sql | 20260510190408_creator_activity_logs.sql |
| 007_users_table.sql | 20260510190409_users_table.sql |
| 008_broadcast_accounts_and_user_codes.sql | 20260510190410_broadcast_accounts_and_user_codes.sql |
| 009_devices.sql | 20260510190411_devices.sql |
| 010_pmo_activity_events.sql | 20260510190412_pmo_activity_events.sql |
| 011_fix_activity_actor_type_casts.sql | 20260511142957_fix_activity_actor_type_casts.sql |
| 011_expenses.sql | 20260511195015_expenses.sql |
| 012_work_tasks.sql | 20260511211117_work_tasks.sql |
| 013_backfill_expense_period.sql | 20260511221935_backfill_expense_period.sql |
| 014_intent_tables.sql | 20260511225217_intent_tables.sql |
| 015_backfill_all_expense_periods.sql | 20260512015620_backfill_all_expense_periods.sql |
| 016_add_tech_role.sql | 20260512175531_add_tech_role.sql |
| 017_fix_user_profile_trigger.sql | 20260512175532_fix_user_profile_trigger.sql |
| 016_creator_terminated_status.sql | 20260512180441_creator_terminated_status.sql |
| 018_finance_forecast_inputs.sql | 20260512184213_finance_forecast_inputs.sql |
| 019_expense_saved_views.sql | 20260512201612_expense_saved_views.sql |
| 018_add_terminated_creator_status.sql | 20260512202100_add_terminated_creator_status.sql |
| 020_add_jp_chenhao_tz_buyer.sql | 20260512210321_add_jp_chenhao_tz_buyer.sql |
| 021_access_control.sql | 20260512214833_access_control.sql |
| 022_intent_audit.sql | 20260513152844_intent_audit.sql |
| 022_finance_forecast_views.sql | 20260513170640_finance_forecast_views.sql |
| 023_finance_forecast_lifecycle.sql | 20260513231810_finance_forecast_lifecycle.sql |
| 024_work_task_extensions.sql | 20260514175410_work_task_extensions.sql |
| 025_discussions.sql | 20260515193205_discussions.sql |
| 027_notifications.sql | 20260520171814_notifications.sql |
| 029_venue.sql | 20260623014015_venue.sql |
| 030_items.sql | 20260623014016_items.sql |
| 031_venue_view_bookmarks.sql | 20260623014017_venue_view_bookmarks.sql |
| 032_item_photos.sql | 20260623014018_item_photos.sql |
| 026_agent_runs.sql（2026-08-29 补录） | 20260623014100_agent_runs.sql |
| 027_w1_followups.sql（2026-08-29 补录） | 20260623014101_w1_followups.sql |
| 028_deprecate_orphan_conversations.sql（2026-08-29 补录） | 20260623014102_deprecate_orphan_conversations.sql |
| 033_venue_collaborators.sql | 20260623194634_venue_collaborators.sql |
| 034_item_value.sql | 20260623194635_item_value.sql |
| 033_venue_item_name_i18n.sql | 20260628221941_venue_item_name_i18n.sql |
| 035_venue_item_placement.sql | 20260628224300_venue_item_placement.sql |
| 036_item_name_i18n.sql（2026-08-29 补录） | 20260628232300_item_name_i18n.sql |
| 036_venue_item_window.sql | 20260629013411_venue_item_window.sql |
| 037_venue_item_merged_with.sql | 20260629024648_venue_item_merged_with.sql |
| 038_venue_item_truss_light.sql | 20260701151400_venue_item_truss_light.sql |
| 039_venue_item_light_forms.sql | 20260701151401_venue_item_light_forms.sql |
| 038_enable_rls_all_tables.sql | 20260701200037_enable_rls_all_tables.sql |
| 040_venue_item_mm_precision.sql | 20260701222912_venue_item_mm_precision.sql |
| 041_org_structure.sql | 20260712000731_org_structure.sql |
| 042_work_task_org_link.sql | 20260722161523_work_task_org_link.sql |
| 042_competitor_monitoring.sql | 20260723103402_competitor_monitoring.sql |
| 043_competitor_dossier.sql | 20260729163344_competitor_dossier.sql |
| 044_competitor_dossier.sql（2026-08-29 补录，改名 metrics 避免与 043 混淆） | 20260729170600_competitor_dossier_metrics.sql |
| 044_competitor_parent.sql | 20260729173015_competitor_parent.sql |
| 045_site_applications.sql | 20260811183310_site_applications.sql |
| 046_enable_rls_venue_items.sql | 20260812111104_enable_rls_venue_items.sql |
| 047_enable_rls_langgraph_checkpoints.sql | 20260812111105_enable_rls_langgraph_checkpoints.sql |

（同一 git 提交里加入的多个文件时间戳相同，按原编号顺序逐个 +1 秒保证唯一，如 001–010，
以及本表末尾的 046/047——两者同属一个提交，按原编号顺序把 047 顺延一秒。）

（带「补录」标注的 5 行从未进过 git，时间戳无法取「首次提交时间」，改取各文件 mtime
换算 Asia/Tokyo；026–028 同批创建，按编号顺序逐个 +1 秒。）
