-- ============================================================
-- Migration 20260901222510_site_applications_dance_fields:
-- 官网 RECRUIT 表单（主播类）新增两个选填字段——舞蹈能力类型、舞蹈年限
--
-- 两列只对 kind='creator' 的投递有意义，员工类（photographer/makeup/
-- group_live_ops）恒为 null，用条件约束挡住误填。
-- ============================================================

alter table site_applications
  add column if not exists dance_skill_level text
    check (dance_skill_level is null or dance_skill_level in
      ('barely_touched', 'long_term_hobby', 'professional_training', 'teaching_level')),
  add column if not exists dance_years smallint
    check (dance_years is null or dance_years between 0 and 36);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_applications_dance_fields_creator_only') then
    alter table site_applications add constraint site_applications_dance_fields_creator_only check (
      kind = 'creator' or (dance_skill_level is null and dance_years is null)
    );
  end if;
end $$;
