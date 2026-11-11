-- ID EMPRESA: cada cliente do sistema é um grupo ("empresa master") com um
-- número (ID) sequencial a partir do 2 — o ID 1 fica reservado para uso futuro.
-- As empresas do grupo ganham um sub-código 1, 2, 3...
--
-- No login a pessoa informa ID EMPRESA, e-mail e senha. O sistema só abre
-- empresas do ID informado; depois do login ela escolhe em qual vai operar.
--
-- Os dados atuais: cada dono de empresa vira um ID (o mais antigo fica com o 2)
-- e as empresas dele passam a ser as empresas 1, 2, 3... desse ID.
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

---------------------------------------------------------------------------
-- 1) TABELA DE IDs (GRUPOS)
---------------------------------------------------------------------------
create sequence if not exists public.company_groups_id_seq start with 2 minvalue 1;

create table if not exists public.company_groups (
  id integer primary key default nextval('public.company_groups_id_seq'),
  name text not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter sequence public.company_groups_id_seq owned by public.company_groups.id;

alter table public.companies
  add column if not exists group_id integer references public.company_groups (id) on delete restrict,
  add column if not exists code integer;

alter table public.profiles
  add column if not exists active_group_id integer references public.company_groups (id) on delete set null;

---------------------------------------------------------------------------
-- 2) DADOS ATUAIS: um ID por dono (o mais antigo primeiro), empresas numeradas
---------------------------------------------------------------------------
do $$
declare
  r record;
  new_group integer;
begin
  for r in
    with owners as (
      select c.id as company_id,
             c.created_at as company_created,
             coalesce(
               c.created_by,
               (select m.user_id from public.company_members m
                 where m.company_id = c.id and m.is_admin
                 order by m.created_at limit 1)
             ) as owner_id
        from public.companies c
       where c.group_id is null
    )
    select o.owner_id,
           min(coalesce(u.created_at, o.company_created)) as since
      from owners o
      left join auth.users u on u.id = o.owner_id
     group by o.owner_id
     order by since
  loop
    insert into public.company_groups (name, created_by)
    select coalesce(c.trade_name, c.name), r.owner_id
      from public.companies c
     where c.group_id is null
       and coalesce(c.created_by, (select m.user_id from public.company_members m
                                    where m.company_id = c.id and m.is_admin
                                    order by m.created_at limit 1)) is not distinct from r.owner_id
     order by c.created_at
     limit 1
    returning id into new_group;

    update public.companies c
       set group_id = new_group
     where c.group_id is null
       and coalesce(c.created_by, (select m.user_id from public.company_members m
                                    where m.company_id = c.id and m.is_admin
                                    order by m.created_at limit 1)) is not distinct from r.owner_id;
  end loop;

  -- Sub-código das empresas dentro de cada ID: 1, 2, 3... pela data de criação
  update public.companies c
     set code = numbered.n
    from (
      select id, row_number() over (partition by group_id order by created_at, id) as n
        from public.companies
    ) numbered
   where numbered.id = c.id
     and c.code is null;
end $$;

alter table public.companies alter column group_id set not null;
alter table public.companies alter column code set not null;

create unique index if not exists companies_group_code_idx on public.companies (group_id, code);

-- ID aberto de cada pessoa = o da empresa aberta dela
update public.profiles p
   set active_group_id = c.group_id
  from public.companies c
 where c.id = p.active_company_id
   and p.active_group_id is null;

---------------------------------------------------------------------------
-- 3) QUEM VÊ O ID: quem participa de alguma empresa dele
---------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.company_members m
      join public.companies c on c.id = m.company_id
     where c.group_id = p_group_id and m.user_id = auth.uid()
  )
$$;

alter table public.company_groups enable row level security;
grant select on public.company_groups to authenticated;
revoke all on public.company_groups from anon;

drop policy if exists company_groups_select_member on public.company_groups;
create policy company_groups_select_member on public.company_groups
  for select to authenticated using ((select public.is_group_member(id)));

-- Ninguém muda o ID ou o sub-código de uma empresa depois de criada
create or replace function public.lock_company_group_code()
returns trigger
language plpgsql
as $$
begin
  if new.group_id is distinct from old.group_id or new.code is distinct from old.code then
    raise exception 'O ID EMPRESA e o código da empresa não podem ser alterados.';
  end if;

  return new;
end;
$$;

drop trigger if exists lock_company_group_code on public.companies;
create trigger lock_company_group_code
  before update on public.companies
  for each row execute function public.lock_company_group_code();

---------------------------------------------------------------------------
-- 4) EMPRESA ABERTA: só vale se for do ID com que a pessoa entrou
---------------------------------------------------------------------------
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
    join public.companies c
      on c.id = p.active_company_id
     and c.group_id = p.active_group_id
   where p.user_id = auth.uid()
$$;

-- Entrar com o ID EMPRESA (chamado logo depois do login)
-- Devolve 'ok', ou 'sem_empresa' se a conta ainda não participa de nenhuma empresa.
create or replace function public.enter_group(p_group_id integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login primeiro.';
  end if;

  if not exists (select 1 from public.company_members where user_id = auth.uid()) then
    update public.profiles
       set active_group_id = null, active_company_id = null, updated_at = now()
     where user_id = auth.uid();
    return 'sem_empresa';
  end if;

  if p_group_id is null or not public.is_group_member(p_group_id) then
    raise exception 'ID EMPRESA incorreto ou sem acesso para este usuário.';
  end if;

  insert into public.profiles (user_id, active_group_id)
  values (auth.uid(), p_group_id)
  on conflict (user_id) do update
    set active_group_id = excluded.active_group_id,
        -- A empresa aberta só continua se for deste ID
        active_company_id = case
          when exists (
            select 1 from public.companies c
             where c.id = public.profiles.active_company_id and c.group_id = excluded.active_group_id
          ) then public.profiles.active_company_id
          else null
        end,
        updated_at = now();

  return 'ok';
end;
$$;

-- ID com que a pessoa entrou
create or replace function public.current_group_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select active_group_id from public.profiles where user_id = auth.uid()
$$;

-- Trocar a empresa aberta (só entre as empresas do ID com que entrou)
create or replace function public.set_active_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company_group integer;
  my_group integer := public.current_group_id();
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'Você não participa desta empresa.';
  end if;

  select group_id into company_group from public.companies where id = p_company_id;

  if my_group is not null and company_group <> my_group then
    raise exception 'Esta empresa é de outro ID EMPRESA. Saia e entre com o ID dela.';
  end if;

  update public.profiles
     set active_company_id = p_company_id,
         active_group_id = company_group,
         updated_at = now()
   where user_id = auth.uid();
end;
$$;

---------------------------------------------------------------------------
-- 5) CRIAR EMPRESA: dentro do ID aberto (ou um ID novo para quem não tem empresa)
--    Os administradores do ID já entram como administradores da empresa nova.
---------------------------------------------------------------------------
create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company uuid;
  target_group integer := public.current_group_id();
  has_any boolean;
begin
  if auth.uid() is null then
    raise exception 'Faça login primeiro.';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Informe o nome da empresa.';
  end if;

  has_any := exists (select 1 from public.company_members where user_id = auth.uid());

  if has_any then
    if target_group is null then
      raise exception 'Entre com o ID EMPRESA antes de criar uma empresa.';
    end if;

    if not exists (
      select 1
        from public.company_members m
        join public.companies c on c.id = m.company_id
       where m.user_id = auth.uid() and m.is_admin and c.group_id = target_group
    ) then
      raise exception 'Só administradores podem criar empresas.';
    end if;
  else
    -- Primeira empresa da conta: nasce um ID novo
    insert into public.company_groups (name, created_by)
    values (btrim(p_name), auth.uid())
    returning id into target_group;
  end if;

  -- Trava o ID enquanto numera, para duas criações juntas não pegarem o mesmo número
  perform 1 from public.company_groups where id = target_group for update;

  insert into public.companies (name, created_by, group_id, code)
  values (
    btrim(p_name),
    auth.uid(),
    target_group,
    coalesce((select max(code) from public.companies where group_id = target_group), 0) + 1
  )
  returning id into new_company;

  -- Quem cria e todos os administradores do ID
  insert into public.company_members (company_id, user_id, is_admin, can_create, can_update, can_delete, can_settle)
  select new_company, admins.user_id, true, true, true, true, true
    from (
      select auth.uid() as user_id
      union
      select m.user_id
        from public.company_members m
        join public.companies c on c.id = m.company_id
       where c.group_id = target_group and m.is_admin
    ) admins
  on conflict do nothing;

  insert into public.profiles (user_id, active_company_id, active_group_id)
  values (auth.uid(), new_company, target_group)
  on conflict (user_id) do update
    set active_company_id = excluded.active_company_id,
        active_group_id = excluded.active_group_id;

  return new_company;
end;
$$;

-- Entrar numa empresa com o código de convite: abre o ID dela também
create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.company_invites%rowtype;
  invite_group integer;
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

  select group_id into invite_group from public.companies where id = invite.company_id;

  insert into public.profiles (user_id, active_company_id, active_group_id)
  values (auth.uid(), invite.company_id, invite_group)
  on conflict (user_id) do update
    set active_company_id = excluded.active_company_id,
        active_group_id = excluded.active_group_id;

  return invite.company_id;
end;
$$;

---------------------------------------------------------------------------
-- 6) PARA A FUNÇÃO admin-users (cadastro de usuário): achar conta pelo e-mail.
--    Só a chave secreta do Supabase pode usar.
---------------------------------------------------------------------------
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;

revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

---------------------------------------------------------------------------
-- 7) QUEM PODE CHAMAR AS FUNÇÕES
---------------------------------------------------------------------------
do $$
declare
  f text;
  fns text[] := array[
    'public.is_group_member(integer)',
    'public.current_company_id()',
    'public.current_group_id()',
    'public.enter_group(integer)',
    'public.set_active_company(uuid)',
    'public.create_company(text)',
    'public.accept_invite(text)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Avisa a API do Supabase das mudanças na hora
notify pgrst, 'reload schema';
