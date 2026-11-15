create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$
declare worker_secret text;
begin
 if not exists(select 1 from vault.secrets where name='devops_quest_cron_secret') then
 perform vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'devops_quest_cron_secret');
 end if;
 if not exists(select 1 from vault.secrets where name='devops_quest_project_url') then
 perform vault.create_secret('https://okswmvxxoataxprjwzjv.supabase.co','devops_quest_project_url');
 end if;
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='devops_quest_cron_secret';
 insert into public.notification_worker_credentials(token_hash) values(encode(sha256(convert_to(worker_secret,'UTF8')),'hex')) on conflict do nothing;
end $$;
-- Apply ONLY to the dedicated project after functions and Vault secrets exist.
-- Enable pg_cron and pg_net in Dashboard first. Create Vault secrets via secure UI:
-- devops_quest_project_url and devops_quest_cron_secret. Never commit their values.
do $$ begin
 if exists(select 1 from cron.job where jobname='devops_quest_notifications') then
 perform cron.unschedule('devops_quest_notifications');
 end if;
end $$;
select cron.schedule('devops_quest_notifications','* * * * *', $job$
 select net.http_post(
 url := (select decrypted_secret from vault.decrypted_secrets where name='devops_quest_project_url') || '/functions/v1/notification-worker',
 headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='devops_quest_cron_secret')),
 body := '{}'::jsonb, timeout_milliseconds := 15000
 );
$job$);
