create table if not exists notifications (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references users(id) on delete cascade not null,
  type         text not null,
  title        text not null,
  body         text,
  entity_type  text,
  entity_id    uuid,
  action_url   text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_notifications_user_read_created
  on notifications (user_id, read_at, created_at desc);
