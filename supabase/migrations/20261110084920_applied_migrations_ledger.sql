-- 迁移「已应用」账本：见 supabase/migrations/README.md「已应用账本」。
--
-- 本目录的迁移是在 SQL Editor 手工执行的，此前「合并了」和「跑过了」之间没有任何
-- 记录相连，已因漏应用出过两次线上事故。从本文件起，每个迁移的最后一句都把自己登记
-- 进这张表（npm run migrations:stamp 生成），npm run audit:migrations 拿目录和这张表比对。
-- 全部幂等，可重复执行。

create table if not exists public.applied_migrations (
  filename   text primary key,
  checksum   text not null,
  applied_at timestamptz not null default now(),
  backfilled boolean not null default false
);

comment on table public.applied_migrations is '迁移已应用账本：每个迁移执行到最后一句时登记自己';
comment on column public.applied_migrations.filename is 'supabase/migrations 下的文件名';
comment on column public.applied_migrations.checksum is '登记语句之上的 SQL 的 sha256（scripts/migration-ledger.mjs）';
comment on column public.applied_migrations.applied_at is '最近一次执行时间；backfilled 的行是回填时间，不是真实执行时间';
comment on column public.applied_migrations.backfilled is 'true = 账本建立前就已应用，由回填迁移补登记';

-- 只有后端（service role）和 SQL Editor 用得到。开 RLS 且不建策略 = 对 Data API 全拒；
-- revoke 再把表级权限也收掉（TRUNCATE 不受 RLS 约束）。
alter table public.applied_migrations enable row level security;
revoke all on public.applied_migrations from anon, authenticated;
grant select, insert, update, delete on public.applied_migrations to service_role;

-- @applied-migrations-ledger（由 npm run migrations:stamp 生成，勿手改；改了上面的 SQL 要重新生成）
insert into public.applied_migrations (filename, checksum)
values ('20261110084920_applied_migrations_ledger.sql', '8de8244b74be820d90eb56d5072f007394f5d8acb91d1d064404faa8e157c679')
on conflict (filename) do update
  set checksum = excluded.checksum, applied_at = now(), backfilled = false;
