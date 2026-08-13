-- ============================================================
-- Migration 041: 组织结构（业务分工）
-- 公司 → 业务 → 任务 → 事项 四层 WBS + 岗位(角色)正交维度。
-- 业务/事项 各 1 个唯一负责人(人)；任务关联多个岗位；岗位挂成员(人)。
-- 人 = users(内部员工) 或 creators(主播)，二选一。
-- ============================================================

-- 1) 岗位（固定枚举）
create table if not exists positions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text not null default '',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- 2) 岗位成员（配人）
create table if not exists position_members (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id) on delete cascade,
  member_type text not null check (member_type in ('user','creator')),
  user_id     uuid references users(id)    on delete cascade,
  creator_id  uuid references creators(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint position_members_ref_ck check (
    (member_type = 'user'    and user_id is not null and creator_id is null) or
    (member_type = 'creator' and creator_id is not null and user_id is null)
  )
);
create unique index if not exists uq_position_members_user
  on position_members(position_id, user_id) where user_id is not null;
create unique index if not exists uq_position_members_creator
  on position_members(position_id, creator_id) where creator_id is not null;

-- 3) 业务（固定枚举，唯一负责人）
create table if not exists businesses (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique,
  name              text not null,
  sort_order        int  not null default 0,
  owner_member_type text check (owner_member_type in ('user','creator')),
  owner_user_id     uuid references users(id)    on delete set null,
  owner_creator_id  uuid references creators(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint businesses_owner_ck check (
    owner_member_type is null
    or (owner_member_type = 'user'    and owner_user_id is not null and owner_creator_id is null)
    or (owner_member_type = 'creator' and owner_creator_id is not null and owner_user_id is null)
  )
);

-- 4) 任务（属于业务）
create table if not exists business_tasks (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_business_tasks_business on business_tasks(business_id);

-- 5) 任务 ↔ 岗位（多对多）
create table if not exists business_task_positions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references business_tasks(id) on delete cascade,
  position_id uuid not null references positions(id)      on delete cascade,
  created_at  timestamptz not null default now(),
  unique (task_id, position_id)
);
create index if not exists idx_btp_task on business_task_positions(task_id);

-- 6) 事项（最小单位，属于任务，唯一负责人）
create table if not exists task_items (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references business_tasks(id) on delete cascade,
  name              text not null,
  sort_order        int  not null default 0,
  owner_member_type text check (owner_member_type in ('user','creator')),
  owner_user_id     uuid references users(id)    on delete set null,
  owner_creator_id  uuid references creators(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint task_items_owner_ck check (
    owner_member_type is null
    or (owner_member_type = 'user'    and owner_user_id is not null and owner_creator_id is null)
    or (owner_member_type = 'creator' and owner_creator_id is not null and owner_user_id is null)
  )
);
create index if not exists idx_task_items_task on task_items(task_id);

-- RLS：登录用户可读写（写权限在 service 层按 is_admin 再收紧），沿用 authenticated_only 约定。
do $$
declare t text;
  tables text[] := array[
    'positions','position_members','businesses',
    'business_tasks','business_task_positions','task_items'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename=t and policyname='authenticated_only'
    ) then
      execute format(
        'create policy "authenticated_only" on %I for all to authenticated using (auth.uid() is not null)', t
      );
    end if;
  end loop;
end $$;

-- ── Seed：10 岗位 ──
insert into positions (key, name, description, sort_order) values
  ('streamer',     '主播',       '团播成员（出镜）',          1),
  ('mc',           '主持人',     '团播现场调度',              2),
  ('agent',        '主播经纪人', '招募、管理、汰换主播',      3),
  ('group_ops',    '团播运营',   '团播现场运营、调度、策划',  4),
  ('makeup',       '化妆师',     '团播主播造型',              5),
  ('dance_coach',  '舞蹈培训师', '舞蹈培训',                  6),
  ('video_editor', '短视频剪辑', '短视频剪辑',                7),
  ('photographer', '摄影师',     '摄影',                      8),
  ('guild_leader', '公会长',     '公会负责人',                9),
  ('finance_tax',  '财税师',     '财务 / 税务',              10)
on conflict (key) do nothing;

-- ── Seed：4 业务 ──
insert into businesses (key, name, sort_order) values
  ('live_ops',     '直播运营', 1),
  ('streamer_ops', '主播运营', 2),
  ('company_mgmt', '公司管理', 3),
  ('offline_ops',  '线下运营', 4)
on conflict (key) do nothing;

-- ── Seed：11 任务 + 任务↔岗位 ──
do $$
declare
  b_live  uuid; b_str uuid; b_com uuid; b_off uuid;
  t_id    uuid;
begin
  select id into b_live from businesses where key='live_ops';
  select id into b_str  from businesses where key='streamer_ops';
  select id into b_com  from businesses where key='company_mgmt';
  select id into b_off  from businesses where key='offline_ops';

  -- 直播运营
  insert into business_tasks (business_id,name,sort_order) values (b_live,'团播执行',1) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('streamer','mc','photographer');

  insert into business_tasks (business_id,name,sort_order) values (b_live,'团播策划',2) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('dance_coach','makeup');

  insert into business_tasks (business_id,name,sort_order) values (b_live,'社群管理',3) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('group_ops');

  -- 主播运营
  insert into business_tasks (business_id,name,sort_order) values (b_str,'短视频运营',1) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('group_ops');

  insert into business_tasks (business_id,name,sort_order) values (b_str,'主播招募',2) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('agent');

  insert into business_tasks (business_id,name,sort_order) values (b_str,'主播培训',3) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('guild_leader','dance_coach','mc');

  -- 公司管理
  insert into business_tasks (business_id,name,sort_order) values (b_com,'场地管理',1) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('guild_leader');

  insert into business_tasks (business_id,name,sort_order) values (b_com,'薪资管理',2) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('guild_leader');

  insert into business_tasks (business_id,name,sort_order) values (b_com,'税务管理',3) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('finance_tax');

  -- 线下运营
  insert into business_tasks (business_id,name,sort_order) values (b_off,'商单合作',1) returning id into t_id;
  insert into business_task_positions (task_id,position_id)
    select t_id, id from positions where key in ('guild_leader');
end $$;
