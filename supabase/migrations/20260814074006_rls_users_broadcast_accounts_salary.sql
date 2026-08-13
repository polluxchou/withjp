-- ============================================================
-- 补上两个 anon 可达面，并把薪资表收紧到管理员
--
-- 背景：审计 docs/2026-08-13-system-audit.md 的 P0-1 / P0-2。
-- `20260701200037_enable_rls_all_tables.sql`（原 038）之后全库看起来"都开了
-- RLS"，但这两张表的策略是更早写的，形状不一样：
--
--   create policy "Users can view all profiles"
--     on users for select using (true);              -- 20260510190409
--   create policy "Users can view broadcast accounts"
--     on broadcast_accounts for select using (true); -- 20260510190410
--
-- 两条都**没有 `to authenticated`**。Postgres 的默认 grantee 是 PUBLIC，
-- Supabase 又默认给 anon 角色授了 public schema 的表权限，于是这两张表对
-- **未登录的任何人**开放读取：全员姓名、邮箱、user_code、角色、is_admin，
-- 以及全部直播账号绑定。anon key 内联在 /login 的 JS bundle 里，获取成本
-- 约等于零；官网上线后公司已有对外曝光面，这条从"内网小问题"变成"外部可利用"。
--
-- 第三条：user_salary 挂的是 enable_rls_all_tables 那条 authenticated_only
-- （`for all to authenticated using (auth.uid() is not null)`），等价于
-- "只要登录就能读写"。任何员工拿 anon key 直连 PostgREST 即可读全公司薪资。
--
-- 【venue_items 不在本文件里】那条已由 20260812111104_enable_rls_venue_items.sql
-- 修复，本文件不重复处理。
--
-- 【不改变任何应用行为】所有 API route 走 service_role（src/lib/supabase/server.ts），
-- service_role 绕过 RLS 且有独立授权；下面所有 revoke 只针对 anon / authenticated
-- 两个客户端角色，而这两个角色在本仓里只被用于登录/登出，没有任何一处直接查
-- 业务表（`supabase.from(` 在 src/ 下零命中）。
--
-- 【本文件不解决的】API route 只判"是否登录"不判角色（审计 P0-4）。那是应用层
-- 的洞，RLS 管不到 service_role；/api/user-salary 仍需单独加角色判定。
--
-- 【为什么每张表都是 revoke all 再 grant 回最小集】
-- Supabase 的默认授权是 `grant all on tables to anon, authenticated`，其中包含
-- **TRUNCATE**，而 TRUNCATE **完全不受 RLS 约束**。只 revoke select/insert/
-- update/delete 的话，任何登录用户仍可一句 `truncate users` 把表清空，策略拦不住。
-- REFERENCES / TRIGGER 同理不该留给客户端角色。所以一律先 revoke all 再按需 grant。
-- （这一条是在一次性 Postgres 容器上实跑后才暴露的，不是推导的。）
--
-- 本文件幂等，重复执行无副作用。
-- ============================================================

-- ── 1. users ─────────────────────────────────────────────────

-- 每条 create 前先 drop 新旧两个名字：本目录的迁移在 Supabase Dashboard 手工
-- 执行、没有追踪表（见 README），重复执行是迟早会发生的事。
drop policy if exists "Users can view all profiles" on users;
drop policy if exists "Authenticated can view profiles" on users;

create policy "Authenticated can view profiles"
  on users for select
  to authenticated
  using (true);

-- 原 "Users can update own profile" 允许登录用户改自己那一行的**任意列**，
-- 其中包括 is_admin —— 任何员工对自己 PATCH 一下就能变管理员，顺手还能把
-- role 改成 finance。RLS 做不了列级控制，所以两手都收：
--   · 删掉该策略，而不是保留一条"收紧版"。保留它反而是负债：万一将来有人
--     恢复了表级 grant，一条 for-update 策略就会立刻把整行写权限还回去。
--     没有策略 = 拒绝，这才是安全的默认。
--   · 同时 revoke 表级写权限，作为第一道闸。
-- 个人资料的读写现在全部走 /api/profile（service_role），这两步都不影响功能。
-- 将来若要做浏览器端直改 profile，必须显式加回 `grant update (name, avatar_url)`
-- 与一条对应策略 —— 让它成为一次有人点头的动作，而不是从历史里继承的既成事实。
drop policy if exists "Users can update own profile" on users;

revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;

-- ── 2. broadcast_accounts ────────────────────────────────────
-- 本来就只有 select 策略（没有写策略 = PostgREST 写不进来），
-- 需要补的只是把读收回给登录用户。

drop policy if exists "Users can view broadcast accounts" on broadcast_accounts;
drop policy if exists "Authenticated can view broadcast accounts" on broadcast_accounts;

create policy "Authenticated can view broadcast accounts"
  on broadcast_accounts for select
  to authenticated
  using (true);

revoke all on public.broadcast_accounts from anon, authenticated;
grant select on public.broadcast_accounts to authenticated;

-- ── 3. user_salary ───────────────────────────────────────────
--
-- 为什么是 is_admin 而不是"finance 或 admin"：
--   /api/profile 的 PATCH 允许**任何用户自选 role**（含 'finance'），而它的 GET
--   在用户没有 profile 行时还会自动建档并写死 `role: 'ops'`。也就是说 role 不是
--   被授予的权限，而是用户可自控的字段。把 role 写进策略，等于给所有人开一条
--   两步自助提权路：先把自己改成 finance，再直连 PostgREST 读薪资。
--   而 is_admin 在整个代码库里**没有任何写入点**（只有一次性 update 给指定邮箱
--   置了 true），是目前唯一可信的权限位。
--   等 role 改成"仅管理员可分配"、且建档默认角色改成最小权限之后，
--   再把 finance 加进这条策略。
--
-- 写侧不给任何策略：RLS 下没有策略即拒绝。薪资的增删改全部走 /api/user-salary
-- （service_role）—— 那条路上的角色判定是另一件事（审计 P0-4）。

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
-- 应用后自检（在 Supabase SQL editor 里跑）：
--
-- 1) 不应再有任何面向 PUBLIC / anon 的宽松策略：
--    select tablename, policyname, roles, cmd
--    from pg_policies
--    where schemaname = 'public'
--      and (roles = '{public}' or 'anon' = any(roles));
--    → 期望 0 行
--
-- 2) anon 对这三张表应无任何权限；authenticated 只应剩 SELECT
--    （注意看 TRUNCATE 有没有漏网 —— 它不受 RLS 约束）：
--    select grantee, table_name,
--           string_agg(privilege_type, ',' order by privilege_type) as privs
--    from information_schema.role_table_grants
--    where grantee in ('anon','authenticated')
--      and table_name in ('users','broadcast_accounts','user_salary')
--    group by grantee, table_name order by grantee, table_name;
--    → 期望：anon 0 行；authenticated 三张表各只有 SELECT
--
-- 3) 拿 anon key 直连验证（应返回空数组或权限错误，而不是数据）：
--    curl "$SUPABASE_URL/rest/v1/users?select=name" -H "apikey: $ANON_KEY"
-- ============================================================
