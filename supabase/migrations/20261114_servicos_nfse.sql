-- SERVIÇOS: Cadastro de serviços e Notas de serviço (NFS-e)
-- Rode DEPOIS de 20261114_campos_nfse.sql.
--
-- Menu novo SERVIÇOS:
--   - Nota de serviço (tela "notas_servico"): montar a NFS-e (rascunho),
--     editar, emitir/cancelar (Baixar = emitir e cancelar).
--   - Cadastro de serviços (tela "servicos"): serviços com os dados da NFS-e
--     do padrão nacional (código de tributação nacional, ISS, retenções...).
--
-- A emissão de verdade (enviar à prefeitura / Sefin Nacional) depende da API
-- de emissão, que ainda não foi escolhida: por enquanto as notas ficam como
-- RASCUNHO. A estrutura de situação (processando, autorizada, rejeitada,
-- cancelada), número, chave, PDF e XML já existe para quando ligarmos.
--
-- Os valores (ISS, retenções, líquido) são calculados AQUI, no banco.

---------------------------------------------------------------------------
-- 1) PERMISSÕES DAS TELAS NOVAS
---------------------------------------------------------------------------
alter table public.company_member_permissions
  drop constraint if exists company_member_permissions_module_check;

alter table public.company_member_permissions
  add constraint company_member_permissions_module_check check (module in (
    'painel', 'relatorios', 'clientes', 'fornecedores', 'contas_pagar', 'contas_receber',
    'caixa', 'contas_bancarias', 'cartoes', 'contas_gerenciais', 'agenda',
    'servicos', 'notas_servico'
  ));

-- Quem já está na empresa: Serviços igual a Clientes; Notas igual a Contas a Receber
insert into public.company_member_permissions (
  company_id, user_id, module, can_view, can_create, can_update, can_delete, can_settle
)
select p.company_id, p.user_id, 'servicos', p.can_view, p.can_create, p.can_update, p.can_delete, false
  from public.company_member_permissions p
 where p.module = 'clientes'
on conflict do nothing;

insert into public.company_member_permissions (
  company_id, user_id, module, can_view, can_create, can_update, can_delete, can_settle
)
select p.company_id, p.user_id, 'notas_servico', p.can_view, p.can_create, p.can_update, p.can_delete, p.can_settle
  from public.company_member_permissions p
 where p.module = 'contas_receber'
on conflict do nothing;

-- Convites ainda não usados
update public.company_invites
   set module_permissions = module_permissions
       || jsonb_build_object('servicos', coalesce(module_permissions -> 'clientes', '{}'::jsonb))
       || jsonb_build_object('notas_servico', coalesce(module_permissions -> 'contas_receber', '{}'::jsonb))
 where used_at is null
   and not (module_permissions ? 'servicos');

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
         e.key in ('contas_pagar', 'contas_receber', 'cartoes', 'notas_servico') and coalesce((e.value->>'settle')::boolean, false)
    from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) e
   where e.key in (
     'painel', 'relatorios', 'clientes', 'fornecedores', 'contas_pagar', 'contas_receber',
     'caixa', 'contas_bancarias', 'cartoes', 'contas_gerenciais', 'agenda',
     'servicos', 'notas_servico'
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
-- 2) CADASTRO DE SERVIÇOS
---------------------------------------------------------------------------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  user_id uuid default auth.uid(),

  -- Identificação (obrigatórios)
  code text not null,
  description text not null,
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),

  -- NFS-e padrão nacional
  national_tax_code text not null,          -- cTribNac (6 números: item, subitem, desdobro da LC 116)
  municipal_tax_code text,                  -- cTribMun (opcional, 3 números)
  nbs_code text,                            -- código NBS (opcional, 9 números)
  cnae text,                                -- CNAE do serviço (opcional, 7 números)
  iss_taxation text not null default 'tributavel'
    check (iss_taxation in ('tributavel', 'imunidade', 'exportacao', 'nao_incidencia')),
  iss_rate numeric(5, 2) not null default 0 check (iss_rate between 0 and 5),
  iss_withheld boolean not null default false,

  -- Retenções federais (opcionais, em %)
  pis_rate numeric(5, 2) not null default 0 check (pis_rate between 0 and 100),
  cofins_rate numeric(5, 2) not null default 0 check (cofins_rate between 0 and 100),
  csll_rate numeric(5, 2) not null default 0 check (csll_rate between 0 and 100),
  irrf_rate numeric(5, 2) not null default 0 check (irrf_rate between 0 and 100),
  inss_rate numeric(5, 2) not null default 0 check (inss_rate between 0 and 100),

  -- Financeiro (opcional)
  management_account_id uuid references public.management_accounts (id) on delete set null,
  category text,

  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint services_code_check check (btrim(code) <> ''),
  constraint services_description_check check (btrim(description) <> ''),
  constraint services_national_tax_code_check check (national_tax_code ~ '^[0-9]{6}$'),
  constraint services_municipal_tax_code_check check (municipal_tax_code is null or municipal_tax_code ~ '^[0-9]{3}$'),
  constraint services_nbs_check check (nbs_code is null or nbs_code ~ '^[0-9]{9}$'),
  constraint services_cnae_check check (cnae is null or cnae ~ '^[0-9]{7}$')
);

create unique index if not exists services_company_code_uidx
  on public.services (company_id, lower(btrim(code)));

create index if not exists services_company_idx on public.services (company_id);

alter table public.services enable row level security;

drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select to authenticated
  using (company_id = (select public.current_company_id()));

drop policy if exists services_insert_company on public.services;
create policy services_insert_company on public.services
  for insert to authenticated
  with check (company_id = (select public.current_company_id()) and public.has_module_permission('servicos', 'create'));

drop policy if exists services_update_company on public.services;
create policy services_update_company on public.services
  for update to authenticated
  using (company_id = (select public.current_company_id()) and public.has_module_permission('servicos', 'update'))
  with check (company_id = (select public.current_company_id()) and public.has_module_permission('servicos', 'update'));

drop policy if exists services_delete_company on public.services;
create policy services_delete_company on public.services
  for delete to authenticated
  using (company_id = (select public.current_company_id()) and public.has_module_permission('servicos', 'delete'));

grant select, insert, update, delete on public.services to authenticated;

-- Conta gerencial do serviço: da mesma empresa e de receita
create or replace function public.validate_service_management_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.management_account_id is not null and not exists (
    select 1 from public.management_accounts
     where id = new.management_account_id and company_id = new.company_id and type = 'receita'
  ) then
    raise exception 'Escolha uma conta gerencial de receita desta empresa.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists services_validate on public.services;
create trigger services_validate
  before insert or update on public.services
  for each row execute function public.validate_service_management_account();

---------------------------------------------------------------------------
-- 3) NOTAS DE SERVIÇO (NFS-e)
---------------------------------------------------------------------------
create table if not exists public.service_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  user_id uuid default auth.uid(),

  status text not null default 'rascunho'
    check (status in ('rascunho', 'processando', 'autorizada', 'rejeitada', 'cancelada')),
  environment text not null default 'homologacao' check (environment in ('homologacao', 'producao')),

  -- Numeração (preenchida na emissão)
  series text,
  dps_number integer,
  nfse_number text,
  access_key text,
  verification_code text,

  issue_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  competence_date date not null default (now() at time zone 'America/Sao_Paulo')::date,

  -- Tomador
  client_id uuid not null references public.clients (id) on delete restrict,

  -- Serviço (copiado do cadastro; descrição e valor editáveis na nota)
  service_id uuid references public.services (id) on delete set null,
  service_code text not null,
  national_tax_code text not null check (national_tax_code ~ '^[0-9]{6}$'),
  municipal_tax_code text,
  nbs_code text,
  description text not null check (btrim(description) <> ''),

  -- Valores informados
  amount numeric(14, 2) not null check (amount > 0),
  unconditional_discount numeric(14, 2) not null default 0 check (unconditional_discount >= 0),
  deductions numeric(14, 2) not null default 0 check (deductions >= 0),

  iss_taxation text not null default 'tributavel'
    check (iss_taxation in ('tributavel', 'imunidade', 'exportacao', 'nao_incidencia')),
  iss_rate numeric(5, 2) not null default 0 check (iss_rate between 0 and 5),
  iss_withheld boolean not null default false,
  pis_rate numeric(5, 2) not null default 0 check (pis_rate between 0 and 100),
  cofins_rate numeric(5, 2) not null default 0 check (cofins_rate between 0 and 100),
  csll_rate numeric(5, 2) not null default 0 check (csll_rate between 0 and 100),
  irrf_rate numeric(5, 2) not null default 0 check (irrf_rate between 0 and 100),
  inss_rate numeric(5, 2) not null default 0 check (inss_rate between 0 and 100),

  -- Valores calculados (pelo gatilho abaixo)
  tax_base numeric(14, 2) not null default 0,
  iss_amount numeric(14, 2) not null default 0,
  pis_amount numeric(14, 2) not null default 0,
  cofins_amount numeric(14, 2) not null default 0,
  csll_amount numeric(14, 2) not null default 0,
  irrf_amount numeric(14, 2) not null default 0,
  inss_amount numeric(14, 2) not null default 0,
  net_amount numeric(14, 2) not null default 0,

  notes text,                               -- informações complementares

  -- Retorno da emissão (quando a API for ligada)
  rejection_reason text,
  cancel_reason text,
  authorized_at timestamptz,
  canceled_at timestamptz,
  pdf_url text,
  xml_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_invoices_company_date_idx
  on public.service_invoices (company_id, issue_date desc);

create index if not exists service_invoices_client_idx on public.service_invoices (client_id);

-- Cálculo dos valores e trava: só rascunho se altera ou exclui pela tela
create or replace function public.service_invoice_compute()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base numeric;
begin
  if tg_op = 'UPDATE' and old.status <> 'rascunho'
     and coalesce(current_setting('razao.nfse_system', true), '') <> 'on' then
    raise exception 'Só nota em rascunho pode ser alterada.';
  end if;

  v_base := round(new.amount - new.unconditional_discount - new.deductions, 2);

  if v_base <= 0 then
    raise exception 'O valor do serviço precisa ser maior que o desconto e as deduções.';
  end if;

  new.tax_base := v_base;
  new.iss_amount := case when new.iss_taxation = 'tributavel' then round(v_base * new.iss_rate / 100, 2) else 0 end;
  new.pis_amount := round(v_base * new.pis_rate / 100, 2);
  new.cofins_amount := round(v_base * new.cofins_rate / 100, 2);
  new.csll_amount := round(v_base * new.csll_rate / 100, 2);
  new.irrf_amount := round(v_base * new.irrf_rate / 100, 2);
  new.inss_amount := round(v_base * new.inss_rate / 100, 2);

  -- Líquido = valor − desconto incondicional − retenções (ISS só se retido)
  new.net_amount := round(
    new.amount - new.unconditional_discount
    - case when new.iss_withheld then new.iss_amount else 0 end
    - new.pis_amount - new.cofins_amount - new.csll_amount - new.irrf_amount - new.inss_amount,
    2
  );

  if new.net_amount < 0 then
    raise exception 'As retenções são maiores que o valor da nota.';
  end if;

  if not exists (select 1 from public.clients where id = new.client_id and company_id = new.company_id) then
    raise exception 'Escolha um cliente (tomador) desta empresa.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists service_invoices_compute on public.service_invoices;
create trigger service_invoices_compute
  before insert or update on public.service_invoices
  for each row execute function public.service_invoice_compute();

create or replace function public.service_invoice_block_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'rascunho'
     and exists (select 1 from public.companies where id = old.company_id) then
    raise exception 'Só nota em rascunho pode ser excluída. Nota emitida se cancela.';
  end if;

  return old;
end;
$$;

drop trigger if exists service_invoices_block_delete on public.service_invoices;
create trigger service_invoices_block_delete
  before delete on public.service_invoices
  for each row execute function public.service_invoice_block_delete();

alter table public.service_invoices enable row level security;

drop policy if exists service_invoices_select on public.service_invoices;
create policy service_invoices_select on public.service_invoices
  for select to authenticated
  using (company_id = (select public.current_company_id()) and public.has_module_permission('notas_servico', 'view'));

drop policy if exists service_invoices_insert_company on public.service_invoices;
create policy service_invoices_insert_company on public.service_invoices
  for insert to authenticated
  with check (
    company_id = (select public.current_company_id())
    and public.has_module_permission('notas_servico', 'create')
    and status = 'rascunho'
  );

drop policy if exists service_invoices_update_company on public.service_invoices;
create policy service_invoices_update_company on public.service_invoices
  for update to authenticated
  using (company_id = (select public.current_company_id()) and public.has_module_permission('notas_servico', 'update'))
  with check (
    company_id = (select public.current_company_id())
    and public.has_module_permission('notas_servico', 'update')
    and status = 'rascunho'
  );

drop policy if exists service_invoices_delete_company on public.service_invoices;
create policy service_invoices_delete_company on public.service_invoices
  for delete to authenticated
  using (company_id = (select public.current_company_id()) and public.has_module_permission('notas_servico', 'delete'));

grant select, insert, update, delete on public.service_invoices to authenticated;

-- Serviço usado em nota não se exclui (inative)
create or replace function public.service_block_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.companies where id = old.company_id)
     and exists (select 1 from public.service_invoices where service_id = old.id) then
    raise exception 'O serviço "%" já foi usado em nota de serviço e não pode ser excluído. Use "Inativar".', old.description;
  end if;

  return old;
end;
$$;

drop trigger if exists services_block_delete on public.services;
create trigger services_block_delete
  before delete on public.services
  for each row execute function public.service_block_delete();

revoke all on function public.validate_service_management_account() from public, anon, authenticated;
revoke all on function public.service_invoice_compute() from public, anon, authenticated;
revoke all on function public.service_invoice_block_delete() from public, anon, authenticated;
revoke all on function public.service_block_delete() from public, anon, authenticated;

notify pgrst, 'reload schema';
