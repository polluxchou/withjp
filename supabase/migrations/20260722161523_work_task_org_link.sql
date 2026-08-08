-- ============================================================
-- Migration 042: 工时任务 ⇄ 业务分工事项 关联
-- work_tasks 关联到 task_items(最小单元/事项);快照列保留下发时的事项名。
-- 可空(交互层强制,DB 层过渡期留空);删除事项时断开关联,历史任务与快照保留。
-- ============================================================

ALTER TABLE work_tasks
  ADD COLUMN business_task_item_id   uuid REFERENCES task_items(id) ON DELETE SET NULL,
  ADD COLUMN business_task_item_name text;

CREATE INDEX IF NOT EXISTS idx_work_tasks_business_task_item
  ON work_tasks(business_task_item_id);
