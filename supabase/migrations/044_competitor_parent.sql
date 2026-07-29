-- 044_competitor_parent.sql
-- 竞品父子层级:下探发现的关联主播作为某个竞品的「下一级」,不在首页平铺。
-- parent_id 指向触发它的父竞品;首页只列 parent_id 为空的主竞品,子账号挂在父的 related 下。
-- 随父删除级联删子(与 snapshots/shots 的 on delete cascade 一致)。

alter table competitors add column if not exists parent_id uuid
  references competitors(id) on delete cascade;

create index if not exists idx_competitors_parent on competitors(parent_id);
