-- ============================================================
-- Migration 046: RLS 加固 —— 关掉三个 anon 可达面 + 收紧薪资表
--
-- 背景：审计 docs/2026-08-13-system-audit.md 的 P0-1 / P0-2 / P0-3。
-- 038 之后全库看起来"都开了 RLS"，实际有三个面对公网开着：
--
--   ① users / broadcast_accounts 的 select 策略写成 `using (true)` 且
--      **没有 `to authenticated`**。Postgres 的默认 grantee 是 PUBLIC，
--      Supabase 又默认给 anon 角色授了 public schema 的表权限，于是这两张表
--      对**未登录的任何人**可读：全员姓名、邮箱、user_code、角色、is_admin，
--      以及全部直播账号绑定。anon key 内联在 /login 的 JS bundle 里，
--      获取成本约等于零。
--
--   ② venue_items 根本没 enable RLS —— 038 的表清单漏了它（同一迁移 029
--      建的 venues / venue_floors / venue_editors 都在清单里）。表未启用
--      RLS 时，默认 grant 意味着 anon key 可直接增删改查。
--
--   ③ user_salary 挂的是 038 那条 authenticated_only，等价于"只要登录就能
--      读写"。任何员工拿 anon key 直连 PostgREST 即可读全公司薪资。
--
-- 【不改变任何应用行为】所有 API route 都走 service_role（见
-- src/lib/supabase/server.ts）。service_role 绕过 RLS，且 Supabase 单独给它
-- 授了全表权限；下面所有 revoke 只针对 anon / authenticated 两个客户端角色，
-- 而这两个角色在本仓里只被用于「登录」和「登出」，没有任何一处直接查业务表
-- （`supabase.from(` 在 src/ 下零命中）。
--
-- 【本迁移不解决的】P0-4：API route 只判「是否登录」不判角色。那是应用层的
-- 洞，RLS 管不到 service_role。/api/user-salary 仍需单独加角色判定。
--
-- 【为什么每张表都是 revoke all 再 grant 回最小集】
-- Supabase 的默认授权是 `grant all on tables to anon, authenticated`，其中
-- 包含 **TRUNCATE** —— 而 TRUNCATE **完全不受 RLS 约束**。只 revoke
-- select/insert/update/delete 的话，任何登录用户（乃至拿到直连的 anon）
-- 仍然可以一句 `truncate users` 把表清空，策略拦不住。REFERENCES / TRIGGER
-- 同理不该留给客户端角色。所以下面一律先 revoke all，再按需要 grant 回来。
-- （这一条是本迁移在一次性 Postgres 容器上实跑后才暴露出来的，不是推导的。）
-- ============================================================

-- ── 1. users ─────────────────────────────────────────────────

-- 每条 create 前都先 drop 新名字：本仓的迁移是人工按文件名顺序应用的、没有
-- schema_migrations 记录（审计 D-1），重复执行是迟早会发生的事，整个文件必须可重跑。
drop policy if exists "Users can view all profiles" on users;
drop policy if exists "Authenticated can view profiles" on users;

create policy "Authenticated can view profiles"
  on users for select
  to authenticated
  using (true);

-- 原 "Users can update own profile" 允许登录用户改自己那一行的**任意列**，
-- 其中包括 021 加进来的 is_admin —— 任何员工对自己 PATCH 一下就能变管理员，
-- 顺手还能把 role 改成 finance。RLS 做不了列级控制，所以这里两手都收：
--   · 删掉该策略（而不是保留一条"收紧版"）—— 保留它反而是负债：万一将来
--     有人恢复了表级 grant，一条 for-update 策略就会立刻把整行写权限还回去。
--     没有策略 = 拒绝，这才是安全的默认。
--   · 同时 revoke 表级写权限，作为第一道闸。
-- 个人资料的读写现在全部走 /api/profile（service_role），因此这两步都不影响
-- 任何功能。将来若真要做浏览器端直改 profile，必须显式地重新加回
-- `grant update (name, avatar_url)` + 一条对应策略 —— 让它成为一次有人点头的
-- 动作，而不是从历史里继承下来的既成事实。
drop policy if exists "Users can update own profile" on users;

revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;

-- ── 2. broadcast_accounts ────────────────────────────────────
-- 这张表本来就只有 select 策略（没有写策略 = PostgREST 写不进来），
-- 需要补的只是把读收回给登录用户。

drop policy if exists "Users can view broadcast accounts" on broadcast_accounts;
drop policy if exists "Authenticated can view broadcast accounts" on broadcast_accounts;

create policy "Authenticated can view broadcast accounts"
  on broadcast_accounts for select
  to authenticated
  using (true);

revoke all on public.broadcast_accounts from anon, authenticated;
grant select on public.broadcast_accounts to authenticated;

-- ── 3. venue_items ───────────────────────────────────────────
-- 沿用 038 的 authenticated_only 约定，与同批的 venues / venue_floors /
-- venue_editors 保持一致。这里只关 anon 这个洞；"登录即可写"是 P0-1 的
-- 全局问题，要靠角色矩阵解决，不在本迁移范围内。

alter table venue_items enable row level security;

drop policy if exists "authenticated_only" on venue_items;

create policy "authenticated_only"
  on venue_items for all
  to authenticated
  using (auth.uid() is not null);

revoke all on public.venue_items from anon, authenticated;
grant select, insert, update, delete on public.venue_items to authenticated;

-- ── 4. user_salary ───────────────────────────────────────────
--
-- 为什么是 is_admin 而不是审计建议的 "finance 或 admin"：
--   /api/profile 的 PATCH 允许**任何用户自选 role**（包括 'finance'，见该
--   route 的 validRoles 数组）。把 role='finance' 写进策略，等于给所有人开了
--   一条两步自助提权路：先把自己改成 finance，再直连 PostgREST 读薪资。
--   而 is_admin 在整个代码库里**没有任何写入点**（只有 021 的一次性 update
--   给指定邮箱置了 true），是目前唯一可信的权限位。
--   等 role 改成"仅管理员可分配"之后，再把 finance 加进这条策略。
--
-- 写侧不给任何策略：RLS 下没有策略即拒绝。薪资的增删改全部走
-- /api/user-salary（service_role）—— 那条路上的角色判定是另一件事（P0-4）。

drop policy if exists "authenticated_only" on user_salary;
drop policy if exists "Admins can read salary" on user_salary;

create policy "Admins can read salary"
  on user_salary for select
  to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.is_admin
    )
  );

revoke all on public.user_salary from anon, authenticated;
grant select on public.user_salary to authenticated;

-- ============================================================
-- 应用后自检（在 Supabase SQL editor 里跑，四条都应返回预期结果）：
--
-- 1) 不应再有任何面向 PUBLIC / anon 的宽松策略：
--    select tablename, policyname, roles, cmd
--    from pg_policies
--    where schemaname = 'public'
--      and (roles = '{public}' or 'anon' = any(roles));
--    → 期望 0 行
--
-- 2) public schema 下不应再有未启用 RLS 的表：
--    select t.tablename
--    from pg_tables t
--    join pg_class c on c.relname = t.tablename
--    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
--    where t.schemaname = 'public' and not c.relrowsecurity;
--    → 期望 0 行
--
-- 3) anon 不应对这四张表还有任何权限；authenticated 只应剩下面这些
--    （注意看 TRUNCATE 有没有漏网 —— 它不受 RLS 约束）：
--    select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type)
--    from information_schema.role_table_grants
--    where grantee in ('anon','authenticated')
--      and table_name in ('users','broadcast_accounts','venue_items','user_salary')
--    group by grantee, table_name order by grantee, table_name;
--    → 期望：anon 0 行；authenticated 恰好
--        broadcast_accounts = SELECT
--        user_salary        = SELECT
--        users              = SELECT
--        venue_items        = DELETE,INSERT,SELECT,UPDATE
--
-- 4) 拿 anon key 直连验证（应返回空数组或权限错误，而不是数据）：
--    curl "$SUPABASE_URL/rest/v1/users?select=name" -H "apikey: $ANON_KEY"
-- ============================================================
