-- ============================================================
-- 战略时间轴：节点完成日期
-- ============================================================
-- 「完成日期」与「已完成」状态互为充要条件：
--     status = 'completed'  ⇔  completed_date is not null
-- 推导收在 src/lib/milestones/completion.ts(resolveCompletion)，由 API 单点把关。
-- 这里刻意不加 check 约束 —— seed 脚本与巡检脚本也直接写这张表，硬约束会让它们
-- 在与本次改动无关的写入上整条失败。

alter table milestones
  add column if not exists completed_date timestamptz;

comment on column milestones.completed_date is
  '节点实际完成日期(东京业务日的 UTC 日戳)。非空 ⇔ status = ''completed''。';

-- 回填：既有「已完成」节点没有比目标日期更可信的锚点，用它兜底。
-- 不回填就会留下「已完成但没有完成日期」的破例行,这类行一进编辑表单保存,
-- 清空规则会把它踢出已完成状态。回填成目标日期后,进度曲线的渲染与回填前完全一致。
update milestones
   set completed_date = target_date
 where status = 'completed'
   and completed_date is null;

create index if not exists idx_milestones_completed_date
  on milestones(completed_date)
  where completed_date is not null;
