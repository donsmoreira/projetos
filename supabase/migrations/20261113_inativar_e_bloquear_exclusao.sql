-- Cadastros: inativar e bloquear exclusão com movimentação
-- 1) Clientes e fornecedores ganham "ativo" (inativo some das listas de escolha).
-- 2) Lançamento novo não aceita cliente/fornecedor inativo.
-- 3) Não exclui cliente, fornecedor, conta bancária/caixa ou cartão que tenha
--    movimentação ou contas em aberto vinculadas: a mensagem sugere inativar.
-- 4) Conta gerencial nos lançamentos passa a ser opcional (o banco já aceitava vazio).

---------------------------------------------------------------------------
-- 1) Campo ativo
---------------------------------------------------------------------------
alter table public.clients
  add column if not exists active boolean not null default true;

alter table public.suppliers
  add column if not exists active boolean not null default true;

---------------------------------------------------------------------------
-- 2) Lançamento novo só com cadastro ativo
---------------------------------------------------------------------------
create or replace function public.block_inactive_party()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'payables' then
    if new.supplier_id is not null
       and (tg_op = 'INSERT' or new.supplier_id is distinct from old.supplier_id)
       and exists (select 1 from public.suppliers where id = new.supplier_id and not active) then
      raise exception 'Este fornecedor está inativo. Reative o cadastro para lançar.';
    end if;
  else
    if new.client_id is not null
       and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id)
       and exists (select 1 from public.clients where id = new.client_id and not active) then
      raise exception 'Este cliente está inativo. Reative o cadastro para lançar.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists payables_block_inactive on public.payables;
create trigger payables_block_inactive
  before insert or update of supplier_id on public.payables
  for each row execute function public.block_inactive_party();

drop trigger if exists receivables_block_inactive on public.receivables;
create trigger receivables_block_inactive
  before insert or update of client_id on public.receivables
  for each row execute function public.block_inactive_party();

drop trigger if exists appointments_block_inactive on public.appointments;
create trigger appointments_block_inactive
  before insert or update of client_id on public.appointments
  for each row execute function public.block_inactive_party();

---------------------------------------------------------------------------
-- 3) Bloquear exclusão com movimentação
--    (security definer: confere tudo, mesmo o que a pessoa não pode ver)
--    Exclusão da empresa inteira (cascata) não é barrada.
---------------------------------------------------------------------------
create or replace function public.block_delete_with_movements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open integer;
  v_any integer;
begin
  -- Empresa sendo apagada: deixa a cascata seguir
  if not exists (select 1 from public.companies where id = old.company_id) then
    return old;
  end if;

  if tg_table_name = 'clients' then
    select count(*) filter (where status <> 'recebido'), count(*)
      into v_open, v_any
      from public.receivables where client_id = old.id;

    if v_open > 0 then
      raise exception 'O cliente "%" tem % conta(s) a receber em aberto e não pode ser excluído. Use "Inativar".', old.name, v_open;
    end if;

    if v_any > 0 or exists (select 1 from public.appointments where client_id = old.id) then
      raise exception 'O cliente "%" tem movimentação (contas recebidas ou agendamentos) e não pode ser excluído. Use "Inativar".', old.name;
    end if;

  elsif tg_table_name = 'suppliers' then
    select count(*) filter (where status <> 'pago'), count(*)
      into v_open, v_any
      from public.payables where supplier_id = old.id;

    if v_open > 0 then
      raise exception 'O fornecedor "%" tem % conta(s) a pagar em aberto e não pode ser excluído. Use "Inativar".', old.name, v_open;
    end if;

    if v_any > 0 then
      raise exception 'O fornecedor "%" tem contas pagas (movimentação) e não pode ser excluído. Use "Inativar".', old.name;
    end if;

  elsif tg_table_name = 'bank_accounts' then
    if exists (select 1 from public.bank_transactions where bank_account_id = old.id)
       or exists (select 1 from public.payables where bank_account_id = old.id)
       or exists (select 1 from public.receivables where bank_account_id = old.id)
       or exists (select 1 from public.cash_sessions where cash_account_id = old.id) then
      raise exception '"%" tem movimentação e não pode ser excluída.', old.name;
    end if;

    if exists (select 1 from public.credit_cards where bank_account_id = old.id) then
      raise exception '"%" está ligada a um cartão de crédito e não pode ser excluída.', old.name;
    end if;

  elsif tg_table_name = 'credit_cards' then
    if exists (select 1 from public.card_transactions where card_id = old.id) then
      raise exception 'O cartão "%" tem compras lançadas e não pode ser excluído. Use "Desativar".', old.name;
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists clients_block_delete on public.clients;
create trigger clients_block_delete
  before delete on public.clients
  for each row execute function public.block_delete_with_movements();

drop trigger if exists suppliers_block_delete on public.suppliers;
create trigger suppliers_block_delete
  before delete on public.suppliers
  for each row execute function public.block_delete_with_movements();

drop trigger if exists bank_accounts_block_delete on public.bank_accounts;
create trigger bank_accounts_block_delete
  before delete on public.bank_accounts
  for each row execute function public.block_delete_with_movements();

drop trigger if exists credit_cards_block_delete on public.credit_cards;
create trigger credit_cards_block_delete
  before delete on public.credit_cards
  for each row execute function public.block_delete_with_movements();

revoke all on function public.block_inactive_party() from public, anon;
revoke all on function public.block_delete_with_movements() from public, anon;
