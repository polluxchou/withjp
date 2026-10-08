-- GGTK 旗下两个团的账号关联补录，让从迁移重建的库与生产一致。全文幂等。
--
-- ① 1MB ERA：追踪账号 1mb.era 关联到 GGTK，排在首批 8 个团之后。
--    2026-10-08 已在生产库 SQL Editor 手工执行过。团名取自 TikTok 昵称「1MB ERA」。
-- ② 1MB Girls：首批录入时不知道账号，现已确认是 @1mb.girls（主页简介 @ 了
--    1MB DEAR / Twinkle / Rizz / Fiora）。补 handle；若 1mb.girls 已在追踪清单里，
--    顺带挂上 competitor_id。追踪清单本身（含头像）不在迁移里，靠后台「加入清单」
--    或手工 SQL 写入；清单里还没有它时这里只补 handle，之后再跑一遍即可挂上。

insert into competitor_company_accounts (company_id, group_name, handle, competitor_id, note, sort_order)
select co.id, '1MB ERA', c.handle, c.id, '', 90
from competitor_companies co
join competitors c on c.platform = 'tiktok' and c.handle = '1mb.era' and c.parent_id is null
where co.name = 'GGTK'
on conflict (company_id, group_name) do nothing;

update competitor_company_accounts a
set handle = '1mb.girls',
    competitor_id = coalesce(
      a.competitor_id,
      (select c.id from competitors c
       where c.platform = 'tiktok' and c.handle = '1mb.girls' and c.parent_id is null)
    )
from competitor_companies co
where co.name = 'GGTK'
  and a.company_id = co.id
  and a.group_name = '1MB Girls';
