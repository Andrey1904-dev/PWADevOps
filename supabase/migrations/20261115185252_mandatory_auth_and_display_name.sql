alter table public.profiles add column display_name text not null default 'Инженер' check(char_length(display_name) between 2 and 40);
-- Session existence is checked for PWA JWTs too: sign-out invalidates RLS access immediately.
create or replace function quest_private.session_allowed() returns boolean language plpgsql stable security definer set search_path='' as $$
declare sid uuid; uid uuid:=auth.uid(); mini public.mini_app_sessions%rowtype;
begin
 if uid is null then return false;end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=uid) then return false;end if;
 select * into mini from public.mini_app_sessions where session_id=sid;
 if not found then return true;end if;
 return mini.user_id=uid and exists(select 1 from public.telegram_connections where user_id=uid and chat_id=mini.chat_id and connection_id=mini.connection_id and not blocked);
end; $$;
create function quest_private.profile_after_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare chosen text;
begin
 chosen:=left(btrim(coalesce(new.raw_user_meta_data->>'display_name','')),40);
 if char_length(chosen)<2 then chosen:='Инженер';end if;
 insert into public.profiles(id,display_name) values(new.id,chosen) on conflict(id) do nothing;return new;
end; $$;
revoke all on function quest_private.profile_after_signup() from public,anon,authenticated;
create trigger devops_profile_after_signup after insert on auth.users for each row execute function quest_private.profile_after_signup();
create or replace function public.ensure_profile() returns void language plpgsql security definer set search_path='' as $$
declare chosen text;
begin
 if auth.uid() is null or not quest_private.session_allowed() then raise exception 'Authentication required';end if;
 chosen:=left(btrim(coalesce(auth.jwt()->'user_metadata'->>'display_name','')),40);if char_length(chosen)<2 then chosen:='Инженер';end if;
 insert into public.profiles(id,display_name) values(auth.uid(),chosen) on conflict do nothing;
 insert into public.schedule_settings(user_id) values(auth.uid()) on conflict do nothing;
 insert into public.notification_settings(user_id) values(auth.uid()) on conflict do nothing;
end; $$;
