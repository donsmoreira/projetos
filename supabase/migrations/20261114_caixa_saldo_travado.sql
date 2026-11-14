-- Caixa: o saldo não se edita
-- Depois de cadastrado, o dinheiro do caixa só muda por suprimento, sangria,
-- pagamentos, recebimentos, transferências e fechamento. Alterar o saldo
-- inicial de um caixa (o que mudaria o saldo atual) é recusado aqui no banco.

create or replace function public.block_cash_initial_balance_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.account_type = 'caixa'
     and new.initial_balance is distinct from old.initial_balance then
    raise exception 'O saldo do caixa não pode ser editado. Para colocar ou tirar dinheiro, use Suprimento ou Sangria.';
  end if;

  return new;
end;
$$;

drop trigger if exists bank_accounts_cash_balance_locked on public.bank_accounts;
create trigger bank_accounts_cash_balance_locked
  before update of initial_balance on public.bank_accounts
  for each row execute function public.block_cash_initial_balance_change();

revoke all on function public.block_cash_initial_balance_change() from public, anon, authenticated;
