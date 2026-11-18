-- =========================================================================
-- Integração com o Google Agenda (nos dois sentidos)
--
-- * Conexão da EMPRESA (só administrador): todos os agendamentos da empresa.
-- * Conexão do USUÁRIO (cada um a sua): os agendamentos em que ele é o responsável.
-- * Cada conexão usa uma agenda própria criada no Google ("Razão Finance");
--   o Razão não enxerga as outras agendas da pessoa.
-- * A chave de acesso do Google (refresh token) fica CRIPTOGRAFADA e só a
--   função "google-calendar" (servidor) lê. A tela vê só os dados públicos.
-- * Toda mudança na agenda do Razão entra numa fila; a função envia para o
--   Google e traz de volta o que mudou lá.
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.
-- =========================================================================

-- ---------- Conexões ----------
create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  scope text not null check (scope in ('empresa', 'usuario')),
  -- quem conectou; na conexão "usuario" é o dono dos agendamentos
  user_id uuid not null references auth.users (id) on delete cascade,
  google_email text,
  calendar_id text,
  calendar_name text,
  encrypted_refresh_token text not null,
  sync_token text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- uma da empresa por empresa; uma por usuário por empresa
create unique index if not exists google_calendar_connections_company_uidx
  on public.google_calendar_connections (company_id) where scope = 'empresa';
create unique index if not exists google_calendar_connections_user_uidx
  on public.google_calendar_connections (company_id, user_id) where scope = 'usuario';

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from public, anon, authenticated;

-- ---------- Agendamento x evento no Google ----------
-- (sem chave estrangeira para o agendamento: quando ele é excluído, o vínculo
-- ainda é preciso para apagar o evento no Google)
create table if not exists public.appointment_google_events (
  appointment_id uuid not null,
  connection_id uuid not null references public.google_calendar_connections (id) on delete cascade,
  google_event_id text not null,
  google_updated timestamptz,
  synced_at timestamptz not null default now(),
  primary key (appointment_id, connection_id)
);

create unique index if not exists appointment_google_events_event_uidx
  on public.appointment_google_events (connection_id, google_event_id);

alter table public.appointment_google_events enable row level security;
revoke all on public.appointment_google_events from public, anon, authenticated;

-- ---------- Fila de envio ----------
create table if not exists public.google_calendar_queue (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  appointment_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists google_calendar_queue_company_idx
  on public.google_calendar_queue (company_id, id);

alter table public.google_calendar_queue enable row level security;
revoke all on public.google_calendar_queue from public, anon, authenticated;

-- Toda mudança em agendamento de empresa conectada entra na fila
-- (inclusive as que vieram do Google: assim elas chegam às outras agendas).
create or replace function public.appointments_google_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := coalesce(new.company_id, old.company_id);
  v_id uuid := coalesce(new.id, old.id);
begin
  if exists (select 1 from public.google_calendar_connections where company_id = v_company) then
    insert into public.google_calendar_queue (company_id, appointment_id) values (v_company, v_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists appointments_google_enqueue on public.appointments;
create trigger appointments_google_enqueue
  after insert or update or delete on public.appointments
  for each row execute function public.appointments_google_enqueue();

-- ---------- Dados públicos para a tela ----------
-- A conexão da empresa e a minha (sem a chave do Google)
create or replace function public.google_calendar_status(p_company_id uuid)
returns table (
  id uuid,
  scope text,
  user_id uuid,
  google_email text,
  calendar_name text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz,
  pending integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.scope, c.user_id, c.google_email, c.calendar_name, c.last_sync_at, c.last_error, c.created_at,
         (select count(*)::integer from public.google_calendar_queue q where q.company_id = c.company_id)
    from public.google_calendar_connections c
   where c.company_id = p_company_id
     and (c.scope = 'empresa' or c.user_id = auth.uid())
     and exists (
       select 1 from public.company_members m
        where m.company_id = p_company_id and m.user_id = auth.uid()
     );
$$;

revoke all on function public.google_calendar_status(uuid) from public, anon;
grant execute on function public.google_calendar_status(uuid) to authenticated;

notify pgrst, 'reload schema';
