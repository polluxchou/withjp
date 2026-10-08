-- competitor_company_accounts：给「不追踪、但要留一份数据」的团加两列。
--
-- status：active（在运营）/ inactive（已停更）。停更的团不进追踪清单 competitors——
--   进了就会被周采和直播巡检带上，而它已经不更新了。
-- profile_snapshot：一次性存档的主页数据
--   { captured_on, followers, likes, following, videos, nickname, avatar_url }
--   只给没在追踪的团用；已追踪的团看 competitor_snapshots。
--
-- 全文幂等：列 if not exists；约束先查后建；数据只写仍为空的行。

alter table competitor_company_accounts add column if not exists status text not null default 'active';
alter table competitor_company_accounts add column if not exists profile_snapshot jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'competitor_company_accounts_status_ck'
  ) then
    alter table competitor_company_accounts
      add constraint competitor_company_accounts_status_ck check (status in ('active', 'inactive'));
  end if;
end $$;

-- ① KiXTR（@kixtr.666）归 MaGo。2026-10-08 已在生产库写入，这里补录。
insert into competitor_company_accounts (company_id, group_name, handle, competitor_id, note, sort_order)
select co.id, 'KiXTR', c.handle, c.id,
       '6 人团，2026-06-14 从关西出道；开播 日〜木 15:00–17:00 / 19:30–22:30，与 MaGo 招聘写的周日到周四排班一致',
       20
from competitor_companies co
join competitors c on c.platform = 'tiktok' and c.handle = 'kixtr.666' and c.parent_id is null
where co.name = 'MaGo'
on conflict (company_id, group_name) do nothing;

-- ② Kiwii Girls（@kiwii_girls）：MaGo 的团，已停更，主页简介改成引导关注 @KiXTR。
--    存一份 2026-10-08 的主页数据，不进追踪清单。头像已传到 competitor-shots/avatars/。
update competitor_company_accounts a
set handle = 'kiwii_girls',
    status = 'inactive',
    note = '大阪北浜演播室；已停更，主页简介改为引导关注 @KiXTR',
    profile_snapshot = '{
      "captured_on": "2026-10-08",
      "followers": 3919,
      "likes": 17800,
      "following": 41,
      "videos": 41,
      "nickname": "Kiwii_girls",
      "avatar_url": "https://aumcmufpjkxkgaylrfzl.supabase.co/storage/v1/object/public/competitor-shots/avatars/d1f47151-588d-452d-b46e-3f48e54494f7.jpeg"
    }'::jsonb
from competitor_companies co
where co.name = 'MaGo'
  and a.company_id = co.id
  and a.group_name = 'Kiwii Girls'
  and a.profile_snapshot is null;
