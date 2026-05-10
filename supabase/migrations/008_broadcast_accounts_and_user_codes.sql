-- ============================================================
-- Broadcast accounts, creator ownership, and public user codes
-- ============================================================

-- ── Broadcast Accounts ───────────────────────────────────────
create table if not exists broadcast_accounts (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  platform       text not null,
  account_handle text not null,
  account_url    text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint broadcast_accounts_platform_handle_unique unique (platform, account_handle)
);

create index if not exists idx_broadcast_accounts_platform on broadcast_accounts(platform);

drop trigger if exists broadcast_accounts_updated_at on broadcast_accounts;
create trigger broadcast_accounts_updated_at
  before update on broadcast_accounts
  for each row
  execute function update_updated_at();

alter table broadcast_accounts enable row level security;

drop policy if exists "Users can view broadcast accounts" on broadcast_accounts;
create policy "Users can view broadcast accounts"
  on broadcast_accounts for select
  using (true);

-- ── Creators: one-to-one broadcast account + operator ────────
alter table creators
  add column if not exists broadcast_account_id uuid references broadcast_accounts(id) on delete set null,
  add column if not exists operator_user_id uuid references users(id) on delete set null;

create unique index if not exists idx_creators_broadcast_account_unique
  on creators(broadcast_account_id)
  where broadcast_account_id is not null;

create index if not exists idx_creators_operator_user_id on creators(operator_user_id);

-- ── Users: email + generated public user code ────────────────
alter table users
  add column if not exists email text,
  add column if not exists user_code text;

create unique index if not exists idx_users_email_unique
  on users(lower(email))
  where email is not null;

create unique index if not exists idx_users_user_code_unique
  on users(user_code)
  where user_code is not null;

create or replace function user_code_prefix(source_email text, source_name text)
returns text language plpgsql immutable as $$
declare
  email_prefix text;
  name_prefix text;
begin
  email_prefix := substring(regexp_replace(lower(split_part(coalesce(source_email, ''), '@', 1)), '[^a-z]', '', 'g') from 1 for 6);
  if char_length(email_prefix) between 3 and 6 then
    return email_prefix;
  end if;

  name_prefix := substring(regexp_replace(lower(coalesce(source_name, '')), '[^a-z]', '', 'g') from 1 for 6);
  if char_length(name_prefix) between 3 and 6 then
    return name_prefix;
  end if;

  return 'usr';
end;
$$;

create or replace function generate_unique_user_code(source_email text, source_name text, current_user_id uuid default null)
returns text language plpgsql as $$
declare
  prefix text := user_code_prefix(source_email, source_name);
  candidate text;
begin
  loop
    candidate := prefix || (floor(random() * 999999)::int + 1)::text;

    exit when not exists (
      select 1
      from users
      where user_code = candidate
        and (current_user_id is null or id <> current_user_id)
    );
  end loop;

  return candidate;
end;
$$;

create or replace function assign_user_code()
returns trigger language plpgsql as $$
begin
  if new.user_code is null or new.user_code !~ '^[a-z]{3,6}[0-9]{1,6}$' then
    new.user_code := generate_unique_user_code(new.email, new.name, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists users_assign_user_code on users;
create trigger users_assign_user_code
  before insert or update of email, name, user_code on users
  for each row
  execute function assign_user_code();

update users
set email = auth_users.email
from auth.users as auth_users
where users.id = auth_users.id
  and users.email is null;

update users
set user_code = generate_unique_user_code(email, name, id)
where user_code is null
   or user_code !~ '^[a-z]{3,6}[0-9]{1,6}$';

create or replace function create_public_user_profile()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, name, role, email, user_code)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1), 'WithJP User'),
    'ops',
    new.email,
    generate_unique_user_code(new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.id)
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists auth_users_create_public_profile on auth.users;
create trigger auth_users_create_public_profile
  after insert on auth.users
  for each row
  execute function create_public_user_profile();
