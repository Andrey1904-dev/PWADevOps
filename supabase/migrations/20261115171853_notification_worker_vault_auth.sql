create table public.notification_worker_credentials(token_hash text primary key);
alter table public.notification_worker_credentials enable row level security;
revoke all on public.notification_worker_credentials from anon,authenticated;
create function public.authorize_notification_worker(hashed_token text) returns boolean language sql stable security invoker set search_path='' as $$ select exists(select 1 from public.notification_worker_credentials where token_hash=hashed_token) $$;
revoke all on function public.authorize_notification_worker(text) from public,anon,authenticated;
grant execute on function public.authorize_notification_worker(text) to service_role;
grant select on public.notification_worker_credentials to service_role;
