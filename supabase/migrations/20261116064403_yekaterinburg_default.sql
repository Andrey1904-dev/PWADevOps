-- Defaults apply only to future profiles. Existing settings and progress are untouched.
alter table public.profiles alter column state set default '{"current":"1-18","progress":{},"sessions":[],"active":null,"timerSeconds":0,"settings":{"anchor":"2026-11-17","timezone":"Asia/Yekaterinburg","work":35,"rest":150,"heavy":12,"paused":false,"reminders":false,"weekdays":[0,1,2,3,4,5,6],"weeklyGoal":660,"quietStart":"22:00","quietEnd":"08:00","workTimes":"09:00,13:00,18:00,21:30","restTimes":"09:00,13:00,18:00,21:30","workWindowStart":"","workWindowEnd":"","shiftOverrides":{},"categories":{"daily":true,"weekly":true,"review":true,"checkpoint":true,"return":true,"boss":true,"chapter":true}}}'::jsonb;

create or replace function public.ensure_profile() returns void language plpgsql security definer set search_path='' as $$
declare chosen text;
begin
 if auth.uid() is null or not quest_private.session_allowed() then raise exception 'Authentication required';end if;
 chosen:=left(btrim(coalesce(auth.jwt()->'user_metadata'->>'display_name','')),40);if char_length(chosen)<2 then chosen:='Инженер';end if;
 insert into public.profiles(id,display_name) values(auth.uid(),chosen) on conflict do nothing;
 -- Copy the profile choice, including NULL for legacy profiles without a timezone.
 insert into public.schedule_settings(user_id,timezone)
 select id,nullif(state#>>'{settings,timezone}','') from public.profiles where id=auth.uid()
 on conflict do nothing;
 insert into public.notification_settings(user_id) values(auth.uid()) on conflict do nothing;
end; $$;
