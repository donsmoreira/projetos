-- Pagamento, recebimento e estorno numa operação só (D1).
--
-- Antes, a tela fazia duas gravações separadas (o lançamento no banco/caixa e a
-- mudança de status da conta). Se algo falhasse no meio, os dados ficavam pela metade.
-- Agora cada operação é uma função no banco: ou tudo dá certo, ou nada muda.
--
-- As funções rodam com as permissões do próprio usuário (security invoker):
-- as regras de acesso (RLS) continuam valendo, então ninguém mexe em conta de outro.
-- As regras do caixa (nunca negativo) e da conta gerencial continuam nos gatilhos
-- que já existem e valem aqui também.
--
-- Precisa ter rodado antes: 20261110_lancamentos_e_caixa.sql
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

---------------------------------------------------------------------------
-- 1) PAGAR UMA CONTA A PAGAR
---------------------------------------------------------------------------
create or replace function public.pay_payable(
  p_payable_id uuid,
  p_account_id uuid,
  p_date date,
  p_value numeric,
  p_notes text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  payable_row public.payables%rowtype;
  account_row public.bank_accounts%rowtype;
  transaction_id uuid;
begin
  if p_value is null or p_value <= 0 then
    raise exception 'Informe um valor pago maior que zero.';
  end if;

  if p_date is null then
    raise exception 'Informe a data do pagamento.';
  end if;

  -- "for update" trava a conta até o fim: dois cliques ao mesmo tempo não pagam duas vezes
  select * into payable_row
    from public.payables
   where id = p_payable_id
   for update;

  if not found then
    raise exception 'Conta a pagar não encontrada.';
  end if;

  if payable_row.status <> 'pendente' then
    raise exception 'Esta conta já foi paga.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id;

  if not found then
    raise exception 'Conta bancária ou caixa não encontrado.';
  end if;

  insert into public.bank_transactions (
    user_id, bank_account_id, payable_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), p_account_id, p_payable_id, p_date,
    'Pagamento: ' || payable_row.description,
    -round(p_value, 2), 'payable_payment', 'payable', p_payable_id
  )
  returning id into transaction_id;

  update public.payables
     set status = 'pago',
         payment_method = case when account_row.account_type = 'caixa' then 'caixa' else 'banco' end,
         payment_date = p_date,
         paid_value = round(p_value, 2),
         payment_notes = nullif(btrim(p_notes), ''),
         bank_account_id = p_account_id,
         bank_transaction_id = transaction_id,
         updated_at = now()
   where id = p_payable_id;
end;
$$;

---------------------------------------------------------------------------
-- 2) ESTORNAR O PAGAMENTO DE UMA CONTA A PAGAR
---------------------------------------------------------------------------
create or replace function public.reverse_payable_payment(
  p_payable_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  payable_row public.payables%rowtype;
begin
  select * into payable_row
    from public.payables
   where id = p_payable_id
   for update;

  if not found then
    raise exception 'Conta a pagar não encontrada.';
  end if;

  if payable_row.status <> 'pago' then
    raise exception 'Esta conta não está paga.';
  end if;

  -- Primeiro solta a ligação, depois apaga o lançamento
  update public.payables
     set status = 'pendente',
         payment_method = null,
         payment_date = null,
         paid_value = null,
         payment_notes = null,
         bank_account_id = null,
         bank_transaction_id = null,
         updated_at = now()
   where id = p_payable_id;

  if payable_row.bank_transaction_id is not null then
    delete from public.bank_transactions
     where id = payable_row.bank_transaction_id;
  end if;
end;
$$;

---------------------------------------------------------------------------
-- 3) RECEBER UMA CONTA A RECEBER
---------------------------------------------------------------------------
create or replace function public.receive_receivable(
  p_receivable_id uuid,
  p_account_id uuid,
  p_date date,
  p_value numeric,
  p_notes text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  receivable_row public.receivables%rowtype;
  account_row public.bank_accounts%rowtype;
  transaction_id uuid;
begin
  if p_value is null or p_value <= 0 then
    raise exception 'Informe um valor recebido maior que zero.';
  end if;

  if p_date is null then
    raise exception 'Informe a data do recebimento.';
  end if;

  select * into receivable_row
    from public.receivables
   where id = p_receivable_id
   for update;

  if not found then
    raise exception 'Conta a receber não encontrada.';
  end if;

  if receivable_row.status <> 'pendente' then
    raise exception 'Esta conta já foi recebida.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id;

  if not found then
    raise exception 'Conta bancária ou caixa não encontrado.';
  end if;

  insert into public.bank_transactions (
    user_id, bank_account_id, receivable_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), p_account_id, p_receivable_id, p_date,
    'Recebimento: ' || receivable_row.description,
    round(p_value, 2), 'receivable_receipt', 'receivable', p_receivable_id
  )
  returning id into transaction_id;

  update public.receivables
     set status = 'recebido',
         payment_method = case when account_row.account_type = 'caixa' then 'caixa' else 'banco' end,
         payment_date = p_date,
         receipt_date = p_date,
         received_value = round(p_value, 2),
         payment_notes = nullif(btrim(p_notes), ''),
         bank_account_id = p_account_id,
         bank_transaction_id = transaction_id,
         updated_at = now()
   where id = p_receivable_id;
end;
$$;

---------------------------------------------------------------------------
-- 4) ESTORNAR O RECEBIMENTO DE UMA CONTA A RECEBER
---------------------------------------------------------------------------
create or replace function public.reverse_receivable_receipt(
  p_receivable_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  receivable_row public.receivables%rowtype;
begin
  select * into receivable_row
    from public.receivables
   where id = p_receivable_id
   for update;

  if not found then
    raise exception 'Conta a receber não encontrada.';
  end if;

  if receivable_row.status <> 'recebido' then
    raise exception 'Esta conta não está recebida.';
  end if;

  update public.receivables
     set status = 'pendente',
         payment_method = null,
         payment_date = null,
         receipt_date = null,
         received_value = null,
         payment_notes = null,
         bank_account_id = null,
         bank_transaction_id = null,
         updated_at = now()
   where id = p_receivable_id;

  -- Se o dinheiro entrou no caixa e já foi gasto, o gatilho do caixa barra aqui
  -- e a função inteira é desfeita (a conta continua recebida).
  if receivable_row.bank_transaction_id is not null then
    delete from public.bank_transactions
     where id = receivable_row.bank_transaction_id;
  end if;
end;
$$;

---------------------------------------------------------------------------
-- PERMISSÕES: só quem está logado pode chamar
---------------------------------------------------------------------------
revoke all on function public.pay_payable(uuid, uuid, date, numeric, text) from public, anon;
revoke all on function public.reverse_payable_payment(uuid) from public, anon;
revoke all on function public.receive_receivable(uuid, uuid, date, numeric, text) from public, anon;
revoke all on function public.reverse_receivable_receipt(uuid) from public, anon;

grant execute on function public.pay_payable(uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.reverse_payable_payment(uuid) to authenticated;
grant execute on function public.receive_receivable(uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.reverse_receivable_receipt(uuid) to authenticated;
