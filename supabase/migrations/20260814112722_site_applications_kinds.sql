-- ============================================================
-- Migration 20260814112722_site_applications_kinds: 官网应募扩展出「其他招募」三类
--
-- 不新建第二张表：附件要的是「官网应募页增加一个 tab」，同一数据源两个视图。
-- 字段名逐字对齐 tt-agent/docs/domain-b-applications-contract.md，
-- 将来导入 core.applications 就是 1:1，不需要映射表。
-- ============================================================

alter table site_applications
  -- expand 阶段保留 default：旧版本服务仍在运行时，少传 kind 的请求
  -- 继续按主播应募落库；contract 阶段再由后续 contract 迁移删除这个 default。
  add column if not exists kind text not null default 'creator'
    check (kind in ('creator', 'photographer', 'makeup', 'group_live_ops')),
  add column if not exists email text
    check (email is null or char_length(email) between 3 and 254),
  add column if not exists commute_mode text
    check (commute_mode is null or commute_mode in ('subway', 'bicycle', 'walk', 'car'));

-- 员工类应募没有年龄；居住位置对员工类是选填
alter table site_applications alter column age       drop not null;
alter table site_applications alter column residence drop not null;

-- Postgres 没有 `add constraint if not exists`，用 DO 块保证可重跑
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_applications_creator_fields') then
    alter table site_applications add constraint site_applications_creator_fields check (
      kind <> 'creator' or (age is not null and residence is not null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_applications_staff_fields') then
    alter table site_applications add constraint site_applications_staff_fields check (
      kind = 'creator' or (email is not null and commute_mode is not null)
    );
  end if;
end $$;

create index if not exists idx_site_applications_kind_created
  on site_applications (kind, created_at desc);
