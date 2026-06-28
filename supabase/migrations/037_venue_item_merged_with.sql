-- 记录哪些 area 组件已被用户主动合并（双向引用），用于 2D/3D 隐藏共享边。
alter table venue_items
  add column if not exists merged_with text[] not null default '{}';
