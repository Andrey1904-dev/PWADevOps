alter table public.schedule_settings alter column first_shift set default '2026-11-17'::date;
update public.schedule_settings set first_shift='2026-11-17' where first_shift is null;
update public.schedule_settings set work_minutes=35 where work_minutes=40;
update public.profiles set state=jsonb_set(state,'{settings,anchor}','"2026-11-17"'::jsonb),version=version+1,updated_at=now() where jsonb_typeof(state->'settings')='object' and coalesce(state#>>'{settings,anchor}','')='';
update public.profiles set state=jsonb_set(state,'{settings,work}','35'::jsonb),version=version+1,updated_at=now() where state#>>'{settings,work}'='40';
