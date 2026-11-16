-- Additive, service-only handshake. Existing profiles/progress/connections are preserved.
alter table public.telegram_link_tokens add column pending_chat bigint;
alter table public.telegram_link_tokens add column consumed_at timestamptz;
alter table public.telegram_link_tokens add column outcome text check(outcome in ('linked','cancelled'));

create or replace function public.create_link_token(uid uuid, hashed_token text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=uid for update;
 if not found then return false; end if;
 if exists(select 1 from public.telegram_link_tokens where user_id=uid and consumed_at is null and expires_at>now()+interval '9 minutes') then return false; end if;
 delete from public.telegram_link_tokens where user_id=uid;
 insert into public.telegram_link_tokens(token_hash,user_id,expires_at) values(hashed_token,uid,now()+interval '10 minutes');
 return true;
end; $$;

create function public.telegram_link_step(hash text, telegram_chat bigint, step text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; t public.telegram_link_tokens%rowtype; linked boolean;
begin
 if telegram_chat<=0 or step not in ('prepare','confirm','cancel') then return jsonb_build_object('code','INVALID_REQUEST');end if;
 select user_id into uid from public.telegram_link_tokens where token_hash=hash;
 if uid is null then return jsonb_build_object('code','LINK_INVALID_OR_EXPIRED');end if;
 -- Same lock order as the existing Mini App linker and token issuer.
 perform pg_advisory_xact_lock(telegram_chat);
 perform 1 from public.profiles where id=uid for update;
 select * into t from public.telegram_link_tokens where token_hash=hash and user_id=uid for update;
 if not found or t.expires_at<=now() then return jsonb_build_object('code','LINK_INVALID_OR_EXPIRED');end if;
 if t.pending_chat is not null and t.pending_chat<>telegram_chat then return jsonb_build_object('code','LINK_CLAIMED');end if;
 if t.consumed_at is not null then
   if t.outcome='linked' and exists(select 1 from public.telegram_connections where user_id=uid and chat_id=telegram_chat and not blocked) then return jsonb_build_object('code','ALREADY_LINKED');end if;
   return jsonb_build_object('code','LINK_USED');
 end if;
 if exists(select 1 from public.telegram_connections where (chat_id=telegram_chat and user_id<>uid) or (user_id=uid and chat_id<>telegram_chat)) then return jsonb_build_object('code','ACCOUNT_ALREADY_LINKED');end if;
 if step='prepare' then
   update public.telegram_link_tokens set pending_chat=telegram_chat where token_hash=hash;
   return jsonb_build_object('code','CONFIRM_REQUIRED');
 end if;
 if t.pending_chat is null then return jsonb_build_object('code','CONFIRM_REQUIRED');end if;
 if step='cancel' then
   update public.telegram_link_tokens set consumed_at=now(),outcome='cancelled' where token_hash=hash;
   return jsonb_build_object('code','CANCELLED');
 end if;
 select public.link_mini_app(uid,telegram_chat) into linked;
 if not linked then return jsonb_build_object('code','ACCOUNT_ALREADY_LINKED');end if;
 update public.telegram_link_tokens set consumed_at=now(),outcome='linked' where token_hash=hash;
 return jsonb_build_object('code','LINKED');
end; $$;
revoke all on function public.telegram_link_step(text,bigint,text) from public,anon,authenticated;
grant execute on function public.telegram_link_step(text,bigint,text) to service_role;
-- Keep the legacy signature but never silently attach on /start anymore.
create or replace function public.consume_link(hash text, telegram_chat bigint, update_number bigint) returns boolean language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.telegram_link_step(hash,telegram_chat,'confirm');
 return result->>'code' in ('LINKED','ALREADY_LINKED');
end; $$;

create or replace function public.revoke_telegram_link() returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not quest_private.session_allowed() then raise exception 'Session revoked';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 delete from public.telegram_link_tokens where user_id=auth.uid();
 delete from public.telegram_connections where user_id=auth.uid();
 update public.profiles set state=jsonb_set(state,'{settings,reminders}','false'::jsonb),version=version+1,updated_at=now() where id=auth.uid();
 update public.notification_settings set enabled=false where user_id=auth.uid();
 update public.notification_jobs set status='cancelled' where user_id=auth.uid() and status='pending';
end; $$;
