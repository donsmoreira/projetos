-- Baixa em lote e renegociação (Contas a Pagar e Contas a Receber)
-- Rode DEPOIS de 20261114_baixa_parcial.sql.
--
-- BAIXA EM LOTE: marca várias contas e baixa todas numa operação só.
--   * Valor igual à soma: cada conta fica quitada pelo seu valor.
--   * Valor menor: só com contas do MESMO fornecedor/cliente.
--       - baixa parcial: o dinheiro quita as contas da mais antiga para a mais
--         nova; a que ficar pela metade gera o "(restante)"; as que não
--         receberem nada continuam pendentes;
--       - quitar com desconto: todas ficam quitadas e o valor é dividido
--         proporcionalmente (centavos que sobram na primeira).
--   * Valor maior que a soma: não aceito.
--   Cada conta ganha a sua linha no extrato (para os relatórios por conta
--   gerencial continuarem certos), todas com o mesmo batch_id.
--   Estornar uma conta do lote estorna o lote inteiro.
--
-- RENEGOCIAÇÃO: contas pendentes do mesmo fornecedor/cliente (de contas
--   diferentes, se quiser) viram "renegociada" e o sistema cria as novas
--   (à vista ou parceladas), com acréscimo ou desconto.
--   "Desfazer renegociação" apaga as novas e reabre as antigas, enquanto
--   nenhuma das novas tiver sido baixada ou renegociada de novo.

---------------------------------------------------------------------------
-- 1) Status "renegociada" e colunas de ligação
---------------------------------------------------------------------------
alter table public.payables drop constraint if exists payables_status_check;
alter table public.payables add constraint payables_status_check
  check (status in ('pendente', 'pago', 'renegociada'));

alter table public.receivables drop constraint if exists receivables_status_check;
alter table public.receivables add constraint receivables_status_check
  check (status in ('pendente', 'recebido', 'renegociada'));

alter table public.payables
  add column if not exists batch_id uuid,
  add column if not exists renegotiation_id uuid,
  add column if not exists renegotiated_from uuid;

alter table public.receivables
  add column if not exists batch_id uuid,
  add column if not exists renegotiation_id uuid,
  add column if not exists renegotiated_from uuid;

create index if not exists payables_batch_idx on public.payables (batch_id);
create index if not exists payables_renegotiation_idx on public.payables (renegotiation_id);
create index if not exists payables_renegotiated_from_idx on public.payables (renegotiated_from);
create index if not exists receivables_batch_idx on public.receivables (batch_id);
create index if not exists receivables_renegotiation_idx on public.receivables (renegotiation_id);
create index if not exists receivables_renegotiated_from_idx on public.receivables (renegotiated_from);

---------------------------------------------------------------------------
-- 2) Cadastro inativo: restante de baixa parcial e parcelas de renegociação
--    podem ser criados (é a mesma dívida, não um lançamento novo)
---------------------------------------------------------------------------
create or replace function public.block_inactive_party()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'payables' then
    if tg_op = 'INSERT'
       and ((new.partial_of is not null
             and exists (select 1 from public.payables
                          where id = new.partial_of and company_id = new.company_id
                            and supplier_id is not distinct from new.supplier_id))
         or (new.renegotiated_from is not null
             and exists (select 1 from public.payables
                          where renegotiation_id = new.renegotiated_from and company_id = new.company_id
                            and supplier_id is not distinct from new.supplier_id))) then
      return new;
    end if;

    if new.supplier_id is not null
       and (tg_op = 'INSERT' or new.supplier_id is distinct from old.supplier_id)
       and exists (select 1 from public.suppliers where id = new.supplier_id and not active) then
      raise exception 'Este fornecedor está inativo. Reative o cadastro para lançar.';
    end if;

  elsif tg_table_name = 'receivables' then
    if tg_op = 'INSERT'
       and ((new.partial_of is not null
             and exists (select 1 from public.receivables
                          where id = new.partial_of and company_id = new.company_id
                            and client_id is not distinct from new.client_id))
         or (new.renegotiated_from is not null
             and exists (select 1 from public.receivables
                          where renegotiation_id = new.renegotiated_from and company_id = new.company_id
                            and client_id is not distinct from new.client_id))) then
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
-- 3) PAGAR: peças internas (só o banco chama)
---------------------------------------------------------------------------

-- Baixa UMA conta já travada (for update) e conferida. Usada pela baixa
-- normal e pela baixa em lote.
create or replace function public.settle_payable_row(
  p_id uuid,
  p_account public.bank_accounts,
  p_date date,
  p_value numeric,
  p_notes text,
  p_keep_rest_open boolean,
  p_batch uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payables%rowtype;
  transaction_id uuid;
  v_value numeric := round(p_value, 2);
  v_total numeric;
  v_left numeric;
  v_take numeric;
  v_original numeric;
  v_penalty numeric;
  v_interest numeric;
begin
  select * into r from public.payables where id = p_id;

  v_original := round(coalesce(r.original_value, 0), 2);
  v_penalty  := round(coalesce(r.penalty, 0), 2);
  v_interest := round(coalesce(r.interest, 0), 2);
  v_total    := v_original + v_penalty + v_interest;

  if coalesce(p_keep_rest_open, true) and v_value < v_total then
    if r.card_id is not null then
      raise exception 'Esta conta não aceita pagamento parcial.';
    end if;

    v_left := v_total - v_value;

    insert into public.payables (
      user_id, company_id, supplier_id, description, category, management_account_id,
      original_value, interest, penalty, issue_date, due_date, notes, status,
      installment_group_id, installment_index, installment_count, partial_of
    ) values (
      r.user_id, r.company_id, r.supplier_id,
      case when r.description like '% (restante)' then r.description else r.description || ' (restante)' end,
      r.category, r.management_account_id,
      v_left, 0, 0, r.issue_date, r.due_date, r.notes, 'pendente',
      r.installment_group_id, r.installment_index, r.installment_count, r.id
    );

    v_take := least(v_original, v_left); v_original := v_original - v_take; v_left := v_left - v_take;
    v_take := least(v_penalty,  v_left); v_penalty  := v_penalty  - v_take; v_left := v_left - v_take;
    v_take := least(v_interest, v_left); v_interest := v_interest - v_take; v_left := v_left - v_take;
  end if;

  insert into public.bank_transactions (
    user_id, company_id, bank_account_id, payable_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), r.company_id, p_account.id, r.id, p_date,
    case when p_batch is null then 'Pagamento: ' else 'Pagamento em lote: ' end || r.description,
    -v_value, 'payable_payment', 'payable', r.id
  )
  returning id into transaction_id;

  update public.payables
     set status = 'pago',
         original_value = v_original,
         penalty = v_penalty,
         interest = v_interest,
         payment_method = case when p_account.account_type = 'caixa' then 'caixa' else 'banco' end,
         payment_date = p_date,
         paid_value = v_value,
         payment_notes = nullif(btrim(p_notes), ''),
         bank_account_id = p_account.id,
         bank_transaction_id = transaction_id,
         batch_id = p_batch,
         updated_at = now()
   where id = r.id;
end;
$$;

-- Estorna UMA conta paga (junta o restante de volta, se houver)
create or replace function public.unsettle_payable_row(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payables%rowtype;
  rest_row public.payables%rowtype;
begin
  select * into r from public.payables where id = p_id for update;

  select * into rest_row from public.payables where partial_of = p_id for update;

  if found then
    if rest_row.status <> 'pendente' then
      raise exception 'O restante da conta "%" já foi pago ou renegociado. Estorne ou desfaça primeiro o restante.', r.description;
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
         batch_id = null,
         updated_at = now()
   where id = p_id;

  if r.bank_transaction_id is not null then
    delete from public.bank_transactions where id = r.bank_transaction_id;
  end if;
end;
$$;

---------------------------------------------------------------------------
-- 4) PAGAR: funções chamadas pela tela
---------------------------------------------------------------------------
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
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_pagar', 'settle') then
    raise exception 'Você não tem permissão para baixar contas nesta empresa.';
  end if;

  if p_value is null or round(p_value, 2) <= 0 then
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
    raise exception 'Esta conta não está pendente.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company;

  if not found then
    raise exception 'Conta bancária ou caixa não encontrado.';
  end if;

  perform public.settle_payable_row(p_payable_id, account_row, p_date, p_value, p_notes, p_keep_rest_open, null);
end;
$$;

create or replace function public.pay_payables_batch(
  p_payable_ids uuid[],
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
  account_row public.bank_accounts%rowtype;
  r record;
  v_ids uuid[];
  v_count integer;
  v_parties integer;
  v_total numeric;
  v_value numeric := round(p_value, 2);
  v_left numeric;
  v_row_total numeric;
  v_share numeric;
  v_shares numeric := 0;
  v_first uuid;
  v_batch uuid := gen_random_uuid();
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_pagar', 'settle') then
    raise exception 'Você não tem permissão para baixar contas nesta empresa.';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_payable_ids) as x where x is not null;

  if v_ids is null or cardinality(v_ids) < 2 then
    raise exception 'Marque pelo menos duas contas para baixar em lote.';
  end if;

  if p_value is null or v_value <= 0 then
    raise exception 'Informe um valor pago maior que zero.';
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

  -- Trava todas as contas marcadas
  perform 1 from public.payables
    where id = any (v_ids) and company_id = company
    order by id
    for update;

  select count(*), count(distinct supplier_id),
         coalesce(sum(round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2)), 0)
    into v_count, v_parties, v_total
    from public.payables
   where id = any (v_ids) and company_id = company and status = 'pendente';

  if v_count <> cardinality(v_ids) then
    raise exception 'Alguma conta marcada não foi encontrada ou não está mais pendente. Atualize a lista e tente de novo.';
  end if;

  if exists (select 1 from public.payables where id = any (v_ids) and card_id is not null) then
    raise exception 'Contas de cartão não podem ser baixadas em lote.';
  end if;

  if v_value > v_total then
    raise exception 'O valor pago (R$ %) é maior que a soma das contas marcadas (R$ %).',
      translate(to_char(v_value, 'FM999,999,990.00'), ',.', '.,'),
      translate(to_char(v_total, 'FM999,999,990.00'), ',.', '.,');
  end if;

  if v_value < v_total and v_parties > 1 then
    raise exception 'Baixa com valor menor que o total só é permitida com contas do mesmo fornecedor.';
  end if;

  if v_value = v_total then
    -- Tudo quitado, cada uma pelo seu valor
    for r in
      select id, round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2) as total
        from public.payables where id = any (v_ids)
       order by due_date, created_at, id
    loop
      perform public.settle_payable_row(r.id, account_row, p_date, r.total, p_notes, false, v_batch);
    end loop;

  elsif coalesce(p_keep_rest_open, true) then
    -- Baixa parcial: da mais antiga para a mais nova
    v_left := v_value;

    for r in
      select id, round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2) as total
        from public.payables where id = any (v_ids)
       order by due_date, created_at, id
    loop
      exit when v_left <= 0;
      v_row_total := r.total;

      if v_row_total <= 0 then
        continue;
      end if;

      perform public.settle_payable_row(r.id, account_row, p_date, least(v_left, v_row_total), p_notes, true, v_batch);
      v_left := v_left - least(v_left, v_row_total);
    end loop;

  else
    -- Quitar com desconto: valor dividido proporcionalmente
    for r in
      select id, round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2) as total
        from public.payables where id = any (v_ids)
       order by due_date, created_at, id
    loop
      if v_first is null then
        v_first := r.id;
      else
        v_share := case when v_total > 0 then trunc(r.total * v_value / v_total, 2) else 0 end;

        if v_share <= 0 then
          raise exception 'O desconto é grande demais para dividir entre as contas marcadas.';
        end if;

        v_shares := v_shares + v_share;
        perform public.settle_payable_row(r.id, account_row, p_date, v_share, p_notes, false, v_batch);
      end if;
    end loop;

    -- A primeira fica com o que sobrou (inclui os centavos)
    if v_value - v_shares <= 0 then
      raise exception 'O desconto é grande demais para dividir entre as contas marcadas.';
    end if;

    perform public.settle_payable_row(v_first, account_row, p_date, v_value - v_shares, p_notes, false, v_batch);
  end if;
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
  r record;
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

  if payable_row.batch_id is null then
    perform public.unsettle_payable_row(p_payable_id);
  else
    -- Pago em lote: estorna o lote inteiro
    for r in
      select id from public.payables
       where batch_id = payable_row.batch_id and company_id = company and status = 'pago'
       order by id
    loop
      perform public.unsettle_payable_row(r.id);
    end loop;
  end if;
end;
$$;

create or replace function public.renegotiate_payables(
  p_payable_ids uuid[],
  p_installments integer,
  p_first_due date,
  p_increase numeric default 0,
  p_discount numeric default 0,
  p_description text default null,
  p_management_account_id uuid default null,
  p_notes text default null,
  p_category text default null
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

  if coalesce(p_increase, 0) < 0 or coalesce(p_discount, 0) < 0 then
    raise exception 'Acréscimo e desconto não podem ser negativos.';
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

  -- Conta gerencial: a escolhida; senão a das contas antigas, se todas usarem a mesma
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

  v_each := trunc(v_new_total / p_installments, 2);
  v_first_value := v_new_total - v_each * (p_installments - 1);

  -- Antigas primeiro (o gatilho de cadastro inativo confere por elas)
  update public.payables
     set status = 'renegociada',
         renegotiation_id = v_reneg,
         updated_at = now()
   where id = any (v_ids);

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
                and status <> 'pendente') then
    raise exception 'Alguma parcela da renegociação já foi paga ou renegociada de novo. Estorne ou desfaça isso primeiro.';
  end if;

  if exists (select 1 from public.payables p
              where p.company_id = company
                and p.partial_of in (select id from public.payables
                                      where company_id = company and renegotiated_from = p_renegotiation_id)) then
    raise exception 'Alguma parcela da renegociação teve baixa parcial. Estorne essa baixa primeiro.';
  end if;

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
-- 5) RECEBER: peças internas (só o banco chama)
---------------------------------------------------------------------------
create or replace function public.settle_receivable_row(
  p_id uuid,
  p_account public.bank_accounts,
  p_date date,
  p_value numeric,
  p_notes text,
  p_keep_rest_open boolean,
  p_batch uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.receivables%rowtype;
  transaction_id uuid;
  v_value numeric := round(p_value, 2);
  v_total numeric;
  v_left numeric;
  v_take numeric;
  v_original numeric;
  v_penalty numeric;
  v_interest numeric;
begin
  select * into r from public.receivables where id = p_id;

  v_original := round(coalesce(r.original_value, 0), 2);
  v_penalty  := round(coalesce(r.penalty, 0), 2);
  v_interest := round(coalesce(r.interest, 0), 2);
  v_total    := v_original + v_penalty + v_interest;

  if coalesce(p_keep_rest_open, true) and v_value < v_total then
    v_left := v_total - v_value;

    insert into public.receivables (
      user_id, company_id, client_id, description, category, management_account_id,
      original_value, interest, penalty, issue_date, due_date, notes, status,
      installment_group_id, installment_index, installment_count, partial_of
    ) values (
      r.user_id, r.company_id, r.client_id,
      case when r.description like '% (restante)' then r.description else r.description || ' (restante)' end,
      r.category, r.management_account_id,
      v_left, 0, 0, r.issue_date, r.due_date, r.notes, 'pendente',
      r.installment_group_id, r.installment_index, r.installment_count, r.id
    );

    v_take := least(v_original, v_left); v_original := v_original - v_take; v_left := v_left - v_take;
    v_take := least(v_penalty,  v_left); v_penalty  := v_penalty  - v_take; v_left := v_left - v_take;
    v_take := least(v_interest, v_left); v_interest := v_interest - v_take; v_left := v_left - v_take;
  end if;

  insert into public.bank_transactions (
    user_id, company_id, bank_account_id, receivable_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), r.company_id, p_account.id, r.id, p_date,
    case when p_batch is null then 'Recebimento: ' else 'Recebimento em lote: ' end || r.description,
    v_value, 'receivable_receipt', 'receivable', r.id
  )
  returning id into transaction_id;

  update public.receivables
     set status = 'recebido',
         original_value = v_original,
         penalty = v_penalty,
         interest = v_interest,
         payment_method = case when p_account.account_type = 'caixa' then 'caixa' else 'banco' end,
         payment_date = p_date,
         receipt_date = p_date,
         received_value = v_value,
         payment_notes = nullif(btrim(p_notes), ''),
         bank_account_id = p_account.id,
         bank_transaction_id = transaction_id,
         batch_id = p_batch,
         updated_at = now()
   where id = r.id;
end;
$$;

create or replace function public.unsettle_receivable_row(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.receivables%rowtype;
  rest_row public.receivables%rowtype;
begin
  select * into r from public.receivables where id = p_id for update;

  select * into rest_row from public.receivables where partial_of = p_id for update;

  if found then
    if rest_row.status <> 'pendente' then
      raise exception 'O restante da conta "%" já foi recebido ou renegociado. Estorne ou desfaça primeiro o restante.', r.description;
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
         batch_id = null,
         updated_at = now()
   where id = p_id;

  if r.bank_transaction_id is not null then
    delete from public.bank_transactions where id = r.bank_transaction_id;
  end if;
end;
$$;

---------------------------------------------------------------------------
-- 6) RECEBER: funções chamadas pela tela
---------------------------------------------------------------------------
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
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_receber', 'settle') then
    raise exception 'Você não tem permissão para baixar contas nesta empresa.';
  end if;

  if p_value is null or round(p_value, 2) <= 0 then
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
    raise exception 'Esta conta não está pendente.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company;

  if not found then
    raise exception 'Conta bancária ou caixa não encontrado.';
  end if;

  perform public.settle_receivable_row(p_receivable_id, account_row, p_date, p_value, p_notes, p_keep_rest_open, null);
end;
$$;

create or replace function public.receive_receivables_batch(
  p_receivable_ids uuid[],
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
  account_row public.bank_accounts%rowtype;
  r record;
  v_ids uuid[];
  v_count integer;
  v_parties integer;
  v_total numeric;
  v_value numeric := round(p_value, 2);
  v_left numeric;
  v_row_total numeric;
  v_share numeric;
  v_shares numeric := 0;
  v_first uuid;
  v_batch uuid := gen_random_uuid();
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_receber', 'settle') then
    raise exception 'Você não tem permissão para baixar contas nesta empresa.';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_receivable_ids) as x where x is not null;

  if v_ids is null or cardinality(v_ids) < 2 then
    raise exception 'Marque pelo menos duas contas para baixar em lote.';
  end if;

  if p_value is null or v_value <= 0 then
    raise exception 'Informe um valor recebido maior que zero.';
  end if;

  if p_date is null then
    raise exception 'Informe a data do recebimento.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company;

  if not found then
    raise exception 'Conta bancária ou caixa não encontrado.';
  end if;

  perform 1 from public.receivables
    where id = any (v_ids) and company_id = company
    order by id
    for update;

  select count(*), count(distinct client_id),
         coalesce(sum(round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2)), 0)
    into v_count, v_parties, v_total
    from public.receivables
   where id = any (v_ids) and company_id = company and status = 'pendente';

  if v_count <> cardinality(v_ids) then
    raise exception 'Alguma conta marcada não foi encontrada ou não está mais pendente. Atualize a lista e tente de novo.';
  end if;

  if v_value > v_total then
    raise exception 'O valor recebido (R$ %) é maior que a soma das contas marcadas (R$ %).',
      translate(to_char(v_value, 'FM999,999,990.00'), ',.', '.,'),
      translate(to_char(v_total, 'FM999,999,990.00'), ',.', '.,');
  end if;

  if v_value < v_total and v_parties > 1 then
    raise exception 'Baixa com valor menor que o total só é permitida com contas do mesmo cliente.';
  end if;

  if v_value = v_total then
    for r in
      select id, round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2) as total
        from public.receivables where id = any (v_ids)
       order by due_date, created_at, id
    loop
      perform public.settle_receivable_row(r.id, account_row, p_date, r.total, p_notes, false, v_batch);
    end loop;

  elsif coalesce(p_keep_rest_open, true) then
    v_left := v_value;

    for r in
      select id, round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2) as total
        from public.receivables where id = any (v_ids)
       order by due_date, created_at, id
    loop
      exit when v_left <= 0;
      v_row_total := r.total;

      if v_row_total <= 0 then
        continue;
      end if;

      perform public.settle_receivable_row(r.id, account_row, p_date, least(v_left, v_row_total), p_notes, true, v_batch);
      v_left := v_left - least(v_left, v_row_total);
    end loop;

  else
    for r in
      select id, round(original_value + coalesce(interest, 0) + coalesce(penalty, 0), 2) as total
        from public.receivables where id = any (v_ids)
       order by due_date, created_at, id
    loop
      if v_first is null then
        v_first := r.id;
      else
        v_share := case when v_total > 0 then trunc(r.total * v_value / v_total, 2) else 0 end;

        if v_share <= 0 then
          raise exception 'O desconto é grande demais para dividir entre as contas marcadas.';
        end if;

        v_shares := v_shares + v_share;
        perform public.settle_receivable_row(r.id, account_row, p_date, v_share, p_notes, false, v_batch);
      end if;
    end loop;

    if v_value - v_shares <= 0 then
      raise exception 'O desconto é grande demais para dividir entre as contas marcadas.';
    end if;

    perform public.settle_receivable_row(v_first, account_row, p_date, v_value - v_shares, p_notes, false, v_batch);
  end if;
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
  r record;
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

  if receivable_row.batch_id is null then
    perform public.unsettle_receivable_row(p_receivable_id);
  else
    for r in
      select id from public.receivables
       where batch_id = receivable_row.batch_id and company_id = company and status = 'recebido'
       order by id
    loop
      perform public.unsettle_receivable_row(r.id);
    end loop;
  end if;
end;
$$;

create or replace function public.renegotiate_receivables(
  p_receivable_ids uuid[],
  p_installments integer,
  p_first_due date,
  p_increase numeric default 0,
  p_discount numeric default 0,
  p_description text default null,
  p_management_account_id uuid default null,
  p_notes text default null,
  p_category text default null
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

  if coalesce(p_increase, 0) < 0 or coalesce(p_discount, 0) < 0 then
    raise exception 'Acréscimo e desconto não podem ser negativos.';
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

  v_each := trunc(v_new_total / p_installments, 2);
  v_first_value := v_new_total - v_each * (p_installments - 1);

  update public.receivables
     set status = 'renegociada',
         renegotiation_id = v_reneg,
         updated_at = now()
   where id = any (v_ids);

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
                and status <> 'pendente') then
    raise exception 'Alguma parcela da renegociação já foi recebida ou renegociada de novo. Estorne ou desfaça isso primeiro.';
  end if;

  if exists (select 1 from public.receivables p
              where p.company_id = company
                and p.partial_of in (select id from public.receivables
                                      where company_id = company and renegotiated_from = p_renegotiation_id)) then
    raise exception 'Alguma parcela da renegociação teve baixa parcial. Estorne essa baixa primeiro.';
  end if;

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
-- 7) "Em aberto" passa a ser só "pendente" (renegociada não conta) na
--    conferência de exclusão de cliente/fornecedor/conta bancária
---------------------------------------------------------------------------
create or replace function public.delete_block_reason_for_company(p_table text, p_id uuid, p_company uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  company uuid := p_company;
  v_name text;
  v_open integer;
  v_any integer;
  v_open_value numeric(14,2);
begin
  if company is null then
    return null;
  end if;

  if p_table = 'clients' then
    select name into v_name from public.clients where id = p_id and company_id = company;
    if not found then return null; end if;

    select count(*) filter (where status = 'pendente'),
           count(*),
           coalesce(sum(original_value + coalesce(interest, 0) + coalesce(penalty, 0)) filter (where status = 'pendente'), 0)
      into v_open, v_any, v_open_value
      from public.receivables where client_id = p_id;

    if v_open > 0 then
      return format(
        'O cliente "%s" tem %s conta%s a receber em aberto (R$ %s) e não pode ser excluído. Receba ou exclua essas contas, ou use "Inativar".',
        v_name, v_open, case when v_open = 1 then '' else 's' end,
        translate(to_char(v_open_value, 'FM999,999,990.00'), ',.', '.,'));
    end if;

    if v_any > 0 then
      return format('O cliente "%s" tem contas já recebidas (movimentação) e não pode ser excluído. Use "Inativar" para tirá-lo das listas.', v_name);
    end if;

    if exists (select 1 from public.appointments where client_id = p_id) then
      return format('O cliente "%s" tem agendamentos na Agenda e não pode ser excluído. Use "Inativar" para tirá-lo das listas.', v_name);
    end if;

  elsif p_table = 'suppliers' then
    select name into v_name from public.suppliers where id = p_id and company_id = company;
    if not found then return null; end if;

    select count(*) filter (where status = 'pendente'),
           count(*),
           coalesce(sum(original_value + coalesce(interest, 0) + coalesce(penalty, 0)) filter (where status = 'pendente'), 0)
      into v_open, v_any, v_open_value
      from public.payables where supplier_id = p_id;

    if v_open > 0 then
      return format(
        'O fornecedor "%s" tem %s conta%s a pagar em aberto (R$ %s) e não pode ser excluído. Pague ou exclua essas contas, ou use "Inativar".',
        v_name, v_open, case when v_open = 1 then '' else 's' end,
        translate(to_char(v_open_value, 'FM999,999,990.00'), ',.', '.,'));
    end if;

    if v_any > 0 then
      return format('O fornecedor "%s" tem contas já pagas (movimentação) e não pode ser excluído. Use "Inativar" para tirá-lo das listas.', v_name);
    end if;

  elsif p_table = 'bank_accounts' then
    select name into v_name from public.bank_accounts where id = p_id and company_id = company;
    if not found then return null; end if;

    if exists (select 1 from public.payables where bank_account_id = p_id and status = 'pendente')
       or exists (select 1 from public.receivables where bank_account_id = p_id and status = 'pendente') then
      return format('"%s" está escolhida em contas a pagar ou a receber em aberto e não pode ser excluída.', v_name);
    end if;

    if exists (select 1 from public.bank_transactions where bank_account_id = p_id)
       or exists (select 1 from public.payables where bank_account_id = p_id)
       or exists (select 1 from public.receivables where bank_account_id = p_id)
       or exists (select 1 from public.cash_sessions where cash_account_id = p_id) then
      return format('"%s" tem movimentação (entradas, saídas ou pagamentos) e não pode ser excluída.', v_name);
    end if;

    if exists (select 1 from public.credit_cards where bank_account_id = p_id) then
      return format('"%s" está ligada a um cartão de crédito e não pode ser excluída. Troque a conta do cartão antes.', v_name);
    end if;

  elsif p_table = 'credit_cards' then
    select name into v_name from public.credit_cards where id = p_id and company_id = company;
    if not found then return null; end if;

    if exists (select 1 from public.card_transactions where card_id = p_id and not settled) then
      return format('O cartão "%s" tem compras em faturas em aberto e não pode ser excluído. Use "Desativar".', v_name);
    end if;

    if exists (select 1 from public.card_transactions where card_id = p_id) then
      return format('O cartão "%s" tem compras lançadas (movimentação) e não pode ser excluído. Use "Desativar".', v_name);
    end if;
  end if;

  return null;
end;
$$;

-- Só o banco usa esta (a tela usa a de baixo, presa à empresa aberta)
revoke all on function public.delete_block_reason_for_company(text, uuid, uuid) from public, anon, authenticated;

---------------------------------------------------------------------------
-- 8) Quem pode chamar
---------------------------------------------------------------------------
revoke all on function public.settle_payable_row(uuid, public.bank_accounts, date, numeric, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.unsettle_payable_row(uuid) from public, anon, authenticated;
revoke all on function public.settle_receivable_row(uuid, public.bank_accounts, date, numeric, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.unsettle_receivable_row(uuid) from public, anon, authenticated;

revoke all on function public.pay_payable(uuid, uuid, date, numeric, text, boolean) from public, anon;
revoke all on function public.pay_payables_batch(uuid[], uuid, date, numeric, text, boolean) from public, anon;
revoke all on function public.reverse_payable_payment(uuid) from public, anon;
revoke all on function public.renegotiate_payables(uuid[], integer, date, numeric, numeric, text, uuid, text, text) from public, anon;
revoke all on function public.undo_payables_renegotiation(uuid) from public, anon;
revoke all on function public.receive_receivable(uuid, uuid, date, numeric, text, boolean) from public, anon;
revoke all on function public.receive_receivables_batch(uuid[], uuid, date, numeric, text, boolean) from public, anon;
revoke all on function public.reverse_receivable_receipt(uuid) from public, anon;
revoke all on function public.renegotiate_receivables(uuid[], integer, date, numeric, numeric, text, uuid, text, text) from public, anon;
revoke all on function public.undo_receivables_renegotiation(uuid) from public, anon;

grant execute on function public.pay_payable(uuid, uuid, date, numeric, text, boolean) to authenticated;
grant execute on function public.pay_payables_batch(uuid[], uuid, date, numeric, text, boolean) to authenticated;
grant execute on function public.reverse_payable_payment(uuid) to authenticated;
grant execute on function public.renegotiate_payables(uuid[], integer, date, numeric, numeric, text, uuid, text, text) to authenticated;
grant execute on function public.undo_payables_renegotiation(uuid) to authenticated;
grant execute on function public.receive_receivable(uuid, uuid, date, numeric, text, boolean) to authenticated;
grant execute on function public.receive_receivables_batch(uuid[], uuid, date, numeric, text, boolean) to authenticated;
grant execute on function public.reverse_receivable_receipt(uuid) to authenticated;
grant execute on function public.renegotiate_receivables(uuid[], integer, date, numeric, numeric, text, uuid, text, text) to authenticated;
grant execute on function public.undo_receivables_renegotiation(uuid) to authenticated;

notify pgrst, 'reload schema';