-- MULTIEMPRESA E MULTIUSUÁRIO
--
-- O que muda:
-- 1) Empresas (companies): cadastro da empresa/pessoa (CPF ou CNPJ, regime tributário, endereço...).
-- 2) Membros (company_members): quem participa de cada empresa e o que pode fazer
--    (administrador, cadastrar, alterar, excluir, baixar). Quem cria a empresa é administrador.
-- 3) Convites por código (company_invites): o administrador gera um código e manda pelo WhatsApp.
-- 4) Perfil do usuário (profiles): CPF, endereço e a empresa que está aberta no momento.
-- 5) Todos os dados (clientes, fornecedores, contas, caixa, lançamentos...) passam a ser DA EMPRESA.
--    Cada pessoa vê só a empresa que está aberta e só faz o que a permissão dela deixa.
-- 6) Os dados que já existem vão para uma empresa criada automaticamente para cada usuário,
--    com ele como administrador. Nada é apagado.
--
-- Compatível com a versão atual do site: dá para rodar este SQL antes de atualizar o site.
-- Precisa ter rodado antes: todos os SQLs anteriores (até 20261111_endereco_clientes_fornecedores.sql).
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

---------------------------------------------------------------------------
-- 1) EMPRESAS
---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),

  -- Nome (CPF) ou razão social (CNPJ)
  name text not null,
  -- Nome fantasia (CNPJ)
  trade_name text,
  -- Só números: 11 = CPF, 14 = CNPJ
  document text,
  -- PF ou PJ (com CNPJ é sempre PJ)
  person_type text,
  -- simples | simples_mei | normal | nao_contribuinte (só com CNPJ)
  tax_regime text,
  state_registration text,
  municipal_registration text,

  phone text,
  email text,
  website text,

  zip_code text,
  street text,
  address_number text,
  complement text,
  neighborhood text,
  city text,
  state text,

  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint companies_name_check check (length(btrim(name)) > 0),
  constraint companies_document_check check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  constraint companies_person_type_check check (person_type is null or person_type in ('PF', 'PJ')),
  constraint companies_cnpj_is_pj check (document is null or length(document) <> 14 or person_type = 'PJ'),
  constraint companies_tax_regime_check check (
    tax_regime is null
    or (tax_regime in ('simples', 'simples_mei', 'normal', 'nao_contribuinte')
        and document is not null and length(document) = 14)
  ),
  constraint companies_zip_code_check check (zip_code is null or zip_code ~ '^[0-9]{8}$'),
  constraint companies_state_check check (state is null or state ~ '^[A-Z]{2}$')
);

---------------------------------------------------------------------------
-- 2) MEMBROS E PERMISSÕES
---------------------------------------------------------------------------
create table if not exists public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Administrador: pode tudo, inclusive configurar a empresa, gerenciar usuários e criar empresas
  is_admin boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  -- Baixar = pagar, receber e estornar
  can_settle boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index if not exists company_members_user_idx on public.company_members (user_id);

---------------------------------------------------------------------------
-- 3) CONVITES POR CÓDIGO
---------------------------------------------------------------------------
create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null unique,
  is_admin boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  can_settle boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);

create index if not exists company_invites_company_idx on public.company_invites (company_id);

---------------------------------------------------------------------------
-- 4) PERFIL DO USUÁRIO
---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists cpf text,
  add column if not exists zip_code text,
  add column if not exists street text,
  add column if not exists address_number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists active_company_id uuid references public.companies (id) on delete set null;

alter table public.profiles drop constraint if exists profiles_cpf_check;
alter table public.profiles add constraint profiles_cpf_check check (cpf is null or cpf ~ '^[0-9]{11}$');
alter table public.profiles drop constraint if exists profiles_zip_code_check;
alter table public.profiles add constraint profiles_zip_code_check check (zip_code is null or zip_code ~ '^[0-9]{8}$');
alter table public.profiles drop constraint if exists profiles_state_check;
alter table public.profiles add constraint profiles_state_check check (state is null or state ~ '^[A-Z]{2}$');

---------------------------------------------------------------------------
-- 5) FUNÇÕES DE APOIO (usadas pelas regras de segurança)
--    security definer: leem membros/perfil sem cair nas próprias regras (evita laço)
---------------------------------------------------------------------------

-- Empresa aberta agora (só se o usuário ainda for membro dela)
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.active_company_id
    from public.profiles p
    join public.company_members m
      on m.company_id = p.active_company_id
     and m.user_id = p.user_id
   where p.user_id = auth.uid()
$$;

-- O usuário pode fazer isso na empresa aberta? (create | update | delete | settle | admin)
create or replace function public.has_company_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case p_permission
             when 'create' then m.is_admin or m.can_create
             when 'update' then m.is_admin or m.can_update
             when 'delete' then m.is_admin or m.can_delete
             when 'settle' then m.is_admin or m.can_settle
             when 'admin'  then m.is_admin
             else false
           end
      from public.company_members m
     where m.user_id = auth.uid()
       and m.company_id = public.current_company_id()
  ), false)
$$;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members
     where company_id = p_company_id and user_id = auth.uid()
  )
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members
     where company_id = p_company_id and user_id = auth.uid() and is_admin
  )
$$;

---------------------------------------------------------------------------
-- 6) TODOS OS DADOS PASSAM A SER DA EMPRESA
---------------------------------------------------------------------------
do $$
declare
  t text;
  fk record;
  data_tables text[] := array[
    'appointments', 'bank_accounts', 'bank_transactions', 'card_settlements',
    'card_transactions', 'clients', 'credit_cards', 'management_accounts',
    'payables', 'receivables', 'suppliers'
  ];
begin
  foreach t in array data_tables loop
    execute format(
      'alter table public.%I add column if not exists company_id uuid references public.companies (id) on delete cascade',
      t
    );
    execute format('create index if not exists %I on public.%I (company_id)', t || '_company_idx', t);

    -- user_id vira só "quem cadastrou": apagar um usuário não pode apagar dados da empresa
    for fk in
      select c.conname
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.conrelid = format('public.%I', t)::regclass
         and c.contype = 'f'
         and a.attname = 'user_id'
    loop
      execute format('alter table public.%I drop constraint %I', t, fk.conname);
    end loop;
  end loop;
end $$;

---------------------------------------------------------------------------
-- 7) MIGRAÇÃO: uma empresa para cada usuário, com os dados dele dentro
---------------------------------------------------------------------------
do $$
declare
  r record;
  t text;
  new_company uuid;
  data_tables text[] := array[
    'appointments', 'bank_accounts', 'bank_transactions', 'card_settlements',
    'card_transactions', 'clients', 'credit_cards', 'management_accounts',
    'payables', 'receivables', 'suppliers'
  ];
begin
  for r in
    select u.id as user_id, u.email, p.full_name, p.company_name
      from auth.users u
      left join public.profiles p on p.user_id = u.id
     where not exists (select 1 from public.company_members m where m.user_id = u.id)
  loop
    insert into public.companies (name, created_by)
    values (
      coalesce(
        nullif(btrim(r.company_name), ''),
        nullif(btrim(r.full_name), ''),
        nullif(split_part(coalesce(r.email, ''), '@', 1), ''),
        'Minha empresa'
      ),
      r.user_id
    )
    returning id into new_company;

    insert into public.company_members (company_id, user_id, is_admin, can_create, can_update, can_delete, can_settle)
    values (new_company, r.user_id, true, true, true, true, true);

    insert into public.profiles (user_id, active_company_id)
    values (r.user_id, new_company)
    on conflict (user_id) do update
      set active_company_id = coalesce(public.profiles.active_company_id, excluded.active_company_id);

    foreach t in array data_tables loop
      execute format('update public.%I set company_id = $1 where user_id = $2 and company_id is null', t)
        using new_company, r.user_id;
    end loop;
  end loop;
end $$;

-- Depois da migração, todo registro precisa ter empresa
do $$
declare
  t text;
  data_tables text[] := array[
    'appointments', 'bank_accounts', 'bank_transactions', 'card_settlements',
    'card_transactions', 'clients', 'credit_cards', 'management_accounts',
    'payables', 'receivables', 'suppliers'
  ];
begin
  foreach t in array data_tables loop
    execute format('alter table public.%I alter column company_id set not null', t);
  end loop;
end $$;

---------------------------------------------------------------------------
-- 8) NOVOS REGISTROS ENTRAM NA EMPRESA ABERTA
---------------------------------------------------------------------------
create or replace function public.set_company_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;

  if new.company_id is null then
    raise exception 'Abra ou crie uma empresa antes de cadastrar.';
  end if;

  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  return new;
end;
$$;

-- "aa_" para rodar antes das outras validações (os gatilhos rodam em ordem alfabética)
do $$
declare
  t text;
  data_tables text[] := array[
    'appointments', 'bank_accounts', 'bank_transactions', 'card_settlements',
    'card_transactions', 'clients', 'credit_cards', 'management_accounts',
    'payables', 'receivables', 'suppliers'
  ];
begin
  foreach t in array data_tables loop
    execute format('drop trigger if exists aa_set_company_id on public.%I', t);
    execute format(
      'create trigger aa_set_company_id before insert on public.%I for each row execute function public.set_company_id()',
      t
    );
  end loop;
end $$;

---------------------------------------------------------------------------
-- 9) REGRAS DE SEGURANÇA (RLS): por empresa e por permissão
--    Ver: membro da empresa aberta. Cadastrar/alterar/excluir: precisa da permissão.
---------------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  data_tables text[] := array[
    'appointments', 'bank_accounts', 'bank_transactions', 'card_settlements',
    'card_transactions', 'clients', 'credit_cards', 'management_accounts',
    'payables', 'receivables', 'suppliers'
  ];
begin
  foreach t in array data_tables loop
    execute format('alter table public.%I enable row level security', t);

    -- Remove as regras antigas ("cada usuário só vê o que é seu")
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (company_id = (select public.current_company_id()))',
      t || '_select_company', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (company_id = (select public.current_company_id()) and (select public.has_company_permission(''create'')))',
      t || '_insert_company', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (company_id = (select public.current_company_id()) and (select public.has_company_permission(''update''))) with check (company_id = (select public.current_company_id()))',
      t || '_update_company', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (company_id = (select public.current_company_id()) and (select public.has_company_permission(''delete'')))',
      t || '_delete_company', t
    );
  end loop;
end $$;

-- Empresas: membro vê; administrador altera e exclui; criar só pela função create_company
alter table public.companies enable row level security;
grant select, update, delete on public.companies to authenticated;

drop policy if exists companies_select_member on public.companies;
drop policy if exists companies_update_admin on public.companies;
drop policy if exists companies_delete_admin on public.companies;

create policy companies_select_member on public.companies
  for select to authenticated using ((select public.is_company_member(id)));
create policy companies_update_admin on public.companies
  for update to authenticated
  using ((select public.is_company_admin(id)))
  with check ((select public.is_company_admin(id)));
create policy companies_delete_admin on public.companies
  for delete to authenticated using ((select public.is_company_admin(id)));

-- Membros: quem é da empresa vê os colegas; mudanças só pelas funções abaixo
alter table public.company_members enable row level security;
grant select on public.company_members to authenticated;

drop policy if exists company_members_select on public.company_members;
create policy company_members_select on public.company_members
  for select to authenticated using ((select public.is_company_member(company_id)));

-- Convites: só o administrador da empresa vê
alter table public.company_invites enable row level security;
grant select on public.company_invites to authenticated;

drop policy if exists company_invites_select_admin on public.company_invites;
create policy company_invites_select_admin on public.company_invites
  for select to authenticated using ((select public.is_company_admin(company_id)));

revoke all on public.companies, public.company_members, public.company_invites from anon;

---------------------------------------------------------------------------
-- 10) REGRAS QUE COMPARAVAM USUÁRIO AGORA COMPARAM EMPRESA
---------------------------------------------------------------------------

-- Conta gerencial do lançamento precisa ser da mesma empresa e do tipo certo
create or replace function public.validate_entry_management_account()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  account_row public.management_accounts%rowtype;
  expected_type text;
begin
  if new.management_account_id is null then
    return new;
  end if;

  expected_type := case tg_table_name
    when 'payables' then 'despesa'
    else 'receita'
  end;

  select * into account_row
    from public.management_accounts
   where id = new.management_account_id;

  if not found or account_row.company_id <> new.company_id then
    raise exception 'Conta gerencial não encontrada.';
  end if;

  if account_row.type <> expected_type then
    if expected_type = 'despesa' then
      raise exception 'Contas a pagar só aceitam contas gerenciais de despesa.';
    else
      raise exception 'Contas a receber só aceitam contas gerenciais de receita.';
    end if;
  end if;

  return new;
end;
$$;

-- Árvore de contas gerenciais: conta pai da mesma empresa
create or replace function public.management_accounts_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_row public.management_accounts%rowtype;
  ancestor uuid;
begin
  if tg_op = 'UPDATE'
     and new.type <> old.type
     and exists (select 1 from public.management_accounts where parent_id = new.id) then
    raise exception 'Não é possível trocar o tipo de uma conta que tem subcontas.';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Uma conta não pode ficar dentro dela mesma.';
  end if;

  select * into parent_row
    from public.management_accounts
   where id = new.parent_id;

  if not found or parent_row.company_id <> new.company_id then
    raise exception 'Conta pai não encontrada.';
  end if;

  if parent_row.type <> new.type then
    raise exception 'A subconta precisa ser do mesmo tipo da conta pai (%).', parent_row.type;
  end if;

  ancestor := parent_row.parent_id;

  while ancestor is not null loop
    if ancestor = new.id then
      raise exception 'Essa conta pai está dentro da própria conta.';
    end if;

    select parent_id into ancestor
      from public.management_accounts
     where id = ancestor;
  end loop;

  return new;
end;
$$;

-- Nome único por nível agora é por empresa
drop index if exists public.management_accounts_unique_name_idx;
create unique index if not exists management_accounts_unique_name_company_idx
  on public.management_accounts (
    company_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );

drop index if exists public.clients_state_city_idx;
drop index if exists public.suppliers_state_city_idx;
create index if not exists clients_company_state_city_idx on public.clients (company_id, state, city);
create index if not exists suppliers_company_state_city_idx on public.suppliers (company_id, state, city);

---------------------------------------------------------------------------
-- 11) PAGAR, RECEBER E ESTORNAR: exigem a permissão "baixar"
--     security definer + checagens explícitas: quem pode baixar não precisa poder cadastrar
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
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  payable_row public.payables%rowtype;
  account_row public.bank_accounts%rowtype;
  transaction_id uuid;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_company_permission('settle') then
    raise exception 'Você não tem permissão para baixar contas nesta empresa.';
  end if;

  if p_value is null or p_value <= 0 then
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

  insert into public.bank_transactions (
    user_id, company_id, bank_account_id, payable_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), company, p_account_id, p_payable_id, p_date,
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
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_company_permission('settle') then
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

create or replace function public.receive_receivable(
  p_receivable_id uuid,
  p_account_id uuid,
  p_date date,
  p_value numeric,
  p_notes text default null
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
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_company_permission('settle') then
    raise exception 'Você não tem permissão para baixar contas nesta empresa.';
  end if;

  if p_value is null or p_value <= 0 then
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

  insert into public.bank_transactions (
    user_id, company_id, bank_account_id, receivable_id, transaction_date, description, value,
    transaction_type, reference_type, reference_id
  ) values (
    auth.uid(), company, p_account_id, p_receivable_id, p_date,
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
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_company_permission('settle') then
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

  if receivable_row.bank_transaction_id is not null then
    delete from public.bank_transactions
     where id = receivable_row.bank_transaction_id;
  end if;
end;
$$;

---------------------------------------------------------------------------
-- 12) FUNÇÕES DE EMPRESA, MEMBROS E CONVITES
---------------------------------------------------------------------------

-- Criar empresa: quem ainda não tem nenhuma (primeira empresa) ou quem já é
-- administrador de alguma. Quem cria vira administrador e a empresa já abre.
create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login primeiro.';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Informe o nome da empresa.';
  end if;

  if exists (select 1 from public.company_members where user_id = auth.uid())
     and not exists (select 1 from public.company_members where user_id = auth.uid() and is_admin) then
    raise exception 'Só administradores podem criar empresas.';
  end if;

  insert into public.companies (name, created_by)
  values (btrim(p_name), auth.uid())
  returning id into new_company;

  insert into public.company_members (company_id, user_id, is_admin, can_create, can_update, can_delete, can_settle)
  values (new_company, auth.uid(), true, true, true, true, true);

  insert into public.profiles (user_id, active_company_id)
  values (auth.uid(), new_company)
  on conflict (user_id) do update set active_company_id = excluded.active_company_id;

  return new_company;
end;
$$;

-- Trocar a empresa aberta
create or replace function public.set_active_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'Você não participa desta empresa.';
  end if;

  update public.profiles
     set active_company_id = p_company_id, updated_at = now()
   where user_id = auth.uid();
end;
$$;

-- Usuários da empresa aberta, com nome e e-mail
create or replace function public.list_company_members()
returns table (
  user_id uuid,
  full_name text,
  email text,
  is_admin boolean,
  can_create boolean,
  can_update boolean,
  can_delete boolean,
  can_settle boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, p.full_name, u.email::text,
         m.is_admin, m.can_create, m.can_update, m.can_delete, m.can_settle, m.created_at
    from public.company_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
   where m.company_id = public.current_company_id()
   order by m.is_admin desc, m.created_at
$$;

-- Mudar as permissões de um usuário (só administrador; a empresa nunca fica sem administrador)
create or replace function public.update_member_permissions(
  p_user_id uuid,
  p_is_admin boolean,
  p_can_create boolean,
  p_can_update boolean,
  p_can_delete boolean,
  p_can_settle boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
begin
  if not public.has_company_permission('admin') then
    raise exception 'Só administradores podem mudar permissões.';
  end if;

  if not exists (select 1 from public.company_members where company_id = company and user_id = p_user_id) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  if not p_is_admin
     and not exists (
       select 1 from public.company_members
        where company_id = company and is_admin and user_id <> p_user_id
     ) then
    raise exception 'A empresa precisa ter pelo menos um administrador.';
  end if;

  update public.company_members
     set is_admin = p_is_admin,
         can_create = p_is_admin or p_can_create,
         can_update = p_is_admin or p_can_update,
         can_delete = p_is_admin or p_can_delete,
         can_settle = p_is_admin or p_can_settle
   where company_id = company and user_id = p_user_id;
end;
$$;

-- Tirar um usuário da empresa (administrador tira outros; qualquer um pode sair)
create or replace function public.remove_member(p_user_id uuid)
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

  if p_user_id <> auth.uid() and not public.has_company_permission('admin') then
    raise exception 'Só administradores podem remover usuários.';
  end if;

  if exists (select 1 from public.company_members where company_id = company and user_id = p_user_id and is_admin)
     and not exists (
       select 1 from public.company_members
        where company_id = company and is_admin and user_id <> p_user_id
     ) then
    raise exception 'A empresa precisa ter pelo menos um administrador.';
  end if;

  delete from public.company_members
   where company_id = company and user_id = p_user_id;

  update public.profiles
     set active_company_id = null
   where user_id = p_user_id and active_company_id = company;
end;
$$;

-- Gerar código de convite com as permissões (só administrador). Vale 7 dias e uma vez.
create or replace function public.create_invite(
  p_is_admin boolean,
  p_can_create boolean,
  p_can_update boolean,
  p_can_delete boolean,
  p_can_settle boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  new_code text;
begin
  if not public.has_company_permission('admin') then
    raise exception 'Só administradores podem convidar usuários.';
  end if;

  loop
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (select 1 from public.company_invites where code = new_code);
  end loop;

  insert into public.company_invites (company_id, code, is_admin, can_create, can_update, can_delete, can_settle)
  values (
    company, new_code, p_is_admin,
    p_is_admin or p_can_create, p_is_admin or p_can_update,
    p_is_admin or p_can_delete, p_is_admin or p_can_settle
  );

  return new_code;
end;
$$;

-- Cancelar um convite ainda não usado
create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.company_invites i
     where i.id = p_invite_id and public.is_company_admin(i.company_id)
  ) then
    raise exception 'Convite não encontrado.';
  end if;

  delete from public.company_invites where id = p_invite_id and used_at is null;
end;
$$;

-- Entrar numa empresa com o código (a empresa já abre)
create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.company_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Faça login primeiro.';
  end if;

  select * into invite
    from public.company_invites
   where code = upper(btrim(p_code))
   for update;

  if not found or invite.used_at is not null or invite.expires_at < now() then
    raise exception 'Código inválido, já usado ou vencido.';
  end if;

  if exists (select 1 from public.company_members where company_id = invite.company_id and user_id = auth.uid()) then
    raise exception 'Você já participa desta empresa.';
  end if;

  insert into public.company_members (company_id, user_id, is_admin, can_create, can_update, can_delete, can_settle)
  values (invite.company_id, auth.uid(), invite.is_admin, invite.can_create, invite.can_update, invite.can_delete, invite.can_settle);

  update public.company_invites
     set used_by = auth.uid(), used_at = now()
   where id = invite.id;

  insert into public.profiles (user_id, active_company_id)
  values (auth.uid(), invite.company_id)
  on conflict (user_id) do update set active_company_id = excluded.active_company_id;

  return invite.company_id;
end;
$$;

---------------------------------------------------------------------------
-- 13) PERMISSÕES DAS FUNÇÕES: só quem está logado
---------------------------------------------------------------------------
do $$
declare
  f text;
  fns text[] := array[
    'public.current_company_id()',
    'public.has_company_permission(text)',
    'public.is_company_member(uuid)',
    'public.is_company_admin(uuid)',
    'public.pay_payable(uuid, uuid, date, numeric, text)',
    'public.reverse_payable_payment(uuid)',
    'public.receive_receivable(uuid, uuid, date, numeric, text)',
    'public.reverse_receivable_receipt(uuid)',
    'public.create_company(text)',
    'public.set_active_company(uuid)',
    'public.list_company_members()',
    'public.update_member_permissions(uuid, boolean, boolean, boolean, boolean, boolean)',
    'public.remove_member(uuid)',
    'public.create_invite(boolean, boolean, boolean, boolean, boolean)',
    'public.revoke_invite(uuid)',
    'public.accept_invite(text)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
