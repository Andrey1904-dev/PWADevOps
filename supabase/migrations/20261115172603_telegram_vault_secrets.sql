create function public.read_runtime_secret(secret_name text) returns text language sql stable security definer set search_path='' as $$ select decrypted_secret from vault.decrypted_secrets where name=secret_name and name in ('devops_quest_telegram_bot_token','devops_quest_telegram_webhook_secret','devops_quest_pwa_url') $$;
revoke all on function public.read_runtime_secret(text) from public,anon,authenticated;grant execute on function public.read_runtime_secret(text) to service_role;
create function public.store_runtime_secret(secret_name text, secret_value text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if secret_name not in ('devops_quest_telegram_bot_token','devops_quest_telegram_webhook_secret','devops_quest_pwa_url') then raise exception 'Invalid secret name'; end if;
 select id into sid from vault.secrets where name=secret_name;
 if sid is null then perform vault.create_secret(secret_value,secret_name);else perform vault.update_secret(sid,secret_value);end if;
end; $$;
revoke all on function public.store_runtime_secret(text,text) from public,anon,authenticated;grant execute on function public.store_runtime_secret(text,text) to service_role;
