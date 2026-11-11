-- Administrador muda o nome de um usuário da empresa aberta
-- (Configurações > Usuários e permissões > Editar).
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

create or replace function public.update_member_name(p_user_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  new_name text := btrim(coalesce(p_full_name, ''));
begin
  if not public.has_company_permission('admin') then
    raise exception 'Só administradores podem editar usuários.';
  end if;

  if not exists (select 1 from public.company_members where company_id = company and user_id = p_user_id) then
    raise exception 'Usuário não encontrado nesta empresa.';
  end if;

  if new_name = '' then
    raise exception 'Informe o nome.';
  end if;

  if length(new_name) > 120 then
    raise exception 'O nome pode ter no máximo 120 caracteres.';
  end if;

  insert into public.profiles (user_id, full_name)
  values (p_user_id, new_name)
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        updated_at = now();

  -- Também no cadastro de login (é o nome que aparece no topo para a pessoa).
  -- Se o banco não permitir, o perfil já ficou certo.
  begin
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', new_name)
     where id = p_user_id;
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.update_member_name(uuid, text) from public, anon;
grant execute on function public.update_member_name(uuid, text) to authenticated;

notify pgrst, 'reload schema';
