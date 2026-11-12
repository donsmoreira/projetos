-- Cartão de crédito: compras parceladas, faturas, pagamento (baixa) e estorno.
--
-- * Compra: valor total em N parcelas. A 1ª parcela cai na fatura certa pelo dia
--   de fechamento (compra no dia do fechamento ou depois vai para a fatura
--   seguinte); as outras, nas faturas dos meses seguintes.
-- * Fatura = mês do vencimento. Fecha no dia de fechamento e vence no dia de
--   vencimento do cartão.
-- * Pagar a fatura: sai da conta bancária ou do caixa, numa operação só.
--   Pode ser estornado.
-- * Tela Cartões ganha a permissão "Baixar" (pagar e estornar fatura). Quem já
--   pode baixar em Contas a Pagar recebe a mesma permissão nos Cartões.
-- * Contas a pagar NÃO aceitam pagamento com cartão.
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

---------------------------------------------------------------------------
-- 1) CAMPOS NOVOS
---------------------------------------------------------------------------
alter table public.card_transactions
  add column if not exists invoice_month date,
  add column if not exists purchase_total numeric(14,2),
  add column if not exists management_account_id uuid references public.management_accounts (id) on delete set null;

alter table public.card_settlements
  add column if not exists invoice_month date,
  add column if not exists notes text;

create index if not exists card_transactions_invoice_idx
  on public.card_transactions (card_id, invoice_month);

create index if not exists card_settlements_invoice_idx
  on public.card_settlements (card_id, invoice_month);

-- Contas a pagar não são pagas com cartão (as linhas antigas não são conferidas)
alter table public.payables drop constraint if exists payables_payment_method_check;
alter table public.payables add constraint payables_payment_method_check
  check (payment_method is null or payment_method in ('banco', 'caixa')) not valid;

---------------------------------------------------------------------------
-- 2) DATAS DA FATURA
---------------------------------------------------------------------------
-- Dia do mês, sem passar do último dia (ex.: 31 em fevereiro vira 28/29)
create or replace function public.month_day(p_month date, p_day integer)
returns date
language sql
immutable
as $$
  select date_trunc('month', p_month)::date
       + (least(p_day, extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::integer) - 1)
$$;

-- Fechamento da fatura que vence no mês p_invoice_month
create or replace function public.card_closing_date(p_closing_day integer, p_due_day integer, p_invoice_month date)
returns date
language sql
immutable
as $$
  select public.month_day(
    case when p_closing_day < p_due_day
         then date_trunc('month', p_invoice_month)::date
         else (date_trunc('month', p_invoice_month) - interval '1 month')::date
    end,
    p_closing_day
  )
$$;

-- Primeira fatura (mês do vencimento) em que entra uma compra feita em p_date
create or replace function public.card_first_invoice(p_closing_day integer, p_due_day integer, p_date date)
returns date
language plpgsql
immutable
as $$
declare
  candidate date := (date_trunc('month', p_date) - interval '1 month')::date;
  i integer;
begin
  for i in 0 .. 4 loop
    if p_date < public.card_closing_date(p_closing_day, p_due_day, candidate) then
      return candidate;
    end if;
    candidate := (candidate + interval '1 month')::date;
  end loop;

  return candidate;
end;
$$;

---------------------------------------------------------------------------
-- 3) LANÇAR COMPRA (parcelada)
---------------------------------------------------------------------------
create or replace function public.create_card_purchase(
  p_card_id uuid,
  p_date date,
  p_description text,
  p_total numeric,
  p_installments integer,
  p_management_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  card_row public.credit_cards%rowtype;
  v_total numeric(14,2) := round(coalesce(p_total, 0), 2);
  v_count integer := coalesce(p_installments, 1);
  v_part numeric(14,2);
  v_first numeric(14,2);
  v_first_invoice date;
  v_group uuid := gen_random_uuid();
  i integer;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('cartoes', 'create') then
    raise exception 'Você não tem permissão para lançar compras no cartão.';
  end if;

  select * into card_row
    from public.credit_cards
   where id = p_card_id and company_id = company;

  if not found then
    raise exception 'Cartão não encontrado.';
  end if;

  if card_row.active is false then
    raise exception 'Este cartão está desativado.';
  end if;

  if card_row.closing_day is null or card_row.due_day is null then
    raise exception 'Informe o dia de fechamento e o dia de vencimento no cadastro do cartão.';
  end if;

  if nullif(btrim(p_description), '') is null then
    raise exception 'Descreva a compra.';
  end if;

  if p_date is null then
    raise exception 'Informe a data da compra.';
  end if;

  if v_total <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;

  if v_count < 1 or v_count > 48 then
    raise exception 'O número de parcelas vai de 1 a 48.';
  end if;

  if p_management_account_id is not null and not exists (
    select 1 from public.management_accounts
     where id = p_management_account_id and company_id = company and type = 'despesa'
  ) then
    raise exception 'Escolha uma conta gerencial de despesa.';
  end if;

  -- Parcelas iguais; os centavos que sobram vão na 1ª
  v_part := trunc(v_total / v_count, 2);
  v_first := v_total - v_part * (v_count - 1);

  if v_part <= 0 then
    raise exception 'Valor pequeno demais para tantas parcelas.';
  end if;

  v_first_invoice := public.card_first_invoice(card_row.closing_day, card_row.due_day, p_date);

  for i in 1 .. v_count loop
    insert into public.card_transactions (
      user_id, company_id, card_id, transaction_date, description, value, settled,
      installment_group_id, installment_index, installment_count,
      invoice_month, purchase_total, management_account_id
    ) values (
      auth.uid(), company, p_card_id, p_date, btrim(p_description),
      case when i = 1 then v_first else v_part end, false,
      v_group, i, v_count,
      (v_first_invoice + make_interval(months => i - 1))::date, v_total, p_management_account_id
    );
  end loop;

  return v_group;
end;
$$;

---------------------------------------------------------------------------
-- 4) EXCLUIR COMPRA (todas as parcelas; só se nenhuma estiver em fatura paga)
---------------------------------------------------------------------------
create or replace function public.delete_card_purchase(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
begin
  if not public.has_module_permission('cartoes', 'delete') then
    raise exception 'Você não tem permissão para excluir compras do cartão.';
  end if;

  if not exists (
    select 1 from public.card_transactions where installment_group_id = p_group_id and company_id = company
  ) then
    raise exception 'Compra não encontrada.';
  end if;

  if exists (
    select 1 from public.card_transactions
     where installment_group_id = p_group_id and company_id = company and settled
  ) then
    raise exception 'Esta compra tem parcela em fatura já paga. Estorne o pagamento da fatura antes.';
  end if;

  delete from public.card_transactions
   where installment_group_id = p_group_id and company_id = company;
end;
$$;

---------------------------------------------------------------------------
-- 5) PAGAR FATURA (baixa) e ESTORNAR
---------------------------------------------------------------------------
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

create or replace function public.reverse_card_payment(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  settlement_row public.card_settlements%rowtype;
begin
  if not public.has_module_permission('cartoes', 'settle') then
    raise exception 'Você não tem permissão para estornar faturas.';
  end if;

  select * into settlement_row
    from public.card_settlements
   where id = p_settlement_id and company_id = company
   for update;

  if not found then
    raise exception 'Pagamento de fatura não encontrado.';
  end if;

  -- Desfaz a saída da conta/caixa (regras do caixa valem: turno fechado não deixa)
  delete from public.bank_transactions
   where id = settlement_row.bank_transaction_id
      or (reference_type = 'card_invoice' and reference_id = settlement_row.id);

  update public.card_transactions
     set settled = false, settlement_id = null, updated_at = now()
   where settlement_id = settlement_row.id;

  delete from public.card_settlements where id = settlement_row.id;
end;
$$;

---------------------------------------------------------------------------
-- 6) PERMISSÃO "BAIXAR" NA TELA CARTÕES
---------------------------------------------------------------------------
-- Quem já baixa em Contas a Pagar, baixa também nos Cartões
update public.company_member_permissions c
   set can_settle = p.can_settle
  from public.company_member_permissions p
 where c.module = 'cartoes'
   and p.module = 'contas_pagar'
   and p.company_id = c.company_id
   and p.user_id = c.user_id;

update public.company_invites
   set module_permissions = jsonb_set(
         module_permissions,
         '{cartoes,settle}',
         to_jsonb(coalesce((module_permissions #>> '{contas_pagar,settle}')::boolean, false)),
         true
       )
 where used_at is null and module_permissions ? 'cartoes';

create or replace function public.apply_module_permissions(
  p_company_id uuid,
  p_user_id uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.company_member_permissions
   where company_id = p_company_id and user_id = p_user_id;

  insert into public.company_member_permissions (
    company_id, user_id, module, can_view, can_create, can_update, can_delete, can_settle
  )
  select p_company_id, p_user_id, e.key,
         coalesce((e.value->>'view')::boolean, false),
         e.key not in ('painel', 'relatorios') and coalesce((e.value->>'create')::boolean, false),
         e.key not in ('painel', 'relatorios') and coalesce((e.value->>'update')::boolean, false),
         e.key not in ('painel', 'relatorios') and coalesce((e.value->>'delete')::boolean, false),
         e.key in ('contas_pagar', 'contas_receber', 'cartoes') and coalesce((e.value->>'settle')::boolean, false)
    from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) e
   where e.key in (
     'painel', 'relatorios', 'clientes', 'fornecedores', 'contas_pagar', 'contas_receber',
     'caixa', 'contas_bancarias', 'cartoes', 'contas_gerenciais', 'agenda'
   );

  update public.company_members m
     set can_create = m.is_admin or exists (select 1 from public.company_member_permissions p where p.company_id = m.company_id and p.user_id = m.user_id and p.can_create),
         can_update = m.is_admin or exists (select 1 from public.company_member_permissions p where p.company_id = m.company_id and p.user_id = m.user_id and p.can_update),
         can_delete = m.is_admin or exists (select 1 from public.company_member_permissions p where p.company_id = m.company_id and p.user_id = m.user_id and p.can_delete),
         can_settle = m.is_admin or exists (select 1 from public.company_member_permissions p where p.company_id = m.company_id and p.user_id = m.user_id and p.can_settle)
   where m.company_id = p_company_id and m.user_id = p_user_id;
end;
$$;

revoke all on function public.apply_module_permissions(uuid, uuid, jsonb) from public, anon, authenticated;

---------------------------------------------------------------------------
-- 7) QUEM PODE CHAMAR
---------------------------------------------------------------------------
do $$
declare
  f text;
  fns text[] := array[
    'public.create_card_purchase(uuid, date, text, numeric, integer, uuid)',
    'public.delete_card_purchase(uuid)',
    'public.pay_card_invoice(uuid, date, uuid, date, text)',
    'public.reverse_card_payment(uuid)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

grant all on public.card_transactions, public.card_settlements to service_role;

notify pgrst, 'reload schema';
