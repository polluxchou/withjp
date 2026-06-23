-- ============================================================
-- Migration 033: Venue ownership + collaborators
-- 每个场地有一个创办人(owner)；创办人/管理员可指定协作者共同编辑。
-- 非 owner/协作者/管理员 → 只读。owner_id 为空的历史场地视为"开放"。
-- ============================================================

alter table venues
  add column if not exists owner_id uuid references users(id) on delete set null;

create table if not exists venue_editors (
  venue_id   text        not null references venues(id) on delete cascade,
  user_id    uuid        not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);

create index if not exists idx_venue_editors_user on venue_editors(user_id);

-- 把现有共享场地 guild-main 的创办人指定为管理员(迁移 021 设定的 is_admin 账号)。
update venues
set owner_id = (select id from users where is_admin order by created_at limit 1)
where id = 'guild-main' and owner_id is null;
