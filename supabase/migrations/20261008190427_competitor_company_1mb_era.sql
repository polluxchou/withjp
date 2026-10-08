-- 把追踪账号 1mb.era 关联到 GGTK（排在 GGTK 首批 8 个团之后）。
-- 2026-10-08 已在生产库 SQL Editor 手工执行过；本文件补录，让从迁移重建的库与生产一致。
-- 幂等：(company_id, group_name) 冲突即跳过，生产库再跑一遍是空操作。
-- 团名「1MB ERA」是暂定写法：该账号在追踪表里还没有显示名。

insert into competitor_company_accounts (company_id, group_name, handle, competitor_id, note, sort_order)
select co.id, '1MB ERA', c.handle, c.id, '', 90
from competitor_companies co
join competitors c on c.platform = 'tiktok' and c.handle = '1mb.era' and c.parent_id is null
where co.name = 'GGTK'
on conflict (company_id, group_name) do nothing;
