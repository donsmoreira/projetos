-- Cartão: antecipar fatura
-- Rode DEPOIS de 20261112_cartao_compras_faturas.sql.
-- Permite pagar a fatura atual, as anteriores e ANTECIPAR a do mês seguinte.
-- Faturas mais de 1 mês à frente não podem ser pagas.

create or replace function public.pay_card_invoice(
  p_card_id uuid,
  p_invoice_month date,
  p_account_id uuid,
  p_date date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  card_row public.credit_cards%rowtype;
  account_row public.bank_accounts%rowtype;
  v_month date := date_trunc('month', p_invoice_month)::date;
  v_total numeric(14,2);
  v_settlement uuid;
  v_transaction uuid;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('cartoes', 'settle') then
    raise exception 'Você não tem permissão para pagar faturas.';
  end if;

  -- Trava o cartão: dois cliques não pagam duas vezes
  select * into card_row
    from public.credit_cards
   where id = p_card_id and company_id = company
   for update;

  if not found then
    raise exception 'Cartão não encontrado.';
  end if;

  if p_date is null then
    raise exception 'Informe a data do pagamento.';
  end if;

  -- Só paga a fatura atual, as anteriores e a do mês seguinte (antecipação).
  -- Faturas mais de 1 mês à frente não podem ser baixadas.
  if card_row.closing_day is null or card_row.due_day is null then
    raise exception 'Informe o dia de fechamento e o de vencimento no cadastro do cartão.';
  end if;

  if v_month > (public.card_first_invoice(card_row.closing_day, card_row.due_day, public.today_br()) + interval '1 month')::date then
    raise exception 'Só é possível antecipar a fatura do mês seguinte. Faturas mais à frente ainda não podem ser pagas.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company;

  if not found then
    raise exception 'Conta bancária ou caixa não encontrado.';
  end if;

  select coalesce(sum(value), 0) into v_total
    from public.card_transactions
   where card_id = p_card_id and invoice_month = v_month and not settled;

  if v_total <= 0 then
    raise exception 'Não há nada em aberto nesta fatura.';
  end if;

  insert into public.card_settlements (
    user_id, company_id, card_id, bank_account_id, settlement_date, value, invoice_month, notes
  ) values (
    auth.uid(), company, p_card_id, p_account_id, p_date, v_total, v_month, nullif(btrim(p_notes), '')
  )
  returning id into v_settlement;

  -- Saída na conta/caixa (o caixa precisa estar aberto e com saldo: regras do caixa)
  insert into public.bank_transactions (
    user_id, company_id, bank_account_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), company, p_account_id, p_date,
    'Fatura ' || card_row.name || ' ' || to_char(v_month, 'MM/YYYY'),
    -v_total, 'card_settlement', 'card_invoice', v_settlement
  )
  returning id into v_transaction;

  update public.card_settlements
     set bank_transaction_id = v_transaction
   where id = v_settlement;

  update public.card_transactions
     set settled = true, settlement_id = v_settlement, updated_at = now()
   where card_id = p_card_id and invoice_month = v_month and not settled;

  return v_settlement;
end;
$$;

grant execute on function public.pay_card_invoice(uuid, date, uuid, date, text) to authenticated;
