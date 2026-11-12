-- Agenda: horários com cliente, serviço/assunto, valor opcional e responsável.
--
-- * Status: agendado, confirmado, concluido, cancelado, faltou.
-- * Ao concluir com valor, a tela oferece criar a conta a receber (fica ligada aqui).
-- * Permissão própria "Agenda" (Ver, Cadastrar, Alterar, Excluir). Quem já está
--   na empresa recebe na Agenda as mesmas permissões que tem em Clientes.
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

---------------------------------------------------------------------------
-- 1) CAMPOS NOVOS E STATUS
---------------------------------------------------------------------------
alter table public.appointments
  add column if not exists title text not null default '',
  add column if not exists amount numeric(14,2),
  add column if not exists responsible_id uuid references auth.users (id) on delete set null,
  add column if not exists receivable_id uuid references public.receivables (id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists canceled_at timestamptz;

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('agendado', 'confirmado', 'concluido', 'cancelado', 'faltou'));

alter table public.appointments drop constraint if exists appointments_amount_check;
alter table public.appointments add constraint appointments_amount_check
  check (amount is null or amount >= 0);

create index if not exists appointments_company_date_idx
  on public.appointments (company_id, appointment_date);

create index if not exists appointments_responsible_date_idx
  on public.appointments (responsible_id, appointment_date);

---------------------------------------------------------------------------
-- 2) PERMISSÃO "AGENDA"
---------------------------------------------------------------------------
alter table public.company_member_permissions
  drop constraint if exists company_member_permissions_module_check;

alter table public.company_member_permissions
  add constraint company_member_permissions_module_check check (module in (
    'painel', 'relatorios', 'clientes', 'fornecedores', 'contas_pagar', 'contas_receber',
    'caixa', 'contas_bancarias', 'cartoes', 'contas_gerenciais', 'agenda'
  ));

-- Quem já está na empresa: Agenda igual a Clientes
insert into public.company_member_permissions (
  company_id, user_id, module, can_view, can_create, can_update, can_delete, can_settle
)
select p.company_id, p.user_id, 'agenda', p.can_view, p.can_create, p.can_update, p.can_delete, false
  from public.company_member_permissions p
 where p.module = 'clientes'
on conflict do nothing;

-- Convites ainda não usados: Agenda igual a Clientes
update public.company_invites
   set module_permissions = module_permissions
       || jsonb_build_object('agenda', coalesce(module_permissions -> 'clientes', '{}'::jsonb))
 where used_at is null
   and not (module_permissions ? 'agenda');

-- Lista de telas válidas também na função que grava as permissões
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
-- 3) REGRAS DA TABELA: ver = quem é da empresa; mexer = permissão da Agenda
---------------------------------------------------------------------------
drop policy if exists appointments_insert_company on public.appointments;
drop policy if exists appointments_update_company on public.appointments;
drop policy if exists appointments_delete_company on public.appointments;

create policy appointments_insert_company on public.appointments
  for insert to authenticated
  with check (company_id = (select public.current_company_id()) and public.has_module_permission('agenda', 'create'));

create policy appointments_update_company on public.appointments
  for update to authenticated
  using (company_id = (select public.current_company_id()) and public.has_module_permission('agenda', 'update'))
  with check (company_id = (select public.current_company_id()) and public.has_module_permission('agenda', 'update'));

create policy appointments_delete_company on public.appointments
  for delete to authenticated
  using (company_id = (select public.current_company_id()) and public.has_module_permission('agenda', 'delete'));

grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;

notify pgrst, 'reload schema';
