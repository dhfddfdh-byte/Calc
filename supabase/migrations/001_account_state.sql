-- Draft Supabase migration. Apply to a test project and verify RLS before production.
begin;
create table public.account_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=2097152),
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default now()
);
alter table public.account_state enable row level security;
revoke all on public.account_state from anon, authenticated;
grant select on public.account_state to authenticated;
create policy read_own_state on public.account_state for select to authenticated using ((select auth.uid())=user_id);

create function public.save_account_state(expected_revision bigint, new_payload jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); next_revision bigint;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if expected_revision is null or expected_revision<0 or new_payload is null or jsonb_typeof(new_payload)<>'object' or octet_length(new_payload::text)>2097152 then raise exception 'Invalid state'; end if;
 insert into public.account_state(user_id) values(actor) on conflict do nothing;
 update public.account_state set payload=new_payload,revision=revision+1,updated_at=now() where user_id=actor and revision=expected_revision returning revision into next_revision;
 if next_revision is null then raise exception 'Revision conflict'; end if;
 return next_revision;
end $$;
revoke all on function public.save_account_state(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_account_state(bigint,jsonb) to authenticated;
-- Transfers intentionally disabled until consent workflow, payload validation,
-- expiration, rate limits, transactional application and replay tests exist.
commit;
