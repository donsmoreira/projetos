-- 1) Conta gerencial nos lançamentos de contas a pagar e a receber
--    Contas a pagar só aceitam contas de DESPESA; contas a receber só de RECEITA.
-- 2) Caixa (dinheiro físico): um tipo de conta, ao lado das contas bancárias.
--    O saldo do caixa nunca pode ficar negativo.
-- 3) Transferência entre contas (ex.: saque do banco para o caixa, depósito do caixa no banco).
--
-- Precisa ter rodado antes: 20261110_contas_gerenciais.sql
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

---------------------------------------------------------------------------
-- 1) CONTA GERENCIAL NOS LANÇAMENTOS
---------------------------------------------------------------------------

alter table public.payables
  add column if not exists management_account_id uuid
    references public.management_accounts (id) on delete restrict;

alter table public.receivables
  add column if not exists management_account_id uuid
    references public.management_accounts (id) on delete restrict;

create index if not exists payables_management_account_idx
  on public.payables (management_account_id);

create index if not exists receivables_management_account_idx
  on public.receivables (management_account_id);

create or replace function public.validate_entry_management_account()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  account_row public.management_accounts%rowtype;
  expected_type text;
begin
  if new.management_account_id is null then
    return new;
  end if;

  expected_type := case tg_table_name
    when 'payables' then 'despesa'
    else 'receita'
  end;

  select *
    into account_row
    from public.management_accounts
   where id = new.management_account_id;

  if not found or account_row.user_id <> new.user_id then
    raise exception 'Conta gerencial não encontrada.';
  end if;

  if account_row.type <> expected_type then
    if expected_type = 'despesa' then
      raise exception 'Contas a pagar só aceitam contas gerenciais de despesa.';
    else
      raise exception 'Contas a receber só aceitam contas gerenciais de receita.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists payables_management_account_trigger on public.payables;

create trigger payables_management_account_trigger
  before insert or update of management_account_id on public.payables
  for each row
  execute function public.validate_entry_management_account();

drop trigger if exists receivables_management_account_trigger on public.receivables;

create trigger receivables_management_account_trigger
  before insert or update of management_account_id on public.receivables
  for each row
  execute function public.validate_entry_management_account();

-- Uma conta gerencial não pode mudar de tipo se já tem lançamentos
create or replace function public.management_accounts_type_in_use()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.type <> old.type
     and (
       exists (select 1 from public.payables where management_account_id = new.id)
       or exists (select 1 from public.receivables where management_account_id = new.id)
     ) then
    raise exception 'Não é possível trocar o tipo de uma conta gerencial que já tem lançamentos.';
  end if;

  return new;
end;
$$;

drop trigger if exists management_accounts_type_in_use_trigger on public.management_accounts;

create trigger management_accounts_type_in_use_trigger
  before update of type on public.management_accounts
  for each row
  execute function public.management_accounts_type_in_use();

---------------------------------------------------------------------------
-- 2) CAIXA (DINHEIRO FÍSICO)
---------------------------------------------------------------------------

alter table public.bank_accounts
  add column if not exists account_type text not null default 'banco';

alter table public.bank_accounts
  drop constraint if exists bank_accounts_account_type_check;

alter table public.bank_accounts
  add constraint bank_accounts_account_type_check
  check (account_type in ('banco', 'caixa'));

-- Caixa não tem cheque especial
alter table public.bank_accounts
  drop constraint if exists bank_accounts_cash_no_overdraft;

alter table public.bank_accounts
  add constraint bank_accounts_cash_no_overdraft
  check (account_type = 'banco' or overdraft_limit = 0);

-- Pagamento pode sair do banco, do cartão ou do caixa
alter table public.payables
  drop constraint if exists payables_payment_method_check;

alter table public.payables
  add constraint payables_payment_method_check
  check (payment_method is null or payment_method in ('banco', 'cartao', 'caixa'));

-- Saldo do caixa nunca negativo
create or replace function public.check_cash_balance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  account_row public.bank_accounts%rowtype;
  current_balance numeric(14,2);
begin
  select *
    into account_row
    from public.bank_accounts
   where id = new.bank_account_id;

  if not found or account_row.account_type <> 'caixa' then
    return new;
  end if;

  select account_row.initial_balance + coalesce(sum(value), 0)
    into current_balance
    from public.bank_transactions
   where bank_account_id = new.bank_account_id
     and id <> new.id;

  if current_balance + new.value < 0 then
    raise exception 'Saldo insuficiente no caixa "%": disponível R$ %.',
      account_row.name,
      translate(to_char(current_balance, 'FM999,999,990.00'), ',.', '.,');
  end if;

  return new;
end;
$$;

drop trigger if exists bank_transactions_cash_balance_trigger on public.bank_transactions;

create trigger bank_transactions_cash_balance_trigger
  before insert or update of value, bank_account_id on public.bank_transactions
  for each row
  execute function public.check_cash_balance();

-- Desfazer uma entrada no caixa (ex.: estorno de recebimento) também não pode
-- deixar o saldo negativo, se aquele dinheiro já foi usado.
create or replace function public.check_cash_balance_on_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  account_row public.bank_accounts%rowtype;
  balance_after numeric(14,2);
begin
  if old.value <= 0 then
    return old;
  end if;

  select *
    into account_row
    from public.bank_accounts
   where id = old.bank_account_id;

  if not found or account_row.account_type <> 'caixa' then
    return old;
  end if;

  select account_row.initial_balance + coalesce(sum(value), 0)
    into balance_after
    from public.bank_transactions
   where bank_account_id = old.bank_account_id
     and id <> old.id;

  if balance_after < 0 then
    raise exception 'Não é possível desfazer: o caixa "%" ficaria com saldo negativo (R$ %).',
      account_row.name,
      translate(to_char(balance_after, 'FM999,999,990.00'), ',.', '.,');
  end if;

  return old;
end;
$$;

drop trigger if exists bank_transactions_cash_delete_trigger on public.bank_transactions;

create trigger bank_transactions_cash_delete_trigger
  before delete on public.bank_transactions
  for each row
  execute function public.check_cash_balance_on_delete();

---------------------------------------------------------------------------
-- 3) TRANSFERÊNCIA ENTRE CONTAS
---------------------------------------------------------------------------

alter table public.bank_transactions
  drop constraint if exists bank_transactions_transaction_type_check;

alter table public.bank_transactions
  add constraint bank_transactions_transaction_type_check
  check (transaction_type in (
    'manual',
    'payable_payment',
    'receivable_receipt',
    'card_settlement',
    'transfer'
  ));

-- Cria as duas pernas da transferência juntas (ou nenhuma, se der erro).
-- Roda com as permissões do próprio usuário (RLS continua valendo).
create or replace function public.transfer_between_accounts(
  p_from_account uuid,
  p_to_account uuid,
  p_date date,
  p_value numeric,
  p_description text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  transfer_id uuid := gen_random_uuid();
  from_name text;
  to_name text;
begin
  if p_value is null or p_value <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;

  if p_from_account = p_to_account then
    raise exception 'Escolha contas diferentes para a transferência.';
  end if;

  select name into from_name from public.bank_accounts where id = p_from_account;
  select name into to_name from public.bank_accounts where id = p_to_account;

  if from_name is null or to_name is null then
    raise exception 'Conta da transferência não encontrada.';
  end if;

  insert into public.bank_transactions (
    user_id, bank_account_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), p_from_account, p_date,
    coalesce(nullif(btrim(p_description), ''), 'Transferência para ' || to_name),
    -p_value, 'transfer', 'transfer', transfer_id
  );

  insert into public.bank_transactions (
    user_id, bank_account_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), p_to_account, p_date,
    coalesce(nullif(btrim(p_description), ''), 'Transferência de ' || from_name),
    p_value, 'transfer', 'transfer', transfer_id
  );

  return transfer_id;
end;
$$;

revoke all on function public.transfer_between_accounts(uuid, uuid, date, numeric, text) from public;
revoke all on function public.transfer_between_accounts(uuid, uuid, date, numeric, text) from anon;
grant execute on function public.transfer_between_accounts(uuid, uuid, date, numeric, text) to authenticated;
