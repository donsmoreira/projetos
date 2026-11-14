-- Extrato importado e conciliação bancária (Controle Bancário)
-- Rode DEPOIS de 20261114_lote_e_renegociacao.sql.
--
-- O extrato do banco (arquivo OFX/CSV agora; Open Finance depois) entra numa
-- tabela própria, linha a linha, como "a conciliar". Conciliar é dizer o que
-- cada linha é no sistema:
--   * uma movimentação que já existe (mesmo valor, mesma conta);
--   * a baixa de uma conta a pagar ou a receber (o sistema baixa na data e
--     no valor do extrato; valor menor = baixa parcial ou desconto);
--   * um lançamento avulso novo (ex.: tarifa bancária);
--   * ou ignorar.
-- Se a movimentação ligada for apagada (ex.: estorno da conta), a linha do
-- extrato volta sozinha para "a conciliar".

---------------------------------------------------------------------------
-- 1) Linhas do extrato
---------------------------------------------------------------------------
create table if not exists public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts (id) on delete cascade,
  source text not null check (source in ('ofx', 'csv', 'openfinance')),
  external_id text not null,
  posted_date date not null,
  amount numeric(14, 2) not null check (amount <> 0),
  description text not null,
  status text not null default 'pendente' check (status in ('pendente', 'conciliado', 'ignorado')),
  reconcile_kind text check (reconcile_kind in ('transaction', 'payable', 'receivable', 'created')),
  payable_id uuid references public.payables (id) on delete set null,
  receivable_id uuid references public.receivables (id) on delete set null,
  bank_transaction_id uuid references public.bank_transactions (id) on delete set null,
  import_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  reconciled_by uuid,
  reconciled_at timestamptz,
  unique (bank_account_id, external_id)
);

create unique index if not exists bank_statement_lines_transaction_uidx
  on public.bank_statement_lines (bank_transaction_id)
  where bank_transaction_id is not null;

create index if not exists bank_statement_lines_account_date_idx
  on public.bank_statement_lines (bank_account_id, posted_date);

create index if not exists bank_statement_lines_company_idx
  on public.bank_statement_lines (company_id);

alter table public.bank_statement_lines enable row level security;

drop policy if exists bank_statement_lines_select on public.bank_statement_lines;
create policy bank_statement_lines_select on public.bank_statement_lines
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and public.has_module_permission('contas_bancarias', 'view')
  );
-- Gravação só pelas funções abaixo (sem políticas de insert/update/delete)

---------------------------------------------------------------------------
-- 2) Movimentação apagada (estorno etc.): a linha volta para "a conciliar"
---------------------------------------------------------------------------
create or replace function public.statement_line_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bank_statement_lines
     set status = 'pendente',
         reconcile_kind = null,
         payable_id = null,
         receivable_id = null,
         bank_transaction_id = null,
         reconciled_by = null,
         reconciled_at = null
   where bank_transaction_id = old.id;

  return old;
end;
$$;

drop trigger if exists bank_transactions_release_statement on public.bank_transactions;
create trigger bank_transactions_release_statement
  before delete on public.bank_transactions
  for each row execute function public.statement_line_release();

revoke all on function public.statement_line_release() from public, anon, authenticated;

---------------------------------------------------------------------------
-- 3) Importar linhas (OFX/CSV). Repetidas (mesmo external_id) são puladas.
--    p_lines: [{ "external_id": "...", "date": "2026-11-14", "amount": -50.5, "description": "..." }]
---------------------------------------------------------------------------
create or replace function public.import_statement_lines(
  p_account_id uuid,
  p_source text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  account_row public.bank_accounts%rowtype;
  v_import uuid := gen_random_uuid();
  v_total integer;
  v_inserted integer;
  item jsonb;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_bancarias', 'create') then
    raise exception 'Você não tem permissão para importar extratos nesta empresa.';
  end if;

  if p_source not in ('ofx', 'csv', 'openfinance') then
    raise exception 'Origem do extrato inválida.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company;

  if not found or account_row.account_type <> 'banco' then
    raise exception 'Escolha uma conta bancária (o extrato não vale para o caixa).';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'O arquivo não tem lançamentos.';
  end if;

  v_total := jsonb_array_length(p_lines);

  if v_total > 5000 then
    raise exception 'Arquivo grande demais: importe no máximo 5.000 lançamentos por vez.';
  end if;

  for item in select * from jsonb_array_elements(p_lines) loop
    if coalesce(btrim(item->>'external_id'), '') = ''
       or (item->>'date') is null
       or (item->>'amount') is null
       or round((item->>'amount')::numeric, 2) = 0 then
      raise exception 'Há lançamento sem data, sem valor ou com valor zero no arquivo.';
    end if;
  end loop;

  with rows as (
    insert into public.bank_statement_lines (
      company_id, bank_account_id, source, external_id, posted_date, amount, description, import_id
    )
    select company, p_account_id, p_source,
           left(btrim(x->>'external_id'), 200),
           (x->>'date')::date,
           round((x->>'amount')::numeric, 2),
           coalesce(nullif(left(btrim(x->>'description'), 300), ''), 'Lançamento do extrato'),
           v_import
      from jsonb_array_elements(p_lines) as x
    on conflict (bank_account_id, external_id) do nothing
    returning 1
  )
  select count(*) into v_inserted from rows;

  return jsonb_build_object(
    'import_id', v_import,
    'inserted', v_inserted,
    'duplicates', v_total - v_inserted
  );
end;
$$;

---------------------------------------------------------------------------
-- 4) Conciliar
--    p_kind: 'transaction' (movimentação existente), 'payable', 'receivable'
--    p_keep_rest_open: valor do extrato menor que a conta → true = baixa
--    parcial (restante em aberto) / false = quita com desconto
---------------------------------------------------------------------------
create or replace function public.reconcile_statement_line(
  p_line_id uuid,
  p_kind text,
  p_target_id uuid,
  p_keep_rest_open boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  line public.bank_statement_lines%rowtype;
  account_row public.bank_accounts%rowtype;
  tx public.bank_transactions%rowtype;
  pay public.payables%rowtype;
  rec public.receivables%rowtype;
  v_tx uuid;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  select * into line
    from public.bank_statement_lines
   where id = p_line_id and company_id = company
   for update;

  if not found then
    raise exception 'Lançamento do extrato não encontrado.';
  end if;

  if line.status <> 'pendente' then
    raise exception 'Este lançamento do extrato já foi conciliado ou ignorado.';
  end if;

  select * into account_row from public.bank_accounts where id = line.bank_account_id;

  if p_kind = 'transaction' then
    if not public.has_module_permission('contas_bancarias', 'update') then
      raise exception 'Você não tem permissão para conciliar nesta empresa.';
    end if;

    select * into tx
      from public.bank_transactions
     where id = p_target_id and company_id = company
     for update;

    if not found or tx.bank_account_id <> line.bank_account_id then
      raise exception 'Movimentação não encontrada nesta conta.';
    end if;

    if round(tx.value, 2) <> line.amount then
      raise exception 'O valor da movimentação é diferente do valor do extrato.';
    end if;

    if exists (select 1 from public.bank_statement_lines where bank_transaction_id = tx.id) then
      raise exception 'Esta movimentação já está conciliada com outro lançamento do extrato.';
    end if;

    v_tx := tx.id;

  elsif p_kind = 'payable' then
    if line.amount >= 0 then
      raise exception 'Entrada no extrato não pode baixar conta a pagar.';
    end if;

    if not public.has_module_permission('contas_pagar', 'settle') then
      raise exception 'Você não tem permissão para baixar contas a pagar nesta empresa.';
    end if;

    select * into pay
      from public.payables
     where id = p_target_id and company_id = company
     for update;

    if not found then
      raise exception 'Conta a pagar não encontrada.';
    end if;

    if pay.status <> 'pendente' then
      raise exception 'Esta conta a pagar não está pendente.';
    end if;

    perform public.settle_payable_row(pay.id, account_row, line.posted_date, -line.amount, 'Conciliação bancária', p_keep_rest_open, null);

    select bank_transaction_id into v_tx from public.payables where id = pay.id;

  elsif p_kind = 'receivable' then
    if line.amount <= 0 then
      raise exception 'Saída no extrato não pode baixar conta a receber.';
    end if;

    if not public.has_module_permission('contas_receber', 'settle') then
      raise exception 'Você não tem permissão para baixar contas a receber nesta empresa.';
    end if;

    select * into rec
      from public.receivables
     where id = p_target_id and company_id = company
     for update;

    if not found then
      raise exception 'Conta a receber não encontrada.';
    end if;

    if rec.status <> 'pendente' then
      raise exception 'Esta conta a receber não está pendente.';
    end if;

    perform public.settle_receivable_row(rec.id, account_row, line.posted_date, line.amount, 'Conciliação bancária', p_keep_rest_open, null);

    select bank_transaction_id into v_tx from public.receivables where id = rec.id;

  else
    raise exception 'Tipo de conciliação inválido.';
  end if;

  update public.bank_statement_lines
     set status = 'conciliado',
         reconcile_kind = p_kind,
         payable_id = case when p_kind = 'payable' then p_target_id end,
         receivable_id = case when p_kind = 'receivable' then p_target_id end,
         bank_transaction_id = v_tx,
         reconciled_by = auth.uid(),
         reconciled_at = now()
   where id = line.id;
end;
$$;

-- Lançamento avulso novo a partir da linha (ex.: tarifa, rendimento)
create or replace function public.reconcile_statement_line_new(
  p_line_id uuid,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  line public.bank_statement_lines%rowtype;
  v_tx uuid;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_bancarias', 'create') then
    raise exception 'Você não tem permissão para lançar movimentações nesta empresa.';
  end if;

  select * into line
    from public.bank_statement_lines
   where id = p_line_id and company_id = company
   for update;

  if not found then
    raise exception 'Lançamento do extrato não encontrado.';
  end if;

  if line.status <> 'pendente' then
    raise exception 'Este lançamento do extrato já foi conciliado ou ignorado.';
  end if;

  insert into public.bank_transactions (
    user_id, company_id, bank_account_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), company, line.bank_account_id, line.posted_date,
    coalesce(nullif(btrim(p_description), ''), line.description),
    line.amount, 'manual', 'statement', line.id
  )
  returning id into v_tx;

  update public.bank_statement_lines
     set status = 'conciliado',
         reconcile_kind = 'created',
         bank_transaction_id = v_tx,
         reconciled_by = auth.uid(),
         reconciled_at = now()
   where id = line.id;
end;
$$;

-- Ignorar / voltar para "a conciliar"
create or replace function public.ignore_statement_line(
  p_line_id uuid,
  p_ignore boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  line public.bank_statement_lines%rowtype;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_bancarias', 'update') then
    raise exception 'Você não tem permissão para conciliar nesta empresa.';
  end if;

  select * into line
    from public.bank_statement_lines
   where id = p_line_id and company_id = company
   for update;

  if not found then
    raise exception 'Lançamento do extrato não encontrado.';
  end if;

  if p_ignore and line.status <> 'pendente' then
    raise exception 'Só dá para ignorar lançamento que está a conciliar.';
  end if;

  if not p_ignore and line.status <> 'ignorado' then
    raise exception 'Este lançamento não está ignorado.';
  end if;

  update public.bank_statement_lines
     set status = case when p_ignore then 'ignorado' else 'pendente' end,
         reconciled_by = case when p_ignore then auth.uid() end,
         reconciled_at = case when p_ignore then now() end
   where id = line.id;
end;
$$;

-- Desfazer a conciliação:
--   movimentação existente → só desliga;
--   avulso criado aqui → apaga o avulso;
--   baixa de conta → estorna a baixa (se foi em lote, o lote inteiro).
create or replace function public.undo_statement_reconciliation(
  p_line_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  line public.bank_statement_lines%rowtype;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  select * into line
    from public.bank_statement_lines
   where id = p_line_id and company_id = company
   for update;

  if not found then
    raise exception 'Lançamento do extrato não encontrado.';
  end if;

  if line.status <> 'conciliado' then
    raise exception 'Este lançamento não está conciliado.';
  end if;

  if line.reconcile_kind = 'payable' and line.payable_id is not null then
    perform public.reverse_payable_payment(line.payable_id);

  elsif line.reconcile_kind = 'receivable' and line.receivable_id is not null then
    perform public.reverse_receivable_receipt(line.receivable_id);

  elsif line.reconcile_kind = 'created' and line.bank_transaction_id is not null then
    if not public.has_module_permission('contas_bancarias', 'delete') then
      raise exception 'Você não tem permissão para excluir movimentações nesta empresa.';
    end if;

    delete from public.bank_transactions where id = line.bank_transaction_id;

  else
    if not public.has_module_permission('contas_bancarias', 'update') then
      raise exception 'Você não tem permissão para conciliar nesta empresa.';
    end if;
  end if;

  -- Garante a linha solta (o gatilho já faz isso quando a movimentação é apagada)
  update public.bank_statement_lines
     set status = 'pendente',
         reconcile_kind = null,
         payable_id = null,
         receivable_id = null,
         bank_transaction_id = null,
         reconciled_by = null,
         reconciled_at = null
   where id = line.id;
end;
$$;

-- Excluir linhas importadas por engano (só a conciliar ou ignoradas)
create or replace function public.delete_statement_lines(
  p_line_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  v_count integer;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('contas_bancarias', 'delete') then
    raise exception 'Você não tem permissão para excluir lançamentos do extrato nesta empresa.';
  end if;

  if exists (select 1 from public.bank_statement_lines
              where id = any (p_line_ids) and company_id = company and status = 'conciliado') then
    raise exception 'Lançamento conciliado não pode ser excluído. Desfaça a conciliação primeiro.';
  end if;

  delete from public.bank_statement_lines
   where id = any (p_line_ids) and company_id = company and status <> 'conciliado';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

---------------------------------------------------------------------------
-- 5) Quem pode chamar
---------------------------------------------------------------------------
revoke all on function public.import_statement_lines(uuid, text, jsonb) from public, anon;
revoke all on function public.reconcile_statement_line(uuid, text, uuid, boolean) from public, anon;
revoke all on function public.reconcile_statement_line_new(uuid, text) from public, anon;
revoke all on function public.ignore_statement_line(uuid, boolean) from public, anon;
revoke all on function public.undo_statement_reconciliation(uuid) from public, anon;
revoke all on function public.delete_statement_lines(uuid[]) from public, anon;

grant execute on function public.import_statement_lines(uuid, text, jsonb) to authenticated;
grant execute on function public.reconcile_statement_line(uuid, text, uuid, boolean) to authenticated;
grant execute on function public.reconcile_statement_line_new(uuid, text) to authenticated;
grant execute on function public.ignore_statement_line(uuid, boolean) to authenticated;
grant execute on function public.undo_statement_reconciliation(uuid) to authenticated;
grant execute on function public.delete_statement_lines(uuid[]) to authenticated;

grant select on public.bank_statement_lines to authenticated;

notify pgrst, 'reload schema';
