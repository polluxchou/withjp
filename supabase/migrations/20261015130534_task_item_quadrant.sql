-- ============================================================
-- 业务分工事项：四象限所需的三列
-- is_important：重要（人工标记），null = 待评估
-- due_date：截止日（date，东京业务日口径），决定「紧急」
-- status：未开始 / 进行中 / 卡住 / 已完成
-- 设计见 docs/superpowers/specs/2026-10-15-org-quadrant-board-design.md
-- ============================================================

alter table task_items
  add column if not exists is_important boolean,
  add column if not exists due_date     date,
  add column if not exists status       text not null default 'todo'
    constraint task_items_status_ck check (status in ('todo', 'doing', 'blocked', 'done'));
