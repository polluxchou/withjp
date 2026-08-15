-- ============================================================
-- 成员卡位数量改为数据驱动：去掉 site_members.no 的 1–12 上限
--
-- 背景：site_members 建表时（20260814112723_site_content.sql）假定
-- MOONDOLLZ 固定 12 个卡位，`no` 直接 `check (no between 1 and 12)`。这次把
-- 卡位数从"常量决定"改成"数据决定"（src/lib/site/content.ts 的
-- buildMembers 不再补齐到 MEMBER_SLOTS，后台可增删卡位），上界约束必须先
-- 松开，否则新增第 13 个卡位会直接被数据库拒绝。
--
-- 保留 unique（20260814112723 已建好，本迁移不动它）——no 仍然是卡位的
-- 稳定编号，不能重复；只是不再有上界，下界从 1 收紧到 "> 0"（与原逻辑一致，
-- 只是不再假设一定从 1 连续到 12）。
--
-- 内联 check 约束由 Postgres 自动命名（本例实际是 site_members_no_check，
-- 已用一次性容器核实），但这不是能长期依赖的公开契约——不同 Postgres 版本/
-- 建表语句写法都可能影响自动命名结果。这里用 DO 块按"作用在 no 列、约束定义
-- 文本里同时出现 no 与 12"匹配着查 pg_constraint 再 drop，不硬编码名字。
--
-- 本文件幂等，重复执行无副作用：DO 块只在还存在旧上界约束时才会找到匹配，
-- 新约束用 drop constraint if exists 先清后加。
-- ============================================================

do $$
declare
  tbl regclass := to_regclass('public.site_members');
  old_constraint_name text;
begin
  if tbl is null then
    -- 表还不存在（迁移顺序异常/本地新库尚未跑过 20260814112723），
    -- 没有约束可改，直接跳过——不让本迁移失败。
    return;
  end if;

  select con.conname into old_constraint_name
  from pg_constraint con
  where con.conrelid = tbl
    and con.contype = 'c'
    and con.conname <> 'site_members_no_positive'
    and pg_get_constraintdef(con.oid) ilike '%no%'
    and pg_get_constraintdef(con.oid) ilike '%12%';

  if old_constraint_name is not null then
    execute format('alter table site_members drop constraint %I', old_constraint_name);
  end if;
end $$;

alter table site_members drop constraint if exists site_members_no_positive;
alter table site_members add constraint site_members_no_positive check (no > 0);
