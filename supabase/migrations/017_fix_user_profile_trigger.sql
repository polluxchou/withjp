-- Fix create_public_user_profile: cast varchar to text and pin search_path for security definer
create or replace function create_public_user_profile()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, role, email, user_code)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1), 'WithJP User'),
    'ops',
    new.email,
    public.generate_unique_user_code(new.email::text, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.id)
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;
