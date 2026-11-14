-- Saldo informado pelo banco (Conciliação Bancária)
-- Rode DEPOIS de 20261114_open_finance.sql.
--
-- Cada conta bancária guarda o último saldo que o próprio banco informou:
-- no arquivo OFX (LEDGERBAL) ou na sincronização do Open Finance. A tela
-- da conciliação mostra esse saldo ao lado do saldo do sistema e a diferença.

alter table public.bank_accounts
  add column if not exists bank_balance numeric(14, 2),
  add column if not exists bank_balance_date date,
  add column if not exists bank_balance_source text,
  add column if not exists bank_balance_updated_at timestamptz;

alter table public.bank_accounts drop constraint if exists bank_accounts_bank_balance_source_check;
alter table public.bank_accounts add constraint bank_accounts_bank_balance_source_check
  check (bank_balance_source is null or bank_balance_source in ('ofx', 'openfinance'));

create or replace function public.set_bank_reported_balance(
  p_account_id uuid,
  p_balance numeric,
  p_date date,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  account_row public.bank_accounts%rowtype;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_bancarias', 'create') then
    raise exception 'Você não tem permissão para atualizar o saldo do banco nesta empresa.';
  end if;

  if p_balance is null or p_date is null or p_source not in ('ofx', 'openfinance') then
    raise exception 'Saldo do banco inválido.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company
   for update;

  if not found or account_row.account_type <> 'banco' then
    raise exception 'Conta bancária não encontrada.';
  end if;

  -- Um arquivo antigo não apaga um saldo mais novo
  if account_row.bank_balance_date is not null and p_date < account_row.bank_balance_date then
    return;
  end if;

  update public.bank_accounts
     set bank_balance = round(p_balance, 2),
         bank_balance_date = p_date,
         bank_balance_source = p_source,
         bank_balance_updated_at = now()
   where id = p_account_id;
end;
$$;

revoke all on function public.set_bank_reported_balance(uuid, numeric, date, text) from public, anon;
grant execute on function public.set_bank_reported_balance(uuid, numeric, date, text) to authenticated;

notify pgrst, 'reload schema';
