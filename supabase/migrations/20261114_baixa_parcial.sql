-- Baixa parcial em Contas a Pagar e Contas a Receber
--
-- Antes: qualquer valor informado na baixa quitava a conta inteira.
-- Agora, quando o valor é MENOR que o total da conta:
--   * "deixar o restante em aberto" (padrão): a conta fica paga/recebida só
--     com o valor informado e o sistema cria, na mesma hora, uma nova conta
--     pendente com o restante (mesmo fornecedor/cliente, mesmo vencimento,
--     descrição com "(restante)");
--   * "quitar com desconto": a conta é quitada pelo valor informado (como antes).
-- O estorno junta de volta: apaga a conta do restante (se ela ainda estiver
-- pendente) e devolve o valor à conta original. Se o restante já foi baixado,
-- o estorno pede para estornar o restante primeiro.

---------------------------------------------------------------------------
-- 1) Ligação "restante de qual conta"
---------------------------------------------------------------------------
alter table public.payables
  add column if not exists partial_of uuid references public.payables (id) on delete set null;

alter table public.receivables
  add column if not exists partial_of uuid references public.receivables (id) on delete set null;

create index if not exists payables_partial_of_idx on public.payables (partial_of);
create index if not exists receivables_partial_of_idx on public.receivables (partial_of);

---------------------------------------------------------------------------
-- 2) Restante de conta com cadastro inativo pode ser criado
--    (é a mesma dívida, não um lançamento novo)
---------------------------------------------------------------------------
create or replace function public.block_inactive_party()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'payables' then
    if tg_op = 'INSERT' and new.partial_of is not null
       and exists (select 1 from public.payables
                    where id = new.partial_of
                      and company_id = new.company_id
                      and supplier_id is not distinct from new.supplier_id) then
      return new;
    end if;

    if new.supplier_id is not null
       and (tg_op = 'INSERT' or new.supplier_id is distinct from old.supplier_id)
       and exists (select 1 from public.suppliers where id = new.supplier_id and not active) then
      raise exception 'Este fornecedor está inativo. Reative o cadastro para lançar.';
    end if;

  elsif tg_table_name = 'receivables' then
    if tg_op = 'INSERT' and new.partial_of is not null
       and exists (select 1 from public.receivables
                    where id = new.partial_of
                      and company_id = new.company_id
                      and client_id is not distinct from new.client_id) then
      return new;
    end if;

    if new.client_id is not null
       and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id)
       and exists (select 1 from public.clients where id = new.client_id and not active) then
      raise exception 'Este cliente está inativo. Reative o cadastro para lançar.';
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

revoke all on function public.block_inactive_party() from public, anon;

---------------------------------------------------------------------------
-- 3) PAGAR
---------------------------------------------------------------------------
drop function if exists public.pay_payable(uuid, uuid, date, numeric, text);

create or replace function public.pay_payable(
  p_payable_id uuid,
  p_account_id uuid,
  p_date date,
  p_value numeric,
  p_notes text default null,
  p_keep_rest_open boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  payable_row public.payables%rowtype;
  account_row public.bank_accounts%rowtype;
  transaction_id uuid;
  v_value numeric := round(p_value, 2);
  v_total numeric;
  v_rest numeric;
  v_left numeric;
  v_take numeric;
  v_original numeric;
  v_penalty numeric;
  v_interest numeric;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_pagar', 'settle') then
    raise exception 'Você não tem permissão para baixar contas nesta empresa.';
  end if;

  if p_value is null or v_value <= 0 then
    raise exception 'Informe um valor pago maior que zero.';
  end if;

  if p_date is null then
    raise exception 'Informe a data do pagamento.';
  end if;

  select * into payable_row
    from public.payables
   where id = p_payable_id and company_id = company
   for update;

  if not found then
    raise exception 'Conta a pagar não encontrada.';
  end if;

  if payable_row.status <> 'pendente' then
    raise exception 'Esta conta já foi paga.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company;

  if not found then
    raise exception 'Conta bancária ou caixa não encontrado.';
  end if;

  v_original := round(coalesce(payable_row.original_value, 0), 2);
  v_penalty  := round(coalesce(payable_row.penalty, 0), 2);
  v_interest := round(coalesce(payable_row.interest, 0), 2);
  v_total    := v_original + v_penalty + v_interest;
  v_rest     := 0;

  -- Baixa parcial: a conta fica só com o valor pago; o restante vira outra conta
  if coalesce(p_keep_rest_open, true) and v_value < v_total then
    if payable_row.card_id is not null then
      raise exception 'Esta conta não aceita pagamento parcial.';
    end if;

    v_rest := v_total - v_value;
    v_left := v_rest;

    v_take := least(v_original, v_left); v_original := v_original - v_take; v_left := v_left - v_take;
    v_take := least(v_penalty,  v_left); v_penalty  := v_penalty  - v_take; v_left := v_left - v_take;
    v_take := least(v_interest, v_left); v_interest := v_interest - v_take; v_left := v_left - v_take;

    insert into public.payables (
      user_id, company_id, supplier_id, description, category, management_account_id,
      original_value, interest, penalty, issue_date, due_date, notes, status,
      installment_group_id, installment_index, installment_count, partial_of
    ) values (
      payable_row.user_id, company, payable_row.supplier_id,
      case when payable_row.description like '% (restante)'
           then payable_row.description
           else payable_row.description || ' (restante)' end,
      payable_row.category, payable_row.management_account_id,
      v_rest, 0, 0, payable_row.issue_date, payable_row.due_date, payable_row.notes, 'pendente',
      payable_row.installment_group_id, payable_row.installment_index, payable_row.installment_count,
      payable_row.id
    );
  end if;

  insert into public.bank_transactions (
    user_id, company_id, bank_account_id, payable_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), company, p_account_id, p_payable_id, p_date,
    'Pagamento: ' || payable_row.description,
    -v_value, 'payable_payment', 'payable', p_payable_id
  )
  returning id into transaction_id;

  update public.payables
     set status = 'pago',
         original_value = v_original,
         penalty = v_penalty,
         interest = v_interest,
         payment_method = case when account_row.account_type = 'caixa' then 'caixa' else 'banco' end,
         payment_date = p_date,
         paid_value = v_value,
         payment_notes = nullif(btrim(p_notes), ''),
         bank_account_id = p_account_id,
         bank_transaction_id = transaction_id,
         updated_at = now()
   where id = p_payable_id;
end;
$$;

create or replace function public.reverse_payable_payment(
  p_payable_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  payable_row public.payables%rowtype;
  rest_row public.payables%rowtype;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_pagar', 'settle') then
    raise exception 'Você não tem permissão para estornar nesta empresa.';
  end if;

  select * into payable_row
    from public.payables
   where id = p_payable_id and company_id = company
   for update;

  if not found then
    raise exception 'Conta a pagar não encontrada.';
  end if;

  if payable_row.status <> 'pago' then
    raise exception 'Esta conta não está paga.';
  end if;

  -- Restante criado por baixa parcial: volta para esta conta
  select * into rest_row
    from public.payables
   where partial_of = p_payable_id and company_id = company
   for update;

  if found then
    if rest_row.status <> 'pendente' then
      raise exception 'O restante desta conta ("%") já foi pago. Estorne primeiro o pagamento do restante.', rest_row.description;
    end if;

    delete from public.payables where id = rest_row.id;
  end if;

  update public.payables
     set status = 'pendente',
         original_value = original_value + coalesce(round(rest_row.original_value + rest_row.interest + rest_row.penalty, 2), 0),
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
-- 4) RECEBER
---------------------------------------------------------------------------
drop function if exists public.receive_receivable(uuid, uuid, date, numeric, text);

create or replace function public.receive_receivable(
  p_receivable_id uuid,
  p_account_id uuid,
  p_date date,
  p_value numeric,
  p_notes text default null,
  p_keep_rest_open boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  receivable_row public.receivables%rowtype;
  account_row public.bank_accounts%rowtype;
  transaction_id uuid;
  v_value numeric := round(p_value, 2);
  v_total numeric;
  v_rest numeric;
  v_left numeric;
  v_take numeric;
  v_original numeric;
  v_penalty numeric;
  v_interest numeric;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_receber', 'settle') then
    raise exception 'Você não tem permissão para baixar contas nesta empresa.';
  end if;

  if p_value is null or v_value <= 0 then
    raise exception 'Informe um valor recebido maior que zero.';
  end if;

  if p_date is null then
    raise exception 'Informe a data do recebimento.';
  end if;

  select * into receivable_row
    from public.receivables
   where id = p_receivable_id and company_id = company
   for update;

  if not found then
    raise exception 'Conta a receber não encontrada.';
  end if;

  if receivable_row.status <> 'pendente' then
    raise exception 'Esta conta já foi recebida.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company;

  if not found then
    raise exception 'Conta bancária ou caixa não encontrado.';
  end if;

  v_original := round(coalesce(receivable_row.original_value, 0), 2);
  v_penalty  := round(coalesce(receivable_row.penalty, 0), 2);
  v_interest := round(coalesce(receivable_row.interest, 0), 2);
  v_total    := v_original + v_penalty + v_interest;
  v_rest     := 0;

  -- Baixa parcial: a conta fica só com o valor recebido; o restante vira outra conta
  if coalesce(p_keep_rest_open, true) and v_value < v_total then
    v_rest := v_total - v_value;
    v_left := v_rest;

    v_take := least(v_original, v_left); v_original := v_original - v_take; v_left := v_left - v_take;
    v_take := least(v_penalty,  v_left); v_penalty  := v_penalty  - v_take; v_left := v_left - v_take;
    v_take := least(v_interest, v_left); v_interest := v_interest - v_take; v_left := v_left - v_take;

    insert into public.receivables (
      user_id, company_id, client_id, description, category, management_account_id,
      original_value, interest, penalty, issue_date, due_date, notes, status,
      installment_group_id, installment_index, installment_count, partial_of
    ) values (
      receivable_row.user_id, company, receivable_row.client_id,
      case when receivable_row.description like '% (restante)'
           then receivable_row.description
           else receivable_row.description || ' (restante)' end,
      receivable_row.category, receivable_row.management_account_id,
      v_rest, 0, 0, receivable_row.issue_date, receivable_row.due_date, receivable_row.notes, 'pendente',
      receivable_row.installment_group_id, receivable_row.installment_index, receivable_row.installment_count,
      receivable_row.id
    );
  end if;

  insert into public.bank_transactions (
    user_id, company_id, bank_account_id, receivable_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), company, p_account_id, p_receivable_id, p_date,
    'Recebimento: ' || receivable_row.description,
    v_value, 'receivable_receipt', 'receivable', p_receivable_id
  )
  returning id into transaction_id;

  update public.receivables
     set status = 'recebido',
         original_value = v_original,
         penalty = v_penalty,
         interest = v_interest,
         payment_method = case when account_row.account_type = 'caixa' then 'caixa' else 'banco' end,
         payment_date = p_date,
         receipt_date = p_date,
         received_value = v_value,
         payment_notes = nullif(btrim(p_notes), ''),
         bank_account_id = p_account_id,
         bank_transaction_id = transaction_id,
         updated_at = now()
   where id = p_receivable_id;
end;
$$;

create or replace function public.reverse_receivable_receipt(
  p_receivable_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  receivable_row public.receivables%rowtype;
  rest_row public.receivables%rowtype;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_receber', 'settle') then
    raise exception 'Você não tem permissão para estornar nesta empresa.';
  end if;

  select * into receivable_row
    from public.receivables
   where id = p_receivable_id and company_id = company
   for update;

  if not found then
    raise exception 'Conta a receber não encontrada.';
  end if;

  if receivable_row.status <> 'recebido' then
    raise exception 'Esta conta não está recebida.';
  end if;

  -- Restante criado por baixa parcial: volta para esta conta
  select * into rest_row
    from public.receivables
   where partial_of = p_receivable_id and company_id = company
   for update;

  if found then
    if rest_row.status <> 'pendente' then
      raise exception 'O restante desta conta ("%") já foi recebido. Estorne primeiro o recebimento do restante.', rest_row.description;
    end if;

    delete from public.receivables where id = rest_row.id;
  end if;

  update public.receivables
     set status = 'pendente',
         original_value = original_value + coalesce(round(rest_row.original_value + rest_row.interest + rest_row.penalty, 2), 0),
         payment_method = null,
         payment_date = null,
         receipt_date = null,
         received_value = null,
         payment_notes = null,
         bank_account_id = null,
         bank_transaction_id = null,
         updated_at = now()
   where id = p_receivable_id;

  if receivable_row.bank_transaction_id is not null then
    delete from public.bank_transactions
     where id = receivable_row.bank_transaction_id;
  end if;
end;
$$;

---------------------------------------------------------------------------
-- 5) Quem pode chamar: só quem está logado
---------------------------------------------------------------------------
revoke all on function public.pay_payable(uuid, uuid, date, numeric, text, boolean) from public, anon;
revoke all on function public.reverse_payable_payment(uuid) from public, anon;
revoke all on function public.receive_receivable(uuid, uuid, date, numeric, text, boolean) from public, anon;
revoke all on function public.reverse_receivable_receipt(uuid) from public, anon;

grant execute on function public.pay_payable(uuid, uuid, date, numeric, text, boolean) to authenticated;
grant execute on function public.reverse_payable_payment(uuid) to authenticated;
grant execute on function public.receive_receivable(uuid, uuid, date, numeric, text, boolean) to authenticated;
grant execute on function public.reverse_receivable_receipt(uuid) to authenticated;

notify pgrst, 'reload schema';
