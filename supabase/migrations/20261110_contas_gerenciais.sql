-- Contas gerenciais (plano de contas de receitas e despesas)
-- Cada conta tem nome, tipo (receita ou despesa), natureza (fixa ou variável)
-- e pode ficar dentro de uma conta pai, em quantos níveis quiser.
-- Ex.: RECEITA TRABALHO > Empresa X
--      RECEITA TRABALHO > Serviços de técnico
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

create table if not exists public.management_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  parent_id uuid
    references public.management_accounts (id) on delete restrict,
  name text not null,
  type text not null,
  nature text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint management_accounts_name_check
    check (length(btrim(name)) > 0),
  constraint management_accounts_type_check
    check (type in ('receita', 'despesa')),
  constraint management_accounts_nature_check
    check (nature in ('fixa', 'variavel'))
);

create index if not exists management_accounts_user_idx
  on public.management_accounts (user_id);

create index if not exists management_accounts_parent_idx
  on public.management_accounts (parent_id);

-- Não deixa duas contas com o mesmo nome dentro da mesma conta pai
create unique index if not exists management_accounts_unique_name_idx
  on public.management_accounts (
    user_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );

-- Regras da árvore:
-- 1. a conta pai precisa ser do mesmo usuário e do mesmo tipo
-- 2. uma conta não pode ficar dentro dela mesma (nem de uma filha dela)
-- 3. o tipo de uma conta que já tem filhas não pode ser trocado
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
     and exists (
       select 1
       from public.management_accounts
       where parent_id = new.id
     ) then
    raise exception 'Não é possível trocar o tipo de uma conta que tem subcontas.';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Uma conta não pode ficar dentro dela mesma.';
  end if;

  select *
    into parent_row
    from public.management_accounts
   where id = new.parent_id;

  if not found or parent_row.user_id <> new.user_id then
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

    select parent_id
      into ancestor
      from public.management_accounts
     where id = ancestor;
  end loop;

  return new;
end;
$$;

drop trigger if exists management_accounts_validate_trigger
  on public.management_accounts;

create trigger management_accounts_validate_trigger
  before insert or update on public.management_accounts
  for each row
  execute function public.management_accounts_validate();

-- Segurança: cada usuário só vê e altera as próprias contas
alter table public.management_accounts enable row level security;

grant select, insert, update, delete
  on public.management_accounts
  to authenticated;

drop policy if exists management_accounts_select_own on public.management_accounts;
drop policy if exists management_accounts_insert_own on public.management_accounts;
drop policy if exists management_accounts_update_own on public.management_accounts;
drop policy if exists management_accounts_delete_own on public.management_accounts;

create policy management_accounts_select_own
  on public.management_accounts
  for select to authenticated
  using (auth.uid() = user_id);

create policy management_accounts_insert_own
  on public.management_accounts
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy management_accounts_update_own
  on public.management_accounts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy management_accounts_delete_own
  on public.management_accounts
  for delete to authenticated
  using (auth.uid() = user_id);
