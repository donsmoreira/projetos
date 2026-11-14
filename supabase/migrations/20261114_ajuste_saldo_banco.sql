-- Ajustar o saldo do sistema ao saldo informado pelo banco (Conciliação)
-- Rode DEPOIS de 20261114_saldo_do_banco.sql.
--
-- Lança uma movimentação de ajuste na data do saldo do banco, com a diferença
-- exata (calculada aqui no banco de dados), para o saldo do sistema naquela
-- data ficar igual ao do banco. O ajuste aparece no extrato do sistema e pode
-- ser excluído depois, como qualquer lançamento avulso.

create or replace function public.adjust_balance_to_bank(
  p_account_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  account_row public.bank_accounts%rowtype;
  v_system numeric;
  v_diff numeric;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_bancarias', 'create') then
    raise exception 'Você não tem permissão para lançar ajustes nesta empresa.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company
   for update;

  if not found or account_row.account_type <> 'banco' then
    raise exception 'Conta bancária não encontrada.';
  end if;

  if account_row.bank_balance is null or account_row.bank_balance_date is null then
    raise exception 'Ainda não há saldo do banco: importe um OFX ou sincronize o Open Finance.';
  end if;

  select round(coalesce(account_row.initial_balance, 0) + coalesce(sum(value), 0), 2)
    into v_system
    from public.bank_transactions
   where bank_account_id = p_account_id
     and transaction_date <= account_row.bank_balance_date;

  v_diff := round(account_row.bank_balance - v_system, 2);

  if v_diff = 0 then
    raise exception 'O saldo do sistema já bate com o do banco.';
  end if;

  insert into public.bank_transactions (
    user_id, company_id, bank_account_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), company, p_account_id, account_row.bank_balance_date,
    'Ajuste de saldo pela conciliação (saldo do banco em ' || to_char(account_row.bank_balance_date, 'DD/MM/YYYY') || ')',
    v_diff, 'manual', 'balance_adjustment', null
  );

  return v_diff;
end;
$$;

revoke all on function public.adjust_balance_to_bank(uuid) from public, anon;
grant execute on function public.adjust_balance_to_bank(uuid) to authenticated;

notify pgrst, 'reload schema';
