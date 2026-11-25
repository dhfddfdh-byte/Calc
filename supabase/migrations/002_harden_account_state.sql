begin;
create schema calc_private;
revoke all on schema calc_private from public, anon, authenticated;
grant usage on schema calc_private to authenticated;
create or replace function calc_private.save_state(expected_revision bigint, new_payload jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); next_revision bigint; field record; current_revision bigint; last_saved timestamptz;
begin
 if actor is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'Authentication required'; end if;
 if expected_revision is null or expected_revision<0 or new_payload is null or jsonb_typeof(new_payload)<>'object' or octet_length(new_payload::text)>2097152 or new_payload->'schema' is distinct from '1'::jsonb or jsonb_typeof(new_payload->'state') is distinct from 'object' or (new_payload - 'schema' - 'state') <> '{}'::jsonb then raise exception 'Invalid state'; end if;
 for field in select key,value from jsonb_each(new_payload->'state') loop
  if field.key not in ('tradeData','lockedPets','tradeBoardTrades','tb_pending','tb_completed','appTheme','calc_tracker_settings') or jsonb_typeof(field.value)<>'string' then raise exception 'Invalid backup field'; end if;
  if field.key='appTheme' then
    if (field.value #>> '{}') not in ('dark','elve') then raise exception 'Invalid theme'; end if;
  elsif jsonb_typeof((field.value #>> '{}')::jsonb) is distinct from (case when field.key in ('tradeData','calc_tracker_settings') then 'object' else 'array' end) then raise exception 'Invalid backup field type'; end if;
 end loop;
 insert into public.account_state(user_id) values(actor) on conflict do nothing;
 select revision,updated_at into current_revision,last_saved from public.account_state where user_id=actor for update;
 if current_revision is distinct from expected_revision then raise exception 'Revision conflict'; end if;
 if current_revision>0 and last_saved>clock_timestamp()-interval '2 seconds' then raise exception 'Save rate limited; retry later'; end if;
 update public.account_state set payload=new_payload,revision=revision+1,updated_at=clock_timestamp() where user_id=actor returning revision into next_revision;
 return next_revision;
end $$;
revoke all on function calc_private.save_state(bigint,jsonb) from public, anon, authenticated;
grant execute on function calc_private.save_state(bigint,jsonb) to authenticated;
create or replace function public.save_account_state(expected_revision bigint,new_payload jsonb)
returns bigint language sql security invoker set search_path='' as $$
 select calc_private.save_state(expected_revision,new_payload)
$$;
revoke all on function public.save_account_state(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.save_account_state(bigint,jsonb) to authenticated;
alter policy read_own_state on public.account_state using ((select auth.uid())=user_id and coalesce((select auth.jwt())->>'is_anonymous','false')<>'true');
commit;