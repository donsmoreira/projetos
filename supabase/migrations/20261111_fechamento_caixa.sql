-- Abertura e fechamento de caixa (turnos), quebra de caixa e trava.
--
-- * Caixa de OPERAÇÃO abre e fecha (pode ter vários turnos por dia).
--   Caixa de RETAGUARDA (cofre) não abre nem fecha: recebe o dinheiro no fechamento.
-- * Abertura: confere o troco (o que ficou de reserva no último fechamento).
-- * Fechamento: valor contado obrigatório; mostra esperado x contado x diferença;
--   o dinheiro pode ir para a retaguarda e/ou ser depositado no banco; o resto
--   fica de reserva (troco) para a próxima abertura.
-- * Diferença confirmada vira o lançamento "Quebra de caixa" (sobra ou falta),
--   para o saldo do caixa ficar igual ao contado.
-- * Trava: com o caixa fechado não entra nem sai nada dele; lançamentos de um turno
--   fechado não podem ser alterados nem excluídos. Só o administrador reabre.
--
-- Os caixas que já existem passam a ser de operação e começam FECHADOS:
-- antes de lançar no caixa (inclusive pagar ou receber em dinheiro), abra o turno.
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

---------------------------------------------------------------------------
-- 1) FUNÇÃO DO CAIXA: operação ou retaguarda
---------------------------------------------------------------------------
alter table public.bank_accounts
  add column if not exists cash_role text not null default 'operacao';

alter table public.bank_accounts drop constraint if exists bank_accounts_cash_role_check;
alter table public.bank_accounts add constraint bank_accounts_cash_role_check
  check (cash_role in ('operacao', 'retaguarda'));

---------------------------------------------------------------------------
-- 2) TURNOS DO CAIXA (abertura e fechamento)
---------------------------------------------------------------------------
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid default auth.uid(),
  cash_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  status text not null default 'aberto',

  -- Abertura
  opened_at timestamptz not null default now(),
  opened_by uuid references auth.users (id) on delete set null,
  opening_expected numeric(14,2) not null default 0,
  opening_counted numeric(14,2) not null default 0,
  opening_difference numeric(14,2) not null default 0,
  opening_notes text,

  -- Fechamento
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  closing_expected numeric(14,2),
  closing_counted numeric(14,2),
  closing_difference numeric(14,2),
  to_backoffice numeric(14,2) not null default 0,
  backoffice_account_id uuid references public.bank_accounts (id) on delete set null,
  to_bank numeric(14,2) not null default 0,
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  reserve numeric(14,2),
  closing_notes text,

  -- Reabertura (pelo administrador)
  reopened_at timestamptz,
  reopened_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),

  constraint cash_sessions_status_check check (status in ('aberto', 'fechado'))
);

-- Um turno aberto por caixa
create unique index if not exists cash_sessions_one_open_idx
  on public.cash_sessions (cash_account_id) where status = 'aberto';

create index if not exists cash_sessions_company_idx
  on public.cash_sessions (company_id, cash_account_id, opened_at desc);

-- Ver: quem é da empresa aberta. Abrir, fechar e reabrir: só pelas funções abaixo.
alter table public.cash_sessions enable row level security;
grant select on public.cash_sessions to authenticated;
grant all on public.cash_sessions to service_role;
revoke all on public.cash_sessions from anon;

drop policy if exists cash_sessions_select_company on public.cash_sessions;
create policy cash_sessions_select_company on public.cash_sessions
  for select to authenticated
  using (company_id = (select public.current_company_id()));

---------------------------------------------------------------------------
-- 3) LANÇAMENTOS DO CAIXA LIGADOS AO TURNO + TRAVA
---------------------------------------------------------------------------
alter table public.bank_transactions
  add column if not exists cash_session_id uuid references public.cash_sessions (id) on delete set null;

create index if not exists bank_transactions_cash_session_idx
  on public.bank_transactions (cash_session_id);

-- Quebra de caixa é um tipo novo de movimentação
alter table public.bank_transactions
  drop constraint if exists bank_transactions_transaction_type_check;

alter table public.bank_transactions
  add constraint bank_transactions_transaction_type_check
  check (transaction_type in (
    'manual',
    'payable_payment',
    'receivable_receipt',
    'card_settlement',
    'transfer',
    'cash_adjustment'
  ));

-- Entrar ou sair do caixa de operação só com o turno aberto
create or replace function public.cash_session_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_row public.bank_accounts%rowtype;
  open_session uuid;
begin
  select * into account_row from public.bank_accounts where id = new.bank_account_id;

  if not found or account_row.account_type <> 'caixa' or account_row.cash_role <> 'operacao' then
    return new;
  end if;

  select id into open_session
    from public.cash_sessions
   where cash_account_id = new.bank_account_id and status = 'aberto';

  if open_session is null then
    raise exception 'O caixa "%" está fechado. Abra o caixa antes de lançar nele.', account_row.name;
  end if;

  new.cash_session_id := open_session;
  return new;
end;
$$;

drop trigger if exists bank_transactions_cash_session_insert on public.bank_transactions;
create trigger bank_transactions_cash_session_insert
  before insert on public.bank_transactions
  for each row execute function public.cash_session_guard_insert();

-- Lançamento de turno fechado não muda nem sai
create or replace function public.cash_session_guard_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.cash_session_id is not null and exists (
    select 1 from public.cash_sessions
     where id = old.cash_session_id and status = 'fechado'
  ) then
    raise exception 'Este lançamento é de um caixa já fechado e não pode ser alterado nem excluído. Peça ao administrador para reabrir o caixa.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists bank_transactions_cash_session_change on public.bank_transactions;
create trigger bank_transactions_cash_session_change
  before update or delete on public.bank_transactions
  for each row execute function public.cash_session_guard_change();

---------------------------------------------------------------------------
-- 4) APOIO
---------------------------------------------------------------------------
-- Saldo atual de uma conta (saldo inicial + movimentações)
create or replace function public.account_balance(p_account_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(a.initial_balance + coalesce((
    select sum(t.value) from public.bank_transactions t where t.bank_account_id = a.id
  ), 0), 2)
    from public.bank_accounts a
   where a.id = p_account_id
     and a.company_id = public.current_company_id()
$$;

-- Data de hoje no horário de Brasília
create or replace function public.today_br()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Valor em reais para mensagens: 1234.5 -> "1.234,50"
create or replace function public.brl(p_value numeric)
returns text
language sql
immutable
as $$
  select translate(to_char(p_value, 'FM999G999G990D00'), ',.', '.,')
$$;

---------------------------------------------------------------------------
-- 5) ABRIR O CAIXA (conferindo o troco)
--    p_expected: o valor esperado que a pessoa viu na tela (se mudou, pede para conferir)
--    p_accept_difference: a pessoa confirmou abrir com diferença
---------------------------------------------------------------------------
create or replace function public.open_cash_session(
  p_account_id uuid,
  p_counted numeric,
  p_expected numeric,
  p_accept_difference boolean default false,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  account_row public.bank_accounts%rowtype;
  v_expected numeric(14,2);
  v_counted numeric(14,2) := round(coalesce(p_counted, -1), 2);
  v_difference numeric(14,2);
  v_session_id uuid;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('caixa', 'create') then
    raise exception 'Você não tem permissão para abrir o caixa.';
  end if;

  select * into account_row
    from public.bank_accounts
   where id = p_account_id and company_id = company
   for update;

  if not found or account_row.account_type <> 'caixa' then
    raise exception 'Caixa não encontrado.';
  end if;

  if account_row.cash_role <> 'operacao' then
    raise exception 'O caixa "%" é de retaguarda e não abre nem fecha.', account_row.name;
  end if;

  if exists (select 1 from public.cash_sessions where cash_account_id = p_account_id and status = 'aberto') then
    raise exception 'O caixa "%" já está aberto.', account_row.name;
  end if;

  if v_counted < 0 then
    raise exception 'Informe o valor do troco contado (pode ser zero).';
  end if;

  v_expected := public.account_balance(p_account_id);

  if p_expected is null or round(p_expected, 2) <> v_expected then
    raise exception 'O saldo do caixa mudou (agora R$ %). Confira o troco de novo.', public.brl(v_expected);
  end if;

  v_difference := v_counted - v_expected;

  if v_difference <> 0 and not coalesce(p_accept_difference, false) then
    raise exception 'O troco contado tem diferença de R$ %. Confirme para abrir com diferença.', public.brl(v_difference);
  end if;

  insert into public.cash_sessions (
    company_id, cash_account_id, status, opened_at, opened_by,
    opening_expected, opening_counted, opening_difference, opening_notes
  ) values (
    company, p_account_id, 'aberto', now(), auth.uid(),
    v_expected, v_counted, v_difference, nullif(btrim(p_notes), '')
  )
  returning id into v_session_id;

  -- Diferença na abertura: quebra de caixa (o turno já está aberto, então entra nele)
  if v_difference <> 0 then
    insert into public.bank_transactions (
      user_id, company_id, bank_account_id, transaction_date, description, value,
      transaction_type, reference_type, reference_id
    ) values (
      auth.uid(), company, p_account_id, public.today_br(),
      'Quebra de caixa na abertura (' || case when v_difference > 0 then 'sobra' else 'falta' end || ')',
      v_difference, 'cash_adjustment', 'cash_opening', v_session_id
    );
  end if;

  return v_session_id;
end;
$$;

---------------------------------------------------------------------------
-- 6) FECHAR O CAIXA
---------------------------------------------------------------------------
create or replace function public.close_cash_session(
  p_session_id uuid,
  p_counted numeric,
  p_expected numeric,
  p_accept_difference boolean default false,
  p_to_backoffice numeric default 0,
  p_backoffice_account_id uuid default null,
  p_to_bank numeric default 0,
  p_bank_account_id uuid default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  session_row public.cash_sessions%rowtype;
  cash_row public.bank_accounts%rowtype;
  target_row public.bank_accounts%rowtype;
  v_expected numeric(14,2);
  v_counted numeric(14,2) := round(coalesce(p_counted, -1), 2);
  v_to_backoffice numeric(14,2) := round(coalesce(p_to_backoffice, 0), 2);
  v_to_bank numeric(14,2) := round(coalesce(p_to_bank, 0), 2);
  v_difference numeric(14,2);
  v_today date := public.today_br();
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('caixa', 'create') then
    raise exception 'Você não tem permissão para fechar o caixa.';
  end if;

  select * into session_row
    from public.cash_sessions
   where id = p_session_id and company_id = company
   for update;

  if not found then
    raise exception 'Turno de caixa não encontrado.';
  end if;

  if session_row.status <> 'aberto' then
    raise exception 'Este caixa já foi fechado.';
  end if;

  select * into cash_row from public.bank_accounts where id = session_row.cash_account_id for update;

  if v_counted < 0 then
    raise exception 'Informe o valor contado no caixa (obrigatório; pode ser zero).';
  end if;

  if v_to_backoffice < 0 or v_to_bank < 0 then
    raise exception 'Os valores da retaguarda e do depósito não podem ser negativos.';
  end if;

  if v_to_backoffice + v_to_bank > v_counted then
    raise exception 'Retaguarda + depósito (R$ %) passam do valor contado (R$ %).',
      public.brl(v_to_backoffice + v_to_bank), public.brl(v_counted);
  end if;

  v_expected := public.account_balance(session_row.cash_account_id);

  if p_expected is null or round(p_expected, 2) <> v_expected then
    raise exception 'O saldo do caixa mudou (agora R$ %). Confira a contagem de novo.', public.brl(v_expected);
  end if;

  v_difference := v_counted - v_expected;

  if v_difference <> 0 and not coalesce(p_accept_difference, false) then
    raise exception 'O valor contado tem diferença de R$ %. Confirme para fechar com diferença.', public.brl(v_difference);
  end if;

  -- 1) Quebra de caixa: o saldo passa a ser o contado
  if v_difference <> 0 then
    insert into public.bank_transactions (
      user_id, company_id, bank_account_id, transaction_date, description, value,
      transaction_type, reference_type, reference_id
    ) values (
      auth.uid(), company, cash_row.id, v_today,
      'Quebra de caixa no fechamento (' || case when v_difference > 0 then 'sobra' else 'falta' end || ')',
      v_difference, 'cash_adjustment', 'cash_closing', session_row.id
    );
  end if;

  -- 2) Retaguarda (outro caixa, de retaguarda)
  if v_to_backoffice > 0 then
    select * into target_row
      from public.bank_accounts
     where id = p_backoffice_account_id and company_id = company;

    if not found or target_row.account_type <> 'caixa' or target_row.cash_role <> 'retaguarda' then
      raise exception 'Escolha o caixa de retaguarda que vai receber o dinheiro.';
    end if;

    insert into public.bank_transactions (
      user_id, company_id, bank_account_id, transaction_date, description, value,
      transaction_type, reference_type, reference_id
    ) values
      (auth.uid(), company, cash_row.id, v_today, 'Fechamento: envio para ' || target_row.name,
       -v_to_backoffice, 'transfer', 'cash_closing', session_row.id),
      (auth.uid(), company, target_row.id, v_today, 'Fechamento de ' || cash_row.name,
       v_to_backoffice, 'transfer', 'cash_closing', session_row.id);
  end if;

  -- 3) Depósito no banco
  if v_to_bank > 0 then
    select * into target_row
      from public.bank_accounts
     where id = p_bank_account_id and company_id = company;

    if not found or target_row.account_type <> 'banco' then
      raise exception 'Escolha a conta bancária do depósito.';
    end if;

    insert into public.bank_transactions (
      user_id, company_id, bank_account_id, transaction_date, description, value,
      transaction_type, reference_type, reference_id
    ) values
      (auth.uid(), company, cash_row.id, v_today, 'Fechamento: depósito em ' || target_row.name,
       -v_to_bank, 'transfer', 'cash_closing', session_row.id),
      (auth.uid(), company, target_row.id, v_today, 'Depósito do fechamento de ' || cash_row.name,
       v_to_bank, 'transfer', 'cash_closing', session_row.id);
  end if;

  -- 4) Fecha (a partir daqui os lançamentos do turno ficam travados)
  update public.cash_sessions
     set status = 'fechado',
         closed_at = now(),
         closed_by = auth.uid(),
         closing_expected = v_expected,
         closing_counted = v_counted,
         closing_difference = v_difference,
         to_backoffice = v_to_backoffice,
         backoffice_account_id = case when v_to_backoffice > 0 then p_backoffice_account_id end,
         to_bank = v_to_bank,
         bank_account_id = case when v_to_bank > 0 then p_bank_account_id end,
         reserve = v_counted - v_to_backoffice - v_to_bank,
         closing_notes = nullif(btrim(p_notes), '')
   where id = session_row.id;
end;
$$;

---------------------------------------------------------------------------
-- 7) REABRIR (só administrador; só o último fechamento do caixa)
--    Desfaz o que o fechamento lançou (quebra, retaguarda, depósito).
---------------------------------------------------------------------------
create or replace function public.reopen_cash_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  session_row public.cash_sessions%rowtype;
begin
  if not public.has_company_permission('admin') then
    raise exception 'Só o administrador pode reabrir o caixa.';
  end if;

  select * into session_row
    from public.cash_sessions
   where id = p_session_id and company_id = company
   for update;

  if not found or session_row.status <> 'fechado' then
    raise exception 'Fechamento não encontrado.';
  end if;

  if exists (
    select 1 from public.cash_sessions
     where cash_account_id = session_row.cash_account_id
       and (status = 'aberto' or opened_at > session_row.opened_at)
  ) then
    raise exception 'Só dá para reabrir o último fechamento, com o caixa fechado.';
  end if;

  -- Volta a ficar aberto (destrava) e apaga o que o fechamento criou
  update public.cash_sessions
     set status = 'aberto',
         reopened_at = now(),
         reopened_by = auth.uid(),
         closed_at = null,
         closed_by = null,
         closing_expected = null,
         closing_counted = null,
         closing_difference = null,
         to_backoffice = 0,
         backoffice_account_id = null,
         to_bank = 0,
         bank_account_id = null,
         reserve = null
   where id = session_row.id;

  delete from public.bank_transactions
   where reference_type = 'cash_closing' and reference_id = session_row.id;
end;
$$;

---------------------------------------------------------------------------
-- 8) QUEM PODE CHAMAR
---------------------------------------------------------------------------
do $$
declare
  f text;
  fns text[] := array[
    'public.open_cash_session(uuid, numeric, numeric, boolean, text)',
    'public.close_cash_session(uuid, numeric, numeric, boolean, numeric, uuid, numeric, uuid, text)',
    'public.reopen_cash_session(uuid)',
    'public.account_balance(uuid)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

revoke all on function public.cash_session_guard_insert() from public, anon, authenticated;
revoke all on function public.cash_session_guard_change() from public, anon, authenticated;

notify pgrst, 'reload schema';
