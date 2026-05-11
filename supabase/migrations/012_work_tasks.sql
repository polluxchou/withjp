-- ============================================================
-- Migration 012: Work Tasks & User Salary
-- Human work task management with workload tracking and
-- labour cost calculation based on monthly salary.
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

create type work_task_type as enum (
  'fixed',   -- 固定任务（周期性、常规）
  'adhoc'    -- 临时任务（一次性）
);

create type work_task_status as enum (
  'planned',    -- 计划中
  'doing',      -- 进行中
  'done',       -- 已完成
  'cancelled'   -- 已取消
);

-- ── User Salary ───────────────────────────────────────────────
-- Stores salary history per user; effective_to = NULL means current.

create table user_salary (
  id             uuid          primary key default uuid_generate_v4(),
  user_id        uuid          not null references users(id) on delete cascade,
  monthly_salary numeric(10,2) not null check (monthly_salary >= 0),
  effective_from date          not null,
  effective_to   date,                          -- null = currently active
  notes          text,
  created_at     timestamptz   not null default now(),

  constraint user_salary_date_order check (
    effective_to is null or effective_to > effective_from
  )
);

create index idx_user_salary_user_id        on user_salary(user_id);
create index idx_user_salary_effective_from on user_salary(effective_from);

-- ── Work Tasks ────────────────────────────────────────────────

create table work_tasks (
  id              uuid             primary key default uuid_generate_v4(),
  task_type       work_task_type   not null default 'adhoc',
  title           text             not null,
  description     text,
  department      agent_role       not null,        -- reuses existing enum
  milestone_id    uuid             references milestones(id) on delete set null,
  owner_user_id   uuid             not null references users(id),
  executor_ids    uuid[]           not null default '{}',  -- references users.id
  task_date       date             not null,
  effort_hours    integer          not null default 2,
  status          work_task_status not null default 'planned',
  notes           text,
  created_at      timestamptz      not null default now(),
  updated_at      timestamptz      not null default now(),

  constraint work_tasks_effort_valid check (effort_hours in (2, 4, 8))
);

create index idx_work_tasks_task_date     on work_tasks(task_date);
create index idx_work_tasks_department    on work_tasks(department);
create index idx_work_tasks_owner         on work_tasks(owner_user_id);
create index idx_work_tasks_milestone     on work_tasks(milestone_id);
create index idx_work_tasks_status        on work_tasks(status);
create index idx_work_tasks_type          on work_tasks(task_type);

-- ── updated_at trigger ───────────────────────────────────────

create trigger work_tasks_updated_at
  before update on work_tasks
  for each row execute function update_updated_at();
