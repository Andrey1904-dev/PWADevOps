create table public.reward_events(user_id uuid not null references public.profiles on delete cascade,event_key text not null,mission_id text not null references public.missions,xp integer not null check(xp in (50,200)),created_at timestamptz not null default now(),primary key(user_id,event_key));
alter table public.reward_events enable row level security;revoke all on public.reward_events from anon,authenticated;grant select on public.reward_events to authenticated;create policy own_rewards on public.reward_events for select to authenticated using((select auth.uid())=user_id);create index reward_mission on public.reward_events(mission_id);
create table public.mini_app_auth_requests(init_hash text primary key,chat_id bigint not null,created_at timestamptz not null default now());alter table public.mini_app_auth_requests enable row level security;revoke all on public.mini_app_auth_requests from anon,authenticated;create policy no_client on public.mini_app_auth_requests for all to anon,authenticated using(false) with check(false);create index mini_app_chat_time on public.mini_app_auth_requests(chat_id,created_at);
create function public.consume_mini_app_auth(init_hash text,telegram_chat bigint) returns boolean language plpgsql security definer set search_path='' as $$ begin
 perform pg_advisory_xact_lock(telegram_chat);
 if(select count(*) from public.mini_app_auth_requests where chat_id=telegram_chat and created_at>now()-interval '1 minute')>=10 then return false;end if;
 insert into public.mini_app_auth_requests(init_hash,chat_id) values(init_hash,telegram_chat) on conflict do nothing;return found;
end; $$;revoke all on function public.consume_mini_app_auth(text,bigint) from public,anon,authenticated;grant execute on function public.consume_mini_app_auth(text,bigint) to service_role;
create function public.link_mini_app(profile_id uuid,telegram_chat bigint) returns boolean language plpgsql security definer set search_path='' as $$ begin
 perform pg_advisory_xact_lock(telegram_chat);perform 1 from public.profiles where id=profile_id for update;if not found then return false;end if;
 if exists(select 1 from public.telegram_connections where chat_id=telegram_chat and user_id<>profile_id) or exists(select 1 from public.telegram_connections where user_id=profile_id and chat_id<>telegram_chat) then return false;end if;
 insert into public.telegram_connections(user_id,chat_id) values(profile_id,telegram_chat) on conflict(user_id) do update set blocked=false;return true;
end; $$;revoke all on function public.link_mini_app(uuid,bigint) from public,anon,authenticated;grant execute on function public.link_mini_app(uuid,bigint) to service_role;
create or replace function public.award_achievements(uid uuid) returns void language plpgsql security definer set search_path='' as $$
declare current_chapter text; checked int;
begin
 insert into public.reward_events(user_id,event_key,mission_id,xp) select user_id,mission_id||':solved',mission_id,50 from public.mission_progress where user_id=uid and status in ('solved','verified') on conflict do nothing;
 insert into public.reward_events(user_id,event_key,mission_id,xp) select user_id,mission_id||':verified',mission_id,50 from public.mission_progress where user_id=uid and status='verified' on conflict do nothing;
 insert into public.reward_events(user_id,event_key,mission_id,xp) select p.user_id,p.mission_id||':boss',p.mission_id,200 from public.mission_progress p join public.missions m on m.id=p.mission_id where p.user_id=uid and p.status='verified' and m.position=20 on conflict do nothing;
 if exists(select 1 from public.study_sessions where user_id=uid) then insert into public.achievements(user_id,code) values(uid,'first_session') on conflict do nothing; end if;
 if exists(select 1 from public.mission_progress where user_id=uid and status='verified') then insert into public.achievements(user_id,code) values(uid,'first_verified') on conflict do nothing; end if;
 if exists(select 1 from public.mission_progress p join public.missions m on m.id=p.mission_id where p.user_id=uid and p.status='verified' and m.position=20) then insert into public.achievements(user_id,code) values(uid,'first_boss') on conflict do nothing; end if;
 if not exists(select 1 from public.notification_settings n join public.telegram_connections t on t.user_id=n.user_id where n.user_id=uid and n.enabled and n.consent_at is not null and not t.blocked) then return; end if;
 select split_part(state->>'current','-',1) into current_chapter from public.profiles where id=uid;
 select count(*) into checked from public.mission_progress p join public.missions m on m.id=p.mission_id where p.user_id=uid and p.status='verified' and m.chapter_id=current_chapter;
 if checked=19 and not exists(select 1 from public.mission_progress where user_id=uid and mission_id=current_chapter||'-20' and status='verified') then
 insert into public.notification_jobs(user_id,dedupe_key,category,due_at,expires_at,payload) values(uid,uid::text||':boss:'||current_chapter,'boss',now(),now()+interval '5 minutes',jsonb_build_object('text','DEVOPS QUEST: доступен финальный босс главы. Проверь свои навыки на практике.')) on conflict(dedupe_key) do nothing;
 elsif checked=20 then
 insert into public.notification_jobs(user_id,dedupe_key,category,due_at,expires_at,payload) values(uid,uid::text||':chapter:'||current_chapter,'chapter',now(),now()+interval '5 minutes',jsonb_build_object('text','DEVOPS QUEST: поздравляем, все миссии главы проверены!')) on conflict(dedupe_key) do nothing;
 end if;
end; $$;
revoke all on function public.award_achievements(uuid) from public,anon,authenticated;

-- Backfill rewards only; do not emit retrospective notifications.
insert into public.reward_events(user_id,event_key,mission_id,xp) select user_id,mission_id||':solved',mission_id,50 from public.mission_progress where status in ('solved','verified') on conflict do nothing;
insert into public.reward_events(user_id,event_key,mission_id,xp) select user_id,mission_id||':verified',mission_id,50 from public.mission_progress where status='verified' on conflict do nothing;
insert into public.reward_events(user_id,event_key,mission_id,xp) select p.user_id,p.mission_id||':boss',p.mission_id,200 from public.mission_progress p join public.missions m on m.id=p.mission_id where p.status='verified' and m.position=20 on conflict do nothing;
create function public.bot_action_guarded(chat bigint,update_number bigint,action text,argument text,target_mission text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; current_mission text;
begin
 select user_id into uid from public.telegram_connections where chat_id=chat and not blocked;if uid is null then return jsonb_build_object('unlinked',true);end if;
 select state->>'current' into current_mission from public.profiles where id=uid for update;
 if target_mission is not null and target_mission<>current_mission then return jsonb_build_object('stale_action',true);end if;
 return public.bot_action(chat,update_number,action,argument);
end; $$;revoke all on function public.bot_action_guarded(bigint,bigint,text,text,text) from public,anon,authenticated;grant execute on function public.bot_action_guarded(bigint,bigint,text,text,text) to service_role;
alter table public.notification_settings add column weekdays integer[] not null default array[0,1,2,3,4,5,6] check(weekdays <@ array[0,1,2,3,4,5,6] and cardinality(weekdays)<=7);
alter table public.schedule_settings alter column work_minutes set default 35;
create or replace function public.apply_operation(operation_id uuid, expected_version bigint, operation_kind text, body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); v bigint; st jsonb; item record;
begin
 if uid is null then raise exception 'Authentication required'; end if;
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

create table public.mission_history(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,mission_id text not null references public.missions,old_status text,new_status text not null,changed_at timestamptz not null default now());
alter table public.mission_history enable row level security;revoke all on public.mission_history from anon,authenticated;grant select on public.mission_history to authenticated;create policy own_history on public.mission_history for select to authenticated using((select auth.uid())=user_id);create index mission_history_user_time on public.mission_history(user_id,changed_at);create index mission_history_mission on public.mission_history(mission_id);
create function public.record_mission_history() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if tg_op='INSERT' then insert into public.mission_history(user_id,mission_id,new_status) values(new.user_id,new.mission_id,new.status);
 elsif new.status is distinct from old.status then insert into public.mission_history(user_id,mission_id,old_status,new_status) values(new.user_id,new.mission_id,old.status,new.status);end if;return new;
end; $$;revoke all on function public.record_mission_history() from public,anon,authenticated;
create trigger mission_history_event after insert or update of status on public.mission_progress for each row execute function public.record_mission_history();
