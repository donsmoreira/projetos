-- =========================================================================
-- Google Agenda: sincronização AUTOMÁTICA a cada 10 minutos
--
-- O agendador do banco (pg_cron) chama a função "google-calendar" a cada
-- 10 minutos, que envia as mudanças do Razão e traz as do Google de todas as
-- empresas conectadas, mesmo com ninguém usando o sistema.
--
-- A chamada é protegida por uma senha aleatória guardada no cofre do banco
-- (Vault); só a função do servidor consegue lê-la.
--
-- Rode DEPOIS de 20261117_google_agenda.sql.
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.
-- =========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------- Senha da chamada automática (no cofre) ----------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'google_calendar_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'google_calendar_cron_secret',
      'Senha da sincronização automática do Google Agenda'
    );
  end if;
end;
$$;

-- Só a função do servidor (chave secreta) lê a senha
create or replace function public.google_calendar_cron_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'google_calendar_cron_secret' limit 1;
$$;

revoke all on function public.google_calendar_cron_secret() from public, anon, authenticated;
grant execute on function public.google_calendar_cron_secret() to service_role;

-- ---------- Agendamento: a cada 10 minutos ----------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'google-calendar-sync') then
    perform cron.unschedule('google-calendar-sync');
  end if;
end;
$$;

select cron.schedule(
  'google-calendar-sync',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://usjcwqwpxjvtqnisdstg.supabase.co/functions/v1/google-calendar',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-razao-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'google_calendar_cron_secret' limit 1)
      ),
      body := '{"action":"cron_sync"}'::jsonb,
      timeout_milliseconds := 120000
    )
    -- só chama se alguma empresa tiver o Google conectado
    where exists (select 1 from public.google_calendar_connections);
  $job$
);

notify pgrst, 'reload schema';
