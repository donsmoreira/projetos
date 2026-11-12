-- Agenda: atendimento CONCLUÍDO não pode ser movido nem alterado.
-- Ou fica como está, ou é excluído.
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

create or replace function public.appointments_lock_completed()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'concluido' then
    raise exception 'Atendimento concluído não pode ser movido nem alterado. Se precisar, exclua o agendamento.';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_lock_completed on public.appointments;
create trigger appointments_lock_completed
  before update on public.appointments
  for each row execute function public.appointments_lock_completed();
