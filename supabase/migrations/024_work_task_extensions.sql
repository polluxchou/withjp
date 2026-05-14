-- Extend work_tasks with deadline, repeat cycle, completion criteria, and reviewer

ALTER TABLE work_tasks
  ADD COLUMN due_date             DATE,
  ADD COLUMN repeat_interval      TEXT CHECK (repeat_interval IN ('daily', 'weekly', 'biweekly', 'monthly')),
  ADD COLUMN completion_criteria  TEXT,
  ADD COLUMN reviewer_user_id     UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_tasks_reviewer ON work_tasks(reviewer_user_id);
