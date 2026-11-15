create schema if not exists quest_private;
alter table public.telegram_connections add column connection_id uuid not null default gen_random_uuid();create unique index telegram_connection_generation on public.telegram_connections(connection_id);
create table public.mini_app_sessions(session_id uuid primary key,user_id uuid not null references public.profiles on delete cascade,chat_id bigint not null,connection_id uuid not null,created_at timestamptz not null default now());
alter table public.mini_app_sessions enable row level security;revoke all on public.mini_app_sessions from anon,authenticated;create policy no_client on public.mini_app_sessions for all to anon,authenticated using(false) with check(false);create index mini_sessions_user on public.mini_app_sessions(user_id);
create function quest_private.session_allowed() returns boolean language plpgsql stable security definer set search_path='' as $$
declare sid uuid; uid uuid:=auth.uid(); mini public.mini_app_sessions%rowtype;
begin
 if uid is null then return false;end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 select * into mini from public.mini_app_sessions where session_id=sid;
 if not found then return true;end if;
 return mini.user_id=uid and exists(select 1 from public.telegram_connections where user_id=uid and chat_id=mini.chat_id and connection_id=mini.connection_id and not blocked);
end; $$;revoke all on function quest_private.session_allowed() from public,anon;grant usage on schema quest_private to authenticated;grant execute on function quest_private.session_allowed() to authenticated;
create function public.mini_session_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 return jsonb_build_object('mini',exists(select 1 from public.mini_app_sessions where session_id=nullif(auth.jwt()->>'session_id','')::uuid and user_id=auth.uid()),'allowed',quest_private.session_allowed());
end; $$;revoke all on function public.mini_session_status() from public,anon;grant execute on function public.mini_session_status() to authenticated;
create function public.register_mini_app_session(auth_session uuid,profile_id uuid,telegram_chat bigint,generation uuid) returns boolean language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.telegram_connections where user_id=profile_id and chat_id=telegram_chat and connection_id=generation and not blocked for share;if not found then return false;end if;
 insert into public.mini_app_sessions(session_id,user_id,chat_id,connection_id) values(auth_session,profile_id,telegram_chat,generation) on conflict do nothing;return true;
end; $$;revoke all on function public.register_mini_app_session(uuid,uuid,bigint,uuid) from public,anon,authenticated;grant execute on function public.register_mini_app_session(uuid,uuid,bigint,uuid) to service_role;
create function public.revoke_telegram_link() returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not quest_private.session_allowed() then raise exception 'Session revoked';end if;
 delete from public.telegram_connections where user_id=auth.uid();
 update public.profiles set state=jsonb_set(state,'{settings,reminders}','false'::jsonb),version=version+1,updated_at=now() where id=auth.uid();
 update public.notification_settings set enabled=false where user_id=auth.uid();
 update public.notification_jobs set status='cancelled' where user_id=auth.uid() and status='pending';
end; $$;revoke all on function public.revoke_telegram_link() from public,anon;grant execute on function public.revoke_telegram_link() to authenticated;
drop policy own_read on public.profiles;create policy own_read on public.profiles for select to authenticated using((select auth.uid())=id and (select quest_private.session_allowed()));
drop policy own_read on public.mission_progress;create policy own_read on public.mission_progress for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_read on public.study_sessions;create policy own_read on public.study_sessions for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_read on public.schedule_settings;create policy own_read on public.schedule_settings for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_read on public.notification_settings;create policy own_read on public.notification_settings for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_read on public.achievements;create policy own_read on public.achievements for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_read on public.telegram_connections;create policy own_read on public.telegram_connections for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_read on public.notification_jobs;create policy own_read on public.notification_jobs for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_read on public.notification_delivery_log;create policy own_read on public.notification_delivery_log for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_read on public.operations;create policy own_read on public.operations for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_rewards on public.reward_events;create policy own_rewards on public.reward_events for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy own_history on public.mission_history;create policy own_history on public.mission_history for select to authenticated using((select auth.uid())=user_id and (select quest_private.session_allowed()));
drop policy catalog_read on public.learning_tracks;create policy catalog_read on public.learning_tracks for select to authenticated using((select quest_private.session_allowed()));
drop policy catalog_read on public.chapters;create policy catalog_read on public.chapters for select to authenticated using((select quest_private.session_allowed()));
drop policy catalog_read on public.missions;create policy catalog_read on public.missions for select to authenticated using((select quest_private.session_allowed()));
create or replace function public.ensure_profile() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not quest_private.session_allowed() then raise exception 'Authentication required'; end if;
 insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
 insert into public.schedule_settings(user_id) values(auth.uid()) on conflict do nothing;
 insert into public.notification_settings(user_id) values(auth.uid()) on conflict do nothing;
end; $$;
revoke all on function public.ensure_profile() from public,anon; grant execute on function public.ensure_profile() to authenticated;
create or replace function public.apply_operation(operation_id uuid, expected_version bigint, operation_kind text, body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); v bigint; st jsonb; item record;
begin
 if uid is null or not quest_private.session_allowed() then raise exception 'Authentication required'; end if;
 perform public.ensure_profile();
 select version into v from public.profiles where id=uid for update;
 if exists(select 1 from public.operations where id=operation_id and user_id=uid) then return jsonb_build_object('version',v); end if;
 if v<>expected_version then return jsonb_build_object('conflict',true,'version',v); end if;
 if operation_kind not in ('progress','session','settings') or jsonb_typeof(body->'state')<>'object' or pg_column_size(body)>1000000 then raise exception 'Invalid operation'; end if;
 st:=body->'state';
 if jsonb_typeof(st->'sessions')<>'array' or jsonb_typeof(st->'progress')<>'object' then raise exception 'Invalid state'; end if;
 if coalesce(st#>>'{settings,timezone}','')<>'' and not exists(select 1 from pg_timezone_names where name=st#>>'{settings,timezone}') then raise exception 'Invalid timezone'; end if;
 for item in select key,value from jsonb_each(st->'progress') loop
 insert into public.mission_progress(user_id,mission_id,status,note,error,github,review) values(uid,item.key,item.value->>'status',coalesce(item.value->>'note',''),coalesce(item.value->>'error',''),coalesce(item.value->>'github',''),coalesce(item.value->>'review','')) on conflict(user_id,mission_id) do update set status=excluded.status,note=excluded.note,error=excluded.error,github=excluded.github,review=excluded.review;
 end loop;
 for item in select value from jsonb_array_elements(st->'sessions') loop
 if exists(select 1 from public.study_sessions where id=(item.value->>'id')::uuid and user_id<>uid) then raise exception 'Session identifier conflict'; end if;
 insert into public.study_sessions(id,user_id,seconds,date,note) values((item.value->>'id')::uuid,uid,(item.value->>'seconds')::int,(item.value->>'date')::date,coalesce(item.value->>'note','')) on conflict(id) do update set seconds=excluded.seconds,date=excluded.date,note=excluded.note where public.study_sessions.user_id=uid;
 end loop;
 update public.schedule_settings set first_shift=nullif(st#>>'{settings,anchor}','')::date,timezone=nullif(st#>>'{settings,timezone}',''),work_minutes=(st#>>'{settings,work}')::int,rest_minutes=(st#>>'{settings,rest}')::int,heavy_minutes=(st#>>'{settings,heavy}')::int,paused=(st#>>'{settings,paused}')::boolean where user_id=uid;
 if coalesce((st#>>'{settings,reminders}')::boolean,false) and not exists(select 1 from public.telegram_connections where user_id=uid and not blocked) then raise exception 'Link Telegram before enabling reminders'; end if;
 if exists(select 1 from unnest(string_to_array(coalesce(st#>>'{settings,workTimes}','09:00,13:00,18:00,21:30'),',')||string_to_array(coalesce(st#>>'{settings,restTimes}','09:00,13:00,18:00,21:30'),',')) t where t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid reminder time'; end if;
 update public.notification_settings set enabled=coalesce((st#>>'{settings,reminders}')::boolean,false),consent_at=case when (st#>>'{settings,reminders}')::boolean then coalesce(consent_at,now()) else consent_at end,quiet_start=coalesce((st#>>'{settings,quietStart}')::time,'22:00'),quiet_end=coalesce((st#>>'{settings,quietEnd}')::time,'08:00'),work_times=string_to_array(coalesce(st#>>'{settings,workTimes}','09:00,13:00,18:00,21:30'),','),rest_times=string_to_array(coalesce(st#>>'{settings,restTimes}','09:00,13:00,18:00,21:30'),','),categories=coalesce(st#>'{settings,categories}',categories) where user_id=uid;
 if st#>'{settings,weekdays}' is not null then update public.notification_settings set weekdays=coalesce((select array_agg(value::int) from jsonb_array_elements_text(st#>'{settings,weekdays}')),'{}'::int[]) where user_id=uid;end if;
 update public.profiles set state=st,version=v+1,updated_at=now() where id=uid;
 perform public.award_achievements(uid);
 insert into public.operations values(operation_id,uid,v+1,now());
 return jsonb_build_object('version',v+1);
end; $$;
revoke all on function public.apply_operation(uuid,bigint,text,jsonb) from public,anon; grant execute on function public.apply_operation(uuid,bigint,text,jsonb) to authenticated;

