-- Fix activity trigger actor_type expressions so Postgres does not infer text
-- for CASE results inserted into activity_actor_type columns.

create or replace function record_activity() returns trigger
language plpgsql as $$
declare
  v_entity   activity_entity := tg_argv[0]::activity_entity;
  v_action   activity_action;
  v_actor_id uuid;
  v_diff     jsonb;
  v_before   jsonb;
  v_after    jsonb;
begin
  begin
    v_actor_id := auth.uid();
  exception when others then
    v_actor_id := null;
  end;

  if tg_op = 'INSERT' then
    v_action := 'create';
    v_after  := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
    v_before := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);

    if v_after ? 'status' and v_before ? 'status'
       and v_before->>'status' is distinct from v_after->>'status' then
      v_action := 'status_change';
    else
      v_action := 'update';
    end if;

    select jsonb_object_agg(
             key,
             jsonb_build_object('before', v_before -> key, 'after', v_after -> key)
           )
      into v_diff
      from (
        select key
        from jsonb_object_keys(v_after) as key
        where v_after -> key is distinct from v_before -> key
      ) changed_keys;
  end if;

  insert into activity_events (
    actor_type, actor_user_id,
    entity_type, entity_id, action,
    before, after, diff
  ) values (
    case
      when v_actor_id is not null then 'user'::activity_actor_type
      else 'system'::activity_actor_type
    end,
    v_actor_id,
    v_entity,
    coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid),
    v_action,
    v_before,
    v_after,
    v_diff
  );

  return coalesce(new, old);
end$$;

create or replace function record_message_activity() returns trigger
language plpgsql as $$
declare
  v_actor_id uuid;
  v_action   activity_action;
begin
  begin
    v_actor_id := auth.uid();
  exception when others then
    v_actor_id := null;
  end;

  v_action := case
    when new.sender_type = 'user'  then 'message_sent'
    when new.sender_type = 'agent' then 'message_received'
    else 'message_sent'
  end;

  insert into activity_events (
    actor_type,
    actor_user_id,
    actor_agent_id,
    entity_type, entity_id, action,
    content, context
  ) values (
    case
      when new.sender_type = 'agent' then 'agent'::activity_actor_type
      when v_actor_id is not null    then 'user'::activity_actor_type
      else 'system'::activity_actor_type
    end,
    v_actor_id,
    new.agent_id,
    'conversation',
    new.conversation_id,
    v_action,
    new.content,
    jsonb_build_object('message_id', new.id)
  );

  return new;
end$$;
