-- Permissões por tela.
-- Cada usuário tem, em cada tela, as opções Ver, Cadastrar, Alterar, Excluir e
-- Baixar (só Contas a Pagar e Contas a Receber). O administrador pode tudo.
--
-- Telas (módulos):
--   painel, relatorios                          -> só Ver
--   clientes, fornecedores                      -> Cadastros
--   contas_pagar, contas_receber                -> Financeiro / Lançamentos (com Baixar)
--   caixa, contas_bancarias, cartoes,
--   contas_gerenciais                           -> Financeiro / Contas e caixa
--
-- Quem já está na empresa recebe em todas as telas as mesmas permissões que
-- tinha antes (Ver em todas). Nada muda até o administrador ajustar.
--
-- "Ver" esconde a tela do menu. Os dados de uma tela continuam podendo
-- aparecer em listas de outras (ex.: fornecedores na conta a pagar).
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

---------------------------------------------------------------------------
-- 1) TABELA DE PERMISSÕES POR TELA
---------------------------------------------------------------------------
create table if not exists public.company_member_permissions (
  company_id uuid not null,
  user_id uuid not null,
  module text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  can_settle boolean not null default false,
  primary key (company_id, user_id, module),
  foreign key (company_id, user_id)
    references public.company_members (company_id, user_id) on delete cascade,
  constraint company_member_permissions_module_check check (module in (
    'painel', 'relatorios', 'clientes', 'fornecedores', 'contas_pagar', 'contas_receber',
    'caixa', 'contas_bancarias', 'cartoes', 'contas_gerenciais'
  ))
);

alter table public.company_member_permissions enable row level security;
grant select on public.company_member_permissions to authenticated;
revoke all on public.company_member_permissions from anon;

-- Cada um vê as próprias; o administrador vê as de todos. Mudar só pelas funções.
drop policy if exists company_member_permissions_select on public.company_member_permissions;
create policy company_member_permissions_select on public.company_member_permissions
  for select to authenticated
  using (user_id = auth.uid() or (select public.is_company_admin(company_id)));

-- Convite guarda as permissões por tela
alter table public.company_invites
  add column if not exists module_permissions jsonb not null default '{}'::jsonb;

---------------------------------------------------------------------------
-- 2) PASSA AS PERMISSÕES ANTIGAS PARA TODAS AS TELAS (só quem ainda não tem)
---------------------------------------------------------------------------
insert into public.company_member_permissions (
  company_id, user_id, module, can_view, can_create, can_update, can_delete, can_settle
)
select m.company_id, m.user_id, mod.module, true,
       mod.module not in ('painel', 'relatorios') and (m.is_admin or m.can_create),
       mod.module not in ('painel', 'relatorios') and (m.is_admin or m.can_update),
       mod.module not in ('painel', 'relatorios') and (m.is_admin or m.can_delete),
       mod.module in ('contas_pagar', 'contas_receber') and (m.is_admin or m.can_settle)
  from public.company_members m
 cross join unnest(array[
   'painel', 'relatorios', 'clientes', 'fornecedores', 'contas_pagar', 'contas_receber',
   'caixa', 'contas_bancarias', 'cartoes', 'contas_gerenciais'
 ]) as mod(module)
 where not exists (
   select 1 from public.company_member_permissions p
    where p.company_id = m.company_id and p.user_id = m.user_id
 )
on conflict do nothing;

-- Convites ainda não usados: mesmas permissões antigas em todas as telas
update public.company_invites i
   set module_permissions = (
     select jsonb_object_agg(u.module, jsonb_build_object(
       'view', true,
       'create', u.module not in ('painel', 'relatorios') and (i.is_admin or i.can_create),
       'update', u.module not in ('painel', 'relatorios') and (i.is_admin or i.can_update),
       'delete', u.module not in ('painel', 'relatorios') and (i.is_admin or i.can_delete),
       'settle', u.module in ('contas_pagar', 'contas_receber') and (i.is_admin or i.can_settle)
     ))
       from unnest(array[
         'painel', 'relatorios', 'clientes', 'fornecedores', 'contas_pagar', 'contas_receber',
         'caixa', 'contas_bancarias', 'cartoes', 'contas_gerenciais'
       ]) as u(module)
   )
 where i.used_at is null and i.module_permissions = '{}'::jsonb;

---------------------------------------------------------------------------
-- 3) O USUÁRIO PODE FAZER ISSO NESTA TELA? (view | create | update | delete | settle)
---------------------------------------------------------------------------
create or replace function public.has_module_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select m.is_admin or coalesce((
      select case p_action
               when 'view'   then p.can_view
               when 'create' then p.can_create
               when 'update' then p.can_update
               when 'delete' then p.can_delete
               when 'settle' then p.can_settle
               else false
             end
        from public.company_member_permissions p
       where p.company_id = m.company_id
         and p.user_id = m.user_id
         and p.module = p_module
    ), false)
      from public.company_members m
     where m.user_id = auth.uid()
       and m.company_id = public.current_company_id()
  ), false)
$$;

-- Caixa e contas bancárias ficam na mesma tabela: a tela vem do tipo da conta
create or replace function public.bank_account_module(p_account_type text)
returns text
language sql
immutable
as $$
  select case when p_account_type = 'caixa' then 'caixa' else 'contas_bancarias' end
$$;

---------------------------------------------------------------------------
-- 4) REGRAS DE CADASTRAR / ALTERAR / EXCLUIR POR TELA
--    Ver os dados continua valendo para todo usuário da empresa aberta.
---------------------------------------------------------------------------
do $$
declare
  t text;
  module_expr text;
  pairs text[][] := array[
    ['clients', '''clientes'''],
    ['suppliers', '''fornecedores'''],
    ['payables', '''contas_pagar'''],
    ['receivables', '''contas_receber'''],
    ['management_accounts', '''contas_gerenciais'''],
    ['credit_cards', '''cartoes'''],
    ['card_transactions', '''cartoes'''],
    ['card_settlements', '''cartoes'''],
    ['bank_transactions', '''caixa'''],
    ['bank_accounts', 'public.bank_account_module(account_type)']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    t := pairs[i][1];
    module_expr := pairs[i][2];

    execute format('drop policy if exists %I on public.%I', t || '_insert_company', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_company', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_company', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (company_id = (select public.current_company_id()) and public.has_module_permission(%s, ''create''))',
      t || '_insert_company', t, module_expr
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (company_id = (select public.current_company_id()) and public.has_module_permission(%s, ''update'')) with check (company_id = (select public.current_company_id()) and public.has_module_permission(%s, ''update''))',
      t || '_update_company', t, module_expr, module_expr
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (company_id = (select public.current_company_id()) and public.has_module_permission(%s, ''delete''))',
      t || '_delete_company', t, module_expr
    );
  end loop;
end $$;

---------------------------------------------------------------------------
-- 5) MUDAR AS PERMISSÕES DE UM USUÁRIO (só administrador)
--    p_permissions: {"clientes": {"view": true, "create": true, ...}, ...}
---------------------------------------------------------------------------
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
         e.key in ('contas_pagar', 'contas_receber') and coalesce((e.value->>'settle')::boolean, false)
    from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) e
   where e.key in (
     'painel', 'relatorios', 'clientes', 'fornecedores', 'contas_pagar', 'contas_receber',
     'caixa', 'contas_bancarias', 'cartoes', 'contas_gerenciais'
   );

  -- Permissões gerais antigas (usadas pela agenda): valem se tiver em alguma tela
  update public.company_members m
     set can_create = m.is_admin or exists (select 1 from public.company_member_permissions p where p.company_id = m.company_id and p.user_id = m.user_id and p.can_create),
         can_update = m.is_admin or exists (select 1 from public.company_member_permissions p where p.company_id = m.company_id and p.user_id = m.user_id and p.can_update),
         can_delete = m.is_admin or exists (select 1 from public.company_member_permissions p where p.company_id = m.company_id and p.user_id = m.user_id and p.can_delete),
         can_settle = m.is_admin or exists (select 1 from public.company_member_permissions p where p.company_id = m.company_id and p.user_id = m.user_id and p.can_settle)
   where m.company_id = p_company_id and m.user_id = p_user_id;
end;
$$;

-- Só as funções abaixo usam a de cima
revoke all on function public.apply_module_permissions(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.set_member_permissions(
  p_user_id uuid,
  p_is_admin boolean,
  p_permissions jsonb
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
     set is_admin = p_is_admin
   where company_id = company and user_id = p_user_id;

  perform public.apply_module_permissions(company, p_user_id, p_permissions);
end;
$$;

-- Versões antigas (permissões gerais) saem
drop function if exists public.update_member_permissions(uuid, boolean, boolean, boolean, boolean, boolean);
drop function if exists public.create_invite(boolean, boolean, boolean, boolean, boolean);

-- Gerar código de convite com as permissões por tela (só administrador)
create or replace function public.create_invite(
  p_is_admin boolean,
  p_permissions jsonb
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

  insert into public.company_invites (company_id, code, is_admin, module_permissions)
  values (company, new_code, p_is_admin, coalesce(p_permissions, '{}'::jsonb));

  return new_code;
end;
$$;

-- Entrar numa empresa com o código: recebe as permissões por tela do convite
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
  values (invite.company_id, auth.uid(), invite.is_admin, invite.is_admin, invite.is_admin, invite.is_admin, invite.is_admin);

  perform public.apply_module_permissions(invite.company_id, auth.uid(), invite.module_permissions);

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
-- 6) PAGAR / RECEBER / ESTORNAR: precisam de "Baixar" na tela certa
--    (mesmas funções de antes; só muda a checagem de permissão)
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

  if not public.has_module_permission('contas_pagar', 'settle') then
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

  if not public.has_module_permission('contas_receber', 'settle') then
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
-- 7) QUEM PODE CHAMAR AS FUNÇÕES: só quem está logado
---------------------------------------------------------------------------
do $$
declare
  f text;
  fns text[] := array[
    'public.has_module_permission(text, text)',
    'public.set_member_permissions(uuid, boolean, jsonb)',
    'public.create_invite(boolean, jsonb)',
    'public.accept_invite(text)',
    'public.pay_payable(uuid, uuid, date, numeric, text)',
    'public.reverse_payable_payment(uuid)',
    'public.receive_receivable(uuid, uuid, date, numeric, text)',
    'public.reverse_receivable_receipt(uuid)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Avisa a API do Supabase das mudanças na hora
notify pgrst, 'reload schema';