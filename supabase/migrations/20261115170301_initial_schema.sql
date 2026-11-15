create table public.profiles(id uuid primary key references auth.users on delete cascade, state jsonb not null default '{}'::jsonb, version bigint not null default 0, updated_at timestamptz not null default now());
create table public.learning_tracks(id uuid primary key default gen_random_uuid(), title text not null);
create table public.chapters(id text primary key, track_id uuid references public.learning_tracks on delete cascade, title text not null, planned_month date, criteria text not null, boss text not null);
create table public.missions(id text primary key, chapter_id text not null references public.chapters on delete cascade, title text not null, task text not null, position int not null check(position>0), unique(chapter_id,position));
create table public.mission_progress(user_id uuid not null references public.profiles on delete cascade, mission_id text not null references public.missions, status text not null default 'not_started' check(status in ('not_started','in_progress','solved','verified')), note text not null default '', error text not null default '', github text not null default '', review text not null default '', primary key(user_id,mission_id));
create table public.study_sessions(id uuid primary key, user_id uuid not null references public.profiles on delete cascade, seconds int not null check(seconds between 0 and 86400), date date not null, note text not null default '');
create table public.schedule_settings(user_id uuid primary key references public.profiles on delete cascade, first_shift date, timezone text, work_minutes int not null default 40 check(work_minutes between 1 and 720), rest_minutes int not null default 150 check(rest_minutes between 1 and 720), heavy_minutes int not null default 12 check(heavy_minutes between 1 and 720), paused boolean not null default false);
create table public.notification_settings(user_id uuid primary key references public.profiles on delete cascade, enabled boolean not null default false, consent_at timestamptz, quiet_start time not null default '22:00', quiet_end time not null default '08:00', work_times text[] not null default array['09:00','19:30','21:30'], rest_times text[] not null default array['10:00','14:00','19:00','21:30'], categories jsonb not null default '{"daily":true,"weekly":true,"review":true,"checkpoint":true,"return":true,"boss":true,"chapter":true}');
create table public.achievements(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade, code text not null, earned_at timestamptz not null default now(), unique(user_id,code));
create table public.telegram_connections(user_id uuid primary key references public.profiles on delete cascade, chat_id bigint unique not null, blocked boolean not null default false, connected_at timestamptz not null default now());
create table public.telegram_link_tokens(token_hash text primary key, user_id uuid not null references public.profiles on delete cascade, expires_at timestamptz not null);
create table public.processed_updates(update_id bigint primary key, user_id uuid references public.profiles on delete cascade, processed_at timestamptz not null default now());
create table public.operations(id uuid primary key,user_id uuid not null references public.profiles on delete cascade, result_version bigint not null, created_at timestamptz not null default now());
create table public.notification_jobs(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,dedupe_key text not null unique,category text not null default 'daily',due_at timestamptz not null,expires_at timestamptz not null,status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')), attempts int not null default 0, next_attempt_at timestamptz not null default now(), payload jsonb not null default '{}');
create table public.notification_delivery_log(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,job_id uuid not null references public.notification_jobs on delete cascade, delivered_at timestamptz not null default now(),result text not null);
create index notification_due on public.notification_jobs(status,next_attempt_at,due_at);
create index sessions_user_date on public.study_sessions(user_id,date);
create index progress_mission on public.mission_progress(mission_id);
create index chapters_track on public.chapters(track_id);
create index log_job on public.notification_delivery_log(job_id);
create index log_user on public.notification_delivery_log(user_id);
create index operations_user on public.operations(user_id);
create index tokens_user on public.telegram_link_tokens(user_id);
alter table public.profiles enable row level security;
alter table public.learning_tracks enable row level security;
alter table public.chapters enable row level security;
alter table public.missions enable row level security;
alter table public.mission_progress enable row level security;
alter table public.study_sessions enable row level security;
alter table public.schedule_settings enable row level security;
alter table public.notification_settings enable row level security;
alter table public.achievements enable row level security;
alter table public.telegram_connections enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.notification_delivery_log enable row level security;
alter table public.operations enable row level security;
alter table public.telegram_link_tokens enable row level security;
alter table public.processed_updates enable row level security;
grant select on public.learning_tracks to authenticated; create policy catalog_read on public.learning_tracks for select to authenticated using(true);
grant select on public.chapters to authenticated; create policy catalog_read on public.chapters for select to authenticated using(true);
grant select on public.missions to authenticated; create policy catalog_read on public.missions for select to authenticated using(true);
grant select on public.mission_progress to authenticated; create policy own_read on public.mission_progress for select to authenticated using((select auth.uid())=user_id);
grant select on public.study_sessions to authenticated; create policy own_read on public.study_sessions for select to authenticated using((select auth.uid())=user_id);
grant select on public.schedule_settings to authenticated; create policy own_read on public.schedule_settings for select to authenticated using((select auth.uid())=user_id);
grant select on public.notification_settings to authenticated; create policy own_read on public.notification_settings for select to authenticated using((select auth.uid())=user_id);
grant select on public.achievements to authenticated; create policy own_read on public.achievements for select to authenticated using((select auth.uid())=user_id);
grant select on public.telegram_connections to authenticated; create policy own_read on public.telegram_connections for select to authenticated using((select auth.uid())=user_id);
grant select on public.notification_jobs to authenticated; create policy own_read on public.notification_jobs for select to authenticated using((select auth.uid())=user_id);
grant select on public.notification_delivery_log to authenticated; create policy own_read on public.notification_delivery_log for select to authenticated using((select auth.uid())=user_id);
grant select on public.operations to authenticated; create policy own_read on public.operations for select to authenticated using((select auth.uid())=user_id);
grant select on public.profiles to authenticated; create policy own_read on public.profiles for select to authenticated using((select auth.uid())=id);

create function public.award_achievements(uid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.study_sessions where user_id=uid) then insert into public.achievements(user_id,code) values(uid,'first_session') on conflict do nothing; end if;
 if exists(select 1 from public.mission_progress where user_id=uid and status='verified') then insert into public.achievements(user_id,code) values(uid,'first_verified') on conflict do nothing; end if;
 if exists(select 1 from public.mission_progress p join public.missions m on m.id=p.mission_id where p.user_id=uid and p.status='verified' and m.position=20) then insert into public.achievements(user_id,code) values(uid,'first_boss') on conflict do nothing; end if;
end; $$;
revoke all on function public.award_achievements(uuid) from public,anon,authenticated;
create function public.ensure_profile() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
 insert into public.schedule_settings(user_id) values(auth.uid()) on conflict do nothing;
 insert into public.notification_settings(user_id) values(auth.uid()) on conflict do nothing;
end; $$;
revoke all on function public.ensure_profile() from public,anon; grant execute on function public.ensure_profile() to authenticated;
create function public.apply_operation(operation_id uuid, expected_version bigint, operation_kind text, body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if exists(select 1 from unnest(string_to_array(coalesce(st#>>'{settings,workTimes}','09:00,19:30,21:30'),',')||string_to_array(coalesce(st#>>'{settings,restTimes}','10:00,14:00,19:00,21:30'),',')) t where t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid reminder time'; end if;
 update public.notification_settings set enabled=coalesce((st#>>'{settings,reminders}')::boolean,false),consent_at=case when (st#>>'{settings,reminders}')::boolean then coalesce(consent_at,now()) else consent_at end,quiet_start=coalesce((st#>>'{settings,quietStart}')::time,'22:00'),quiet_end=coalesce((st#>>'{settings,quietEnd}')::time,'08:00'),work_times=string_to_array(coalesce(st#>>'{settings,workTimes}','09:00,19:30,21:30'),','),rest_times=string_to_array(coalesce(st#>>'{settings,restTimes}','10:00,14:00,19:00,21:30'),','),categories=coalesce(st#>'{settings,categories}',categories) where user_id=uid;
 update public.profiles set state=st,version=v+1,updated_at=now() where id=uid;
 perform public.award_achievements(uid);
 insert into public.operations values(operation_id,uid,v+1,now());
 return jsonb_build_object('version',v+1);
end; $$;
revoke all on function public.apply_operation(uuid,bigint,text,jsonb) from public,anon; grant execute on function public.apply_operation(uuid,bigint,text,jsonb) to authenticated;
create function public.consume_link(hash text, telegram_chat bigint, update_number bigint) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 insert into public.processed_updates(update_id) values(update_number) on conflict do nothing;
 if not found then return false; end if;
 delete from public.telegram_link_tokens where token_hash=hash and expires_at>now() returning user_id into uid;
 if uid is null then return false; end if;
 insert into public.telegram_connections(user_id,chat_id) values(uid,telegram_chat) on conflict(user_id) do update set chat_id=excluded.chat_id,blocked=false;
 return true;
end; $$;
revoke all on function public.consume_link(text,bigint,bigint) from public,anon,authenticated;grant execute on function public.consume_link(text,bigint,bigint) to service_role;

create function public.bot_action(chat bigint,update_number bigint,action text,argument text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; st jsonb; previous_state jsonb; mid text; secs int; started bigint; stamp bigint:=(extract(epoch from clock_timestamp())*1000)::bigint; ns jsonb;
begin
 select user_id into uid from public.telegram_connections where chat_id=chat and not blocked;
 if uid is null then return jsonb_build_object('unlinked',true); end if;
 select state into st from public.profiles where id=uid for update;
 insert into public.processed_updates(update_id,user_id) values(update_number,uid) on conflict do nothing;
 if not found then return jsonb_build_object('duplicate',true); end if;
 if (select count(*) from public.processed_updates where user_id=uid and processed_at>now()-interval '1 minute')>30 then raise exception 'Rate limit'; end if;
 mid:=coalesce(st->>'current','1-18');
 if st='{}'::jsonb then st:='{"current":"1-18","progress":{},"sessions":[],"active":null,"settings":{"anchor":"","timezone":"","work":40,"rest":150,"heavy":12,"paused":false,"reminders":false}}'::jsonb; end if;
 previous_state:=st;
 if action='begin' and (st->>'active') is null and not coalesce((st#>>'{settings,paused}')::boolean,false) then st:=jsonb_set(st,'{active}',to_jsonb(stamp));
 elsif action='stop' and st->>'active' is not null then
 secs:=greatest(0,least(86400,coalesce((st->>'timerSeconds')::int,0)+((stamp-(st->>'active')::bigint)/1000)::int));st:=jsonb_set(st,'{timerSeconds}',to_jsonb(secs));st:=jsonb_set(st,'{active}','null');
 elsif action='done' and (st->>'active' is not null or coalesce((st->>'timerSeconds')::int,0)>0) then
 started:=coalesce((st->>'active')::bigint,stamp);secs:=greatest(0,least(86400,coalesce((st->>'timerSeconds')::int,0)+((stamp-started)/1000)::int));
 ns:=jsonb_build_object('id',gen_random_uuid(),'seconds',secs,'date',to_char(now() at time zone coalesce(nullif(st#>>'{settings,timezone}',''),'UTC'),'YYYY-MM-DD'),'note','Telegram');
 st:=jsonb_set(st,'{sessions}',coalesce(st->'sessions','[]')||jsonb_build_array(ns));st:=jsonb_set(st,'{active}','null');st:=jsonb_set(st,'{timerSeconds}','0');
 insert into public.study_sessions(id,user_id,seconds,date,note) values((ns->>'id')::uuid,uid,secs,(ns->>'date')::date,'Telegram');
 elsif action in ('pause','resume') then st:=jsonb_set(st,'{settings,paused}',to_jsonb(action='pause'));
 elsif action='note' then
 st:=jsonb_set(st,'{progress}',coalesce(st->'progress','{}')||jsonb_build_object(mid,coalesce(st#>array['progress',mid],'{"status":"not_started","error":"","github":"","review":""}')||jsonb_build_object('note',left(argument,4000))));
 elsif action='status' and argument in ('not_started','in_progress','solved','verified') then
 st:=jsonb_set(st,'{progress}',coalesce(st->'progress','{}')||jsonb_build_object(mid,coalesce(st#>array['progress',mid],'{"note":"","error":"","github":"","review":""}')||jsonb_build_object('status',argument)));
 elsif action='schedule' and argument ~ '^\d{4}-\d{2}-\d{2}$' then
 st:=jsonb_set(st,'{settings,anchor}',to_jsonb(argument));update public.schedule_settings set first_shift=argument::date where user_id=uid;
 elsif action='rest' then
 st:=jsonb_set(st,'{restDate}',to_jsonb(to_char(now() at time zone coalesce(nullif(st#>>'{settings,timezone}',''),'UTC'),'YYYY-MM-DD')));
 elsif action='snooze' then
 insert into public.notification_jobs(user_id,dedupe_key,due_at,expires_at,payload) values(uid,uid::text||':snooze:'||update_number::text,now()+interval '30 minutes',now()+interval '35 minutes',jsonb_build_object('text','DEVOPS QUEST: отложенное напоминание. Можно выбрать лёгкую практику.'));
 elsif action='reminders' then
 if argument='on' and coalesce(st#>>'{settings,timezone}','')<>'' and coalesce(st#>>'{settings,anchor}','')<>'' then st:=jsonb_set(st,'{settings,reminders}','true');update public.notification_settings set enabled=true,consent_at=now() where user_id=uid;
 elsif argument='off' then st:=jsonb_set(st,'{settings,reminders}','false');update public.notification_settings set enabled=false where user_id=uid;end if;
 end if;
 if st=previous_state and action not in ('reminders','snooze') then return st; end if;
 if st#>array['progress',mid] is not null then
 insert into public.mission_progress(user_id,mission_id,status,note,error,github,review) values(uid,mid,st#>>array['progress',mid,'status'],coalesce(st#>>array['progress',mid,'note'],''),coalesce(st#>>array['progress',mid,'error'],''),coalesce(st#>>array['progress',mid,'github'],''),coalesce(st#>>array['progress',mid,'review'],'')) on conflict(user_id,mission_id) do update set status=excluded.status,note=excluded.note,error=excluded.error,github=excluded.github,review=excluded.review;
 end if;
 update public.profiles set state=st,version=version+1,updated_at=now() where id=uid;
 update public.schedule_settings set paused=coalesce((st#>>'{settings,paused}')::boolean,false) where user_id=uid;
 perform public.award_achievements(uid);
 return st;
end; $$;
revoke all on function public.bot_action(bigint,bigint,text,text) from public,anon,authenticated;grant execute on function public.bot_action(bigint,bigint,text,text) to service_role;
create function public.claim_notification(job uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.notification_jobs set status='sending',attempts=attempts+1 where id=job and status='pending' and next_attempt_at<=now() and expires_at>now();return found;
end; $$;
revoke all on function public.claim_notification(uuid) from public,anon,authenticated;grant execute on function public.claim_notification(uuid) to service_role;

create index processed_user_time on public.processed_updates(user_id,processed_at);
create function public.create_link_token(uid uuid, hashed_token text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=uid for update;
 if not found then return false; end if;
 if exists(select 1 from public.telegram_link_tokens where user_id=uid and expires_at>now()+interval '9 minutes') then return false; end if;
 delete from public.telegram_link_tokens where user_id=uid;
 insert into public.telegram_link_tokens(token_hash,user_id,expires_at) values(hashed_token,uid,now()+interval '10 minutes');
 return true;
end; $$;
revoke all on function public.create_link_token(uuid,text) from public,anon,authenticated;grant execute on function public.create_link_token(uuid,text) to service_role;
