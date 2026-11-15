create index notification_jobs_user on public.notification_jobs(user_id);
create or replace function public.award_achievements(uid uuid) returns void language plpgsql security definer set search_path='' as $$
declare current_chapter text; checked int;
begin
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
