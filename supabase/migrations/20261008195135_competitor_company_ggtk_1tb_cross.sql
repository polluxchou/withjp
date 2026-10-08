-- 1tb.cross 归入 GGTK。全文幂等。
--
-- 1tb.cross 已在追踪清单里但没有公司认领，页面上落在"未归属"。第三方团播服务商
-- 官网的案例列表把它标为「日本 / GGTK」，1TB 前缀也和 1TB Boiz 同一条男团线。
-- 清单里没有昵称，团名按 handle 写作 1TB Cross，拿到 TikTok 昵称再改。

insert into competitor_company_accounts (company_id, group_name, handle, competitor_id, note, sort_order)
select co.id, '1TB Cross', c.handle, c.id, '团名按 handle 推断', 100
from competitor_companies co
join competitors c on c.platform = 'tiktok' and c.handle = '1tb.cross' and c.parent_id is null
where co.name = 'GGTK'
  -- 已被认领（包括之后改过团名）就跳过，否则会撞"一个账号只归一家公司"的唯一索引。
  and not exists (select 1 from competitor_company_accounts a where a.competitor_id = c.id)
on conflict (company_id, group_name) do nothing;
