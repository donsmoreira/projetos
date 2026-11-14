-- Open Finance (agregador Pluggy) ligado à Conciliação Bancária
-- Rode DEPOIS de 20261114_conciliacao_bancaria.sql.
--
-- Cada conta bancária do sistema pode ser ligada a uma conta do banco
-- conectada pelo Open Finance. A sincronização (feita pela função
-- "open-finance" no servidor) traz os lançamentos para a mesma tabela do
-- extrato importado (bank_statement_lines, origem "openfinance"); dali em
-- diante é a conciliação de sempre.

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts (id) on delete cascade,
  provider text not null default 'pluggy' check (provider in ('pluggy')),
  item_id text not null,
  provider_account_id text not null,
  connector_name text,
  account_label text,
  consent_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (bank_account_id)
);

create index if not exists bank_connections_company_idx on public.bank_connections (company_id);

alter table public.bank_connections enable row level security;

drop policy if exists bank_connections_select on public.bank_connections;
create policy bank_connections_select on public.bank_connections
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and public.has_module_permission('contas_bancarias', 'view')
  );
-- Gravação só pelas funções abaixo

grant select on public.bank_connections to authenticated;

---------------------------------------------------------------------------
-- Ligar / trocar a conexão de uma conta bancária
---------------------------------------------------------------------------
create or replace function public.save_bank_connection(
  p_bank_account_id uuid,
  p_item_id text,
  p_provider_account_id text,
  p_connector_name text default null,
  p_account_label text default null,
  p_consent_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  account_row public.bank_accounts%rowtype;
  v_id uuid;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_bancarias', 'create') then
    raise exception 'Você não tem permissão para conectar bancos nesta empresa.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_bank_account_id and company_id = company;

  if not found or account_row.account_type <> 'banco' then
    raise exception 'Escolha uma conta bancária do sistema.';
  end if;

  if coalesce(btrim(p_item_id), '') = '' or coalesce(btrim(p_provider_account_id), '') = '' then
    raise exception 'Conexão do banco inválida.';
  end if;

  if exists (select 1 from public.bank_connections
              where company_id = company
                and provider_account_id = btrim(p_provider_account_id)
                and bank_account_id <> p_bank_account_id) then
    raise exception 'Esta conta do banco já está ligada a outra conta do sistema.';
  end if;

  insert into public.bank_connections (
    company_id, bank_account_id, provider, item_id, provider_account_id,
    connector_name, account_label, consent_expires_at
  ) values (
    company, p_bank_account_id, 'pluggy', btrim(p_item_id), btrim(p_provider_account_id),
    nullif(btrim(p_connector_name), ''), nullif(btrim(p_account_label), ''), p_consent_expires_at
  )
  on conflict (bank_account_id) do update
     set item_id = excluded.item_id,
         provider_account_id = excluded.provider_account_id,
         connector_name = excluded.connector_name,
         account_label = excluded.account_label,
         consent_expires_at = excluded.consent_expires_at,
         last_error = null
  returning id into v_id;

  return v_id;
end;
$$;

-- Resultado da sincronização (chamada pela função do servidor, como o usuário)
create or replace function public.mark_bank_connection_synced(
  p_connection_id uuid,
  p_error text default null,
  p_consent_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_bancarias', 'create') then
    raise exception 'Você não tem permissão para sincronizar bancos nesta empresa.';
  end if;

  update public.bank_connections
     set last_sync_at = case when p_error is null then now() else last_sync_at end,
         last_error = nullif(btrim(p_error), ''),
         consent_expires_at = coalesce(p_consent_expires_at, consent_expires_at)
   where id = p_connection_id and company_id = company;
end;
$$;

-- Desligar (os lançamentos já trazidos continuam no extrato)
create or replace function public.delete_bank_connection(
  p_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_bancarias', 'delete') then
    raise exception 'Você não tem permissão para desconectar bancos nesta empresa.';
  end if;

  delete from public.bank_connections
   where id = p_connection_id and company_id = company;
end;
$$;

revoke all on function public.save_bank_connection(uuid, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.mark_bank_connection_synced(uuid, text, timestamptz) from public, anon;
revoke all on function public.delete_bank_connection(uuid) from public, anon;

grant execute on function public.save_bank_connection(uuid, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.mark_bank_connection_synced(uuid, text, timestamptz) to authenticated;
grant execute on function public.delete_bank_connection(uuid) to authenticated;

notify pgrst, 'reload schema';
