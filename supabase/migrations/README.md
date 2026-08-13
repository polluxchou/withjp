# supabase/migrations 约定

本目录的迁移**不经过任何自动化 runner**：远端 Supabase 上没有迁移追踪表，每个文件都是在
Supabase Dashboard 的 SQL Editor 里**手工执行**的。文件名是唯一的"应用到哪了"的凭据，
因此命名纪律就是数据库正确性的一部分。

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
3. 随功能 PR 合并到 main。
4. **合并后立即手工应用**：把文件内容粘到 Supabase Dashboard → SQL Editor 执行。
   不要攒批——攒批就是漏应用的温床。
5. 应用完按下节方法核对远端 schema 确实生效。

## 手工应用 + 核对远端 schema

应用顺序永远是**文件名升序**。怀疑"某个迁移到底应用没应用"时，不要靠记忆，直接核对远端：

**方法一：PostgREST OpenAPI（快，不用进 Dashboard）**

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" | jq '.definitions | keys'
```

能看到全部暴露的表；查某表的列用 `.definitions.<table>.properties | keys`。
迁移若新增了表/列，这里立刻能看到；看不到就是没应用。

**方法二：SQL Editor 查 information_schema（细，能查约束/枚举/策略）**

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

**方法三：整体巡检** —— 逐个文件抽其"标志物"（建的表、加的列、建的 policy）按方法二查询，
任何缺失说明该文件漏应用，补跑即可（幂等 SQL 可安全重跑）。

## 历史注意点

- `20260512180441_creator_terminated_status.sql` 与 `20260512202100_add_terminated_creator_status.sql`
  内容等效（都是给 `creator_status` 加 `terminated`），幂等所以无害，保留仅为存档。
- 旧编号 026、028 从未存在过（当年直接跳号），不是丢了文件。
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
| 033_venue_collaborators.sql | 20260623194634_venue_collaborators.sql |
| 034_item_value.sql | 20260623194635_item_value.sql |
| 033_venue_item_name_i18n.sql | 20260628221941_venue_item_name_i18n.sql |
| 035_venue_item_placement.sql | 20260628224300_venue_item_placement.sql |
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
| 044_competitor_parent.sql | 20260729173015_competitor_parent.sql |
| 045_site_applications.sql | 20260811183310_site_applications.sql |
| 046_enable_rls_venue_items.sql | 20260812111104_enable_rls_venue_items.sql |
| 047_enable_rls_langgraph_checkpoints.sql | 20260812111105_enable_rls_langgraph_checkpoints.sql |

（同一 git 提交里加入的多个文件时间戳相同，按原编号顺序逐个 +1 秒保证唯一，如 001–010，
以及本表末尾的 046/047——两者同属一个提交，按原编号顺序把 047 顺延一秒。）
