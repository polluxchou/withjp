-- ============================================================
-- Creator Activity Logs — 记录 Creator 的所有活动和状态变化
-- ============================================================

-- 活动类型枚举
create type activity_type as enum (
  'created',           -- 创建 Creator
  'updated',           -- 更新基本信息
  'status_changed',    -- 状态转换
  'task_created',      -- 创建任务
  'task_completed',    -- 任务完成
  'finance_logged',    -- 记录财务数据
  'note_added',        -- 添加备注
  'contact_updated',   -- 更新联系方式
  'profile_updated',   -- 更新个人资料
  'other'              -- 其他活动
);

-- 活动日志表
create table creator_activity_logs (
  id            uuid primary key default uuid_generate_v4(),
  creator_id    uuid not null references creators(id) on delete cascade,
  activity_type activity_type not null,
  title         text not null,                    -- 活动标题，如 "状态变更为 Live"
  description   text,                              -- 详细描述
  metadata      jsonb not null default '{}',       -- 额外的结构化数据
  actor         text not null default 'system',    -- 操作者（用户邮箱、系统、Agent名称等）
  created_at    timestamptz not null default now()
);

-- 索引
create index idx_activity_logs_creator_id on creator_activity_logs(creator_id);
create index idx_activity_logs_created_at on creator_activity_logs(created_at desc);
create index idx_activity_logs_type on creator_activity_logs(activity_type);

-- 为现有的 lifecycle_transitions 创建触发器，自动记录到活动日志
create or replace function log_lifecycle_transition()
returns trigger language plpgsql as $$
begin
  insert into creator_activity_logs (
    creator_id,
    activity_type,
    title,
    description,
    metadata,
    actor
  ) values (
    new.creator_id,
    'status_changed',
    '状态变更: ' || new.from_status || ' → ' || new.to_status,
    new.notes,
    jsonb_build_object(
      'from_status', new.from_status,
      'to_status', new.to_status,
      'transition_id', new.id
    ),
    new.triggered_by
  );
  return new;
end;
$$;

create trigger lifecycle_transition_log
  after insert on lifecycle_transitions
  for each row
  execute function log_lifecycle_transition();

-- 为 Creator 创建触发器，记录创建和更新
create or replace function log_creator_changes()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    insert into creator_activity_logs (
      creator_id,
      activity_type,
      title,
      description,
      metadata,
      actor
    ) values (
      new.id,
      'created',
      '创建 Creator: ' || new.name,
      '平台: ' || new.platform,
      jsonb_build_object(
        'platform', new.platform,
        'status', new.status
      ),
      'user'
    );
  elsif (TG_OP = 'UPDATE') then
    -- 只在实际有变化时记录
    if (old.name != new.name or old.platform != new.platform or
        old.contact_info != new.contact_info or old.profile != new.profile or
        old.notes != new.notes) then
      insert into creator_activity_logs (
        creator_id,
        activity_type,
        title,
        description,
        metadata,
        actor
      ) values (
        new.id,
        'updated',
        '更新 Creator 信息',
        case
          when old.name != new.name then '名称: ' || old.name || ' → ' || new.name
          when old.platform != new.platform then '平台: ' || old.platform || ' → ' || new.platform
          when old.contact_info != new.contact_info then '更新联系方式'
          when old.profile != new.profile then '更新个人资料'
          when old.notes != new.notes then '更新备注'
          else '更新基本信息'
        end,
        jsonb_build_object(
          'changes', jsonb_build_object(
            'name', case when old.name != new.name then jsonb_build_object('old', old.name, 'new', new.name) else null end,
            'platform', case when old.platform != new.platform then jsonb_build_object('old', old.platform, 'new', new.platform) else null end
          )
        ),
        'user'
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger creator_changes_log
  after insert or update on creators
  for each row
  execute function log_creator_changes();

-- 为 Tasks 创建触发器，记录任务创建和完成
create or replace function log_task_changes()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    insert into creator_activity_logs (
      creator_id,
      activity_type,
      title,
      description,
      metadata,
      actor
    ) values (
      new.creator_id,
      'task_created',
      '创建任务: ' || new.title,
      null,
      jsonb_build_object(
        'task_id', new.id,
        'agent_id', new.agent_id,
        'status', new.status
      ),
      'system'
    );
  elsif (TG_OP = 'UPDATE' and old.status != new.status and new.status = 'done') then
    insert into creator_activity_logs (
      creator_id,
      activity_type,
      title,
      description,
      metadata,
      actor
    ) values (
      new.creator_id,
      'task_completed',
      '完成任务: ' || new.title,
      null,
      jsonb_build_object(
        'task_id', new.id,
        'agent_id', new.agent_id
      ),
      'system'
    );
  end if;
  return new;
end;
$$;

create trigger task_changes_log
  after insert or update on tasks
  for each row
  execute function log_task_changes();

-- 为 Finance 创建触发器，记录财务数据
create or replace function log_finance_changes()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    insert into creator_activity_logs (
      creator_id,
      activity_type,
      title,
      description,
      metadata,
      actor
    ) values (
      new.creator_id,
      'finance_logged',
      '记录财务数据: ' || new.period,
      '收入 ¥' || new.revenue || ', 成本 ¥' || new.cost || ', ROI ' || new.roi || '%',
      jsonb_build_object(
        'finance_id', new.id,
        'revenue', new.revenue,
        'cost', new.cost,
        'profit', new.profit,
        'roi', new.roi,
        'period', new.period
      ),
      'user'
    );
  end if;
  return new;
end;
$$;

create trigger finance_changes_log
  after insert on finance
  for each row
  execute function log_finance_changes();
