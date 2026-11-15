alter table public.notification_settings alter column work_times set default array['09:00','13:00','18:00','21:30'];
alter table public.notification_settings alter column rest_times set default array['09:00','13:00','18:00','21:30'];
update public.notification_settings set work_times=array['09:00','13:00','18:00','21:30'] where work_times=array['09:00','19:30','21:30'];
update public.notification_settings set rest_times=array['09:00','13:00','18:00','21:30'] where rest_times=array['10:00','14:00','19:00','21:30'];
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
 update public.profiles set state=st,version=v+1,updated_at=now() where id=uid;
 perform public.award_achievements(uid);
 insert into public.operations values(operation_id,uid,v+1,now());
 return jsonb_build_object('version',v+1);
end; $$;
revoke all on function public.apply_operation(uuid,bigint,text,jsonb) from public,anon; grant execute on function public.apply_operation(uuid,bigint,text,jsonb) to authenticated;
