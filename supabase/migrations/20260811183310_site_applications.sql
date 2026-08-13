-- ============================================================
-- Migration 045: 对外官网的应募投递（RECRUIT 表单）
--
-- 唯一由公网匿名访问者产生的表。写入只走服务端 service role（我们的
-- /api/site/applications），因此这里**不给 anon/authenticated 任何 insert
-- 策略** —— 公开的 anon key 拿不到写权限，即使被人从浏览器直连也写不进来。
--
-- 字段上限与 src/lib/site/application.ts 的 LIMITS 一致，两边改要一起改。
-- ============================================================

create table if not exists site_applications (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 30),
  age        smallint not null check (age between 16 and 60),
  residence  text not null check (char_length(residence) between 1 and 60),
  -- 设计稿的表单没有联系方式字段，收了也联系不上应募者，落地时补上（必填）
  contact    text not null check (char_length(contact) between 1 and 120),
  experience text check (char_length(experience) <= 1000),
  -- 应募时用的站点语言：ops 回复时用对语言
  locale     text not null check (locale in ('zh','en','ja')),
  status     text not null default 'new' check (status in ('new','reviewing','accepted','rejected')),
  -- 限流指纹 = sha256(salt:ip)。不存原始 IP：我们只需要「同一来源一小时提交
  -- 了几次」，不需要知道来源是谁
  ip_hash    text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- 后台列表按时间倒序；限流按 (ip_hash, created_at) 查最近一小时
create index if not exists idx_site_applications_created_at
  on site_applications(created_at desc);
create index if not exists idx_site_applications_ip_hash_created
  on site_applications(ip_hash, created_at desc);

alter table site_applications enable row level security;

-- 内部登录用户可读（后台只读列表页）。没有 insert/update/delete 策略是刻意的。
drop policy if exists "Authenticated can read site applications" on site_applications;
create policy "Authenticated can read site applications"
  on site_applications for select
  to authenticated
  using (true);
