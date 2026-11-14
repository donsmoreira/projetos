-- Renegociação com valor de ENTRADA
-- Rode DEPOIS de 20261114_lote_e_renegociacao.sql.
--
-- Ex.: contas somando R$ 1.500,00, entrada de R$ 350,00 → a entrada vira uma
-- conta "(entrada)" já baixada (na conta/caixa e data escolhidas, aparece no
-- extrato) e só os R$ 1.150,00 restantes são parcelados.
-- "Desfazer renegociação" estorna a entrada junto.

alter table public.payables
  add column if not exists down_payment boolean not null default false;

alter table public.receivables
  add column if not exists down_payment boolean not null default false;

drop function if exists public.renegotiate_payables(uuid[], integer, date, numeric, numeric, text, uuid, text, text);
drop function if exists public.renegotiate_receivables(uuid[], integer, date, numeric, numeric, text, uuid, text, text);

---------------------------------------------------------------------------
-- 1) PAGAR
---------------------------------------------------------------------------
create or replace function public.renegotiate_payables(
  p_payable_ids uuid[],
  p_installments integer,
  p_first_due date,
  p_increase numeric default 0,
  p_discount numeric default 0,
  p_description text default null,
  p_management_account_id uuid default null,
  p_notes text default null,
  p_category text default null,
  p_down_payment numeric default 0,
  p_down_account_id uuid default null,
  p_down_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  v_ids uuid[];
  v_count integer;
  v_parties integer;
  v_supplier uuid;
  v_base numeric;
  v_new_total numeric;
  v_down numeric := round(coalesce(p_down_payment, 0), 2);
  v_rest numeric;
  v_each numeric;
  v_first_value numeric;
  v_accounts integer;
  v_account uuid;
  v_category text;
  v_description text;
  v_notes text;
  v_reneg uuid := gen_random_uuid();
  v_group uuid := gen_random_uuid();
  v_creator uuid;
  v_down_id uuid;
  down_account public.bank_accounts%rowtype;
  i integer;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_pagar', 'create')
     or not public.has_module_permission('contas_pagar', 'update') then
    raise exception 'Você precisa das permissões Cadastrar e Alterar em Contas a Pagar para renegociar.';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_payable_ids) as x where x is not null;

  if v_ids is null then
    raise exception 'Marque as contas que serão renegociadas.';
  end if;

  if p_installments is null or p_installments < 1 or p_installments > 60 then
    raise exception 'Informe de 1 a 60 parcelas.';
  end if;

  if p_first_due is null then
    raise exception 'Informe o vencimento da primeira parcela.';
  end if;

  if coalesce(p_increase, 0) < 0 or coalesce(p_discount, 0) < 0 or v_down < 0 then
    raise exception 'Acréscimo, desconto e entrada não podem ser negativos.';
  end if;

  if v_down > 0 then
    if not public.has_module_permission('contas_pagar', 'settle') then
      raise exception 'Você precisa da permissão Baixar em Contas a Pagar para lançar a entrada.';
    end if;

    if p_down_date is null then
      raise exception 'Informe a data da entrada.';
    end if;

    select * into down_account
      from public.bank_accounts
     where id = p_down_account_id and company_id = company;

    if not found then
      raise exception 'Escolha a conta bancária ou o caixa da entrada.';
    end if;
  end if;

  perform 1 from public.payables
    where id = any (v_ids) and company_id = company
    order by id
    for update;

  select count(*), count(distinct supplier_id), min(supplier_id::text)::uuid,
         coalesce(sum(round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2)), 0),
         count(distinct management_account_id), min(management_account_id::text)::uuid
    into v_count, v_parties, v_supplier, v_base, v_accounts, v_account
    from public.payables
   where id = any (v_ids) and company_id = company and status = 'pendente';

  if v_count <> cardinality(v_ids) then
    raise exception 'Alguma conta marcada não foi encontrada ou não está mais pendente. Atualize a lista e tente de novo.';
  end if;

  if v_parties <> 1 then
    raise exception 'A renegociação é feita com um fornecedor só: marque contas do mesmo fornecedor.';
  end if;

  if exists (select 1 from public.payables where id = any (v_ids) and card_id is not null) then
    raise exception 'Contas de cartão não podem ser renegociadas aqui.';
  end if;

  v_new_total := round(v_base + coalesce(p_increase, 0) - coalesce(p_discount, 0), 2);

  if v_new_total <= 0 then
    raise exception 'O novo total precisa ser maior que zero.';
  end if;

  if v_down >= v_new_total then
    raise exception 'A entrada precisa ser menor que o novo total. Para quitar tudo, use a baixa.';
  end if;

  v_rest := v_new_total - v_down;

  if p_management_account_id is not null then
    v_account := p_management_account_id;
    v_category := nullif(btrim(p_category), '');
  elsif v_accounts <> 1 or exists (select 1 from public.payables where id = any (v_ids) and management_account_id is null) then
    v_account := null;
  end if;

  if v_account is not null and v_category is null then
    select category into v_category from public.payables
     where id = any (v_ids) and management_account_id = v_account limit 1;
  end if;

  select user_id into v_creator from public.payables where id = v_ids[1];

  v_description := coalesce(nullif(btrim(p_description), ''), 'Renegociação');

  select coalesce(nullif(btrim(p_notes), '') || E'\n', '') ||
         'Renegociação de: ' || string_agg(description, '; ' order by due_date, description)
    into v_notes
    from public.payables where id = any (v_ids);

  v_each := trunc(v_rest / p_installments, 2);
  v_first_value := v_rest - v_each * (p_installments - 1);

  -- Antigas primeiro (o gatilho de cadastro inativo confere por elas)
  update public.payables
     set status = 'renegociada',
         renegotiation_id = v_reneg,
         updated_at = now()
   where id = any (v_ids);

  -- Entrada: conta própria, já paga
  if v_down > 0 then
    insert into public.payables (
      user_id, company_id, supplier_id, description, category, management_account_id,
      original_value, interest, penalty, issue_date, due_date, notes, status,
      installment_group_id, installment_index, installment_count, renegotiated_from, down_payment
    ) values (
      coalesce(auth.uid(), v_creator), company, v_supplier,
      v_description || ' (entrada)', v_category, v_account,
      v_down, 0, 0, public.today_br(), p_down_date, v_notes, 'pendente',
      gen_random_uuid(), 1, 1, v_reneg, true
    )
    returning id into v_down_id;

    perform public.settle_payable_row(v_down_id, down_account, p_down_date, v_down, 'Entrada da renegociação', false, null);
  end if;

  for i in 1..p_installments loop
    insert into public.payables (
      user_id, company_id, supplier_id, description, category, management_account_id,
      original_value, interest, penalty, issue_date, due_date, notes, status,
      installment_group_id, installment_index, installment_count, renegotiated_from
    ) values (
      coalesce(auth.uid(), v_creator), company, v_supplier,
      case when p_installments > 1 then v_description || ' (' || i || '/' || p_installments || ')' else v_description end,
      v_category, v_account,
      case when i = 1 then v_first_value else v_each end, 0, 0,
      public.today_br(), (p_first_due + make_interval(months => i - 1))::date, v_notes, 'pendente',
      v_group, i, p_installments, v_reneg
    );
  end loop;

  return v_reneg;
end;
$$;

create or replace function public.undo_payables_renegotiation(
  p_renegotiation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  r record;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_pagar', 'update')
     or not public.has_module_permission('contas_pagar', 'delete') then
    raise exception 'Você precisa das permissões Alterar e Excluir em Contas a Pagar para desfazer a renegociação.';
  end if;

  perform 1 from public.payables
    where company_id = company
      and (renegotiation_id = p_renegotiation_id or renegotiated_from = p_renegotiation_id)
    order by id
    for update;

  if not exists (select 1 from public.payables
                  where company_id = company and renegotiation_id = p_renegotiation_id
                    and status = 'renegociada') then
    raise exception 'Renegociação não encontrada.';
  end if;

  if exists (select 1 from public.payables
              where company_id = company and renegotiated_from = p_renegotiation_id
                and not down_payment and status <> 'pendente') then
    raise exception 'Alguma parcela da renegociação já foi paga ou renegociada de novo. Estorne ou desfaça isso primeiro.';
  end if;

  if exists (select 1 from public.payables
              where company_id = company and renegotiated_from = p_renegotiation_id
                and down_payment and status = 'renegociada') then
    raise exception 'A entrada desta renegociação foi renegociada de novo. Desfaça isso primeiro.';
  end if;

  if exists (select 1 from public.payables p
              where p.company_id = company
                and p.partial_of in (select id from public.payables
                                      where company_id = company and renegotiated_from = p_renegotiation_id)) then
    raise exception 'Alguma parcela da renegociação teve baixa parcial. Estorne essa baixa primeiro.';
  end if;

  -- Entrada paga: estorna (apaga a saída do extrato)
  for r in
    select id from public.payables
     where company_id = company and renegotiated_from = p_renegotiation_id
       and down_payment and status = 'pago'
  loop
    perform public.unsettle_payable_row(r.id);
  end loop;

  delete from public.payables
   where company_id = company and renegotiated_from = p_renegotiation_id;

  update public.payables
     set status = 'pendente',
         renegotiation_id = null,
         updated_at = now()
   where company_id = company and renegotiation_id = p_renegotiation_id;
end;
$$;

---------------------------------------------------------------------------
-- 2) RECEBER
---------------------------------------------------------------------------
create or replace function public.renegotiate_receivables(
  p_receivable_ids uuid[],
  p_installments integer,
  p_first_due date,
  p_increase numeric default 0,
  p_discount numeric default 0,
  p_description text default null,
  p_management_account_id uuid default null,
  p_notes text default null,
  p_category text default null,
  p_down_payment numeric default 0,
  p_down_account_id uuid default null,
  p_down_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  v_ids uuid[];
  v_count integer;
  v_parties integer;
  v_client uuid;
  v_base numeric;
  v_new_total numeric;
  v_down numeric := round(coalesce(p_down_payment, 0), 2);
  v_rest numeric;
  v_each numeric;
  v_first_value numeric;
  v_accounts integer;
  v_account uuid;
  v_category text;
  v_description text;
  v_notes text;
  v_reneg uuid := gen_random_uuid();
  v_group uuid := gen_random_uuid();
  v_creator uuid;
  v_down_id uuid;
  down_account public.bank_accounts%rowtype;
  i integer;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_receber', 'create')
     or not public.has_module_permission('contas_receber', 'update') then
    raise exception 'Você precisa das permissões Cadastrar e Alterar em Contas a Receber para renegociar.';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_receivable_ids) as x where x is not null;

  if v_ids is null then
    raise exception 'Marque as contas que serão renegociadas.';
  end if;

  if p_installments is null or p_installments < 1 or p_installments > 60 then
    raise exception 'Informe de 1 a 60 parcelas.';
  end if;

  if p_first_due is null then
    raise exception 'Informe o vencimento da primeira parcela.';
  end if;

  if coalesce(p_increase, 0) < 0 or coalesce(p_discount, 0) < 0 or v_down < 0 then
    raise exception 'Acréscimo, desconto e entrada não podem ser negativos.';
  end if;

  if v_down > 0 then
    if not public.has_module_permission('contas_receber', 'settle') then
      raise exception 'Você precisa da permissão Baixar em Contas a Receber para lançar a entrada.';
    end if;

    if p_down_date is null then
      raise exception 'Informe a data da entrada.';
    end if;

    select * into down_account
      from public.bank_accounts
     where id = p_down_account_id and company_id = company;

    if not found then
      raise exception 'Escolha a conta bancária ou o caixa da entrada.';
    end if;
  end if;

  perform 1 from public.receivables
    where id = any (v_ids) and company_id = company
    order by id
    for update;

  select count(*), count(distinct client_id), min(client_id::text)::uuid,
         coalesce(sum(round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2)), 0),
         count(distinct management_account_id), min(management_account_id::text)::uuid
    into v_count, v_parties, v_client, v_base, v_accounts, v_account
    from public.receivables
   where id = any (v_ids) and company_id = company and status = 'pendente';

  if v_count <> cardinality(v_ids) then
    raise exception 'Alguma conta marcada não foi encontrada ou não está mais pendente. Atualize a lista e tente de novo.';
  end if;

  if v_parties <> 1 then
    raise exception 'A renegociação é feita com um cliente só: marque contas do mesmo cliente.';
  end if;

  v_new_total := round(v_base + coalesce(p_increase, 0) - coalesce(p_discount, 0), 2);

  if v_new_total <= 0 then
    raise exception 'O novo total precisa ser maior que zero.';
  end if;

  if v_down >= v_new_total then
    raise exception 'A entrada precisa ser menor que o novo total. Para quitar tudo, use a baixa.';
  end if;

  v_rest := v_new_total - v_down;

  if p_management_account_id is not null then
    v_account := p_management_account_id;
    v_category := nullif(btrim(p_category), '');
  elsif v_accounts <> 1 or exists (select 1 from public.receivables where id = any (v_ids) and management_account_id is null) then
    v_account := null;
  end if;

  if v_account is not null and v_category is null then
    select category into v_category from public.receivables
     where id = any (v_ids) and management_account_id = v_account limit 1;
  end if;

  select user_id into v_creator from public.receivables where id = v_ids[1];

  v_description := coalesce(nullif(btrim(p_description), ''), 'Renegociação');

  select coalesce(nullif(btrim(p_notes), '') || E'\n', '') ||
         'Renegociação de: ' || string_agg(description, '; ' order by due_date, description)
    into v_notes
    from public.receivables where id = any (v_ids);

  v_each := trunc(v_rest / p_installments, 2);
  v_first_value := v_rest - v_each * (p_installments - 1);

  update public.receivables
     set status = 'renegociada',
         renegotiation_id = v_reneg,
         updated_at = now()
   where id = any (v_ids);

  if v_down > 0 then
    insert into public.receivables (
      user_id, company_id, client_id, description, category, management_account_id,
      original_value, interest, penalty, issue_date, due_date, notes, status,
      installment_group_id, installment_index, installment_count, renegotiated_from, down_payment
    ) values (
      coalesce(auth.uid(), v_creator), company, v_client,
      v_description || ' (entrada)', v_category, v_account,
      v_down, 0, 0, public.today_br(), p_down_date, v_notes, 'pendente',
      gen_random_uuid(), 1, 1, v_reneg, true
    )
    returning id into v_down_id;

    perform public.settle_receivable_row(v_down_id, down_account, p_down_date, v_down, 'Entrada da renegociação', false, null);
  end if;

  for i in 1..p_installments loop
    insert into public.receivables (
      user_id, company_id, client_id, description, category, management_account_id,
      original_value, interest, penalty, issue_date, due_date, notes, status,
      installment_group_id, installment_index, installment_count, renegotiated_from
    ) values (
      coalesce(auth.uid(), v_creator), company, v_client,
      case when p_installments > 1 then v_description || ' (' || i || '/' || p_installments || ')' else v_description end,
      v_category, v_account,
      case when i = 1 then v_first_value else v_each end, 0, 0,
      public.today_br(), (p_first_due + make_interval(months => i - 1))::date, v_notes, 'pendente',
      v_group, i, p_installments, v_reneg
    );
  end loop;

  return v_reneg;
end;
$$;

create or replace function public.undo_receivables_renegotiation(
  p_renegotiation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  r record;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_receber', 'update')
     or not public.has_module_permission('contas_receber', 'delete') then
    raise exception 'Você precisa das permissões Alterar e Excluir em Contas a Receber para desfazer a renegociação.';
  end if;

  perform 1 from public.receivables
    where company_id = company
      and (renegotiation_id = p_renegotiation_id or renegotiated_from = p_renegotiation_id)
    order by id
    for update;

  if not exists (select 1 from public.receivables
                  where company_id = company and renegotiation_id = p_renegotiation_id
                    and status = 'renegociada') then
    raise exception 'Renegociação não encontrada.';
  end if;

  if exists (select 1 from public.receivables
              where company_id = company and renegotiated_from = p_renegotiation_id
                and not down_payment and status <> 'pendente') then
    raise exception 'Alguma parcela da renegociação já foi recebida ou renegociada de novo. Estorne ou desfaça isso primeiro.';
  end if;

  if exists (select 1 from public.receivables
              where company_id = company and renegotiated_from = p_renegotiation_id
                and down_payment and status = 'renegociada') then
    raise exception 'A entrada desta renegociação foi renegociada de novo. Desfaça isso primeiro.';
  end if;

  if exists (select 1 from public.receivables p
              where p.company_id = company
                and p.partial_of in (select id from public.receivables
                                      where company_id = company and renegotiated_from = p_renegotiation_id)) then
    raise exception 'Alguma parcela da renegociação teve baixa parcial. Estorne essa baixa primeiro.';
  end if;

  -- Entrada recebida: estorna (apaga a entrada do extrato)
  for r in
    select id from public.receivables
     where company_id = company and renegotiated_from = p_renegotiation_id
       and down_payment and status = 'recebido'
  loop
    perform public.unsettle_receivable_row(r.id);
  end loop;

  delete from public.receivables
   where company_id = company and renegotiated_from = p_renegotiation_id;

  update public.receivables
     set status = 'pendente',
         renegotiation_id = null,
         updated_at = now()
   where company_id = company and renegotiation_id = p_renegotiation_id;
end;
$$;

---------------------------------------------------------------------------
-- 3) Quem pode chamar
---------------------------------------------------------------------------
revoke all on function public.renegotiate_payables(uuid[], integer, date, numeric, numeric, text, uuid, text, text, numeric, uuid, date) from public, anon;
revoke all on function public.renegotiate_receivables(uuid[], integer, date, numeric, numeric, text, uuid, text, text, numeric, uuid, date) from public, anon;
revoke all on function public.undo_payables_renegotiation(uuid) from public, anon;
revoke all on function public.undo_receivables_renegotiation(uuid) from public, anon;

grant execute on function public.renegotiate_payables(uuid[], integer, date, numeric, numeric, text, uuid, text, text, numeric, uuid, date) to authenticated;
grant execute on function public.renegotiate_receivables(uuid[], integer, date, numeric, numeric, text, uuid, text, text, numeric, uuid, date) to authenticated;
grant execute on function public.undo_payables_renegotiation(uuid) to authenticated;
grant execute on function public.undo_receivables_renegotiation(uuid) to authenticated;

notify pgrst, 'reload schema';
