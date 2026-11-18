-- Agenda: agendamento de DIA INTEIRO (sem horário)
--
-- * O horário fica guardado como 00:00 até 23:59 (as regras de horário da
--   tabela continuam valendo), e all_day = true diz que é o dia todo.
-- * Dia inteiro não conta como horário ocupado (não gera aviso de conflito),
--   igual ao Google Agenda.
-- * Vai e vem do Google Agenda como evento de dia inteiro.
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

alter table public.appointments
  add column if not exists all_day boolean not null default false;

-- Dia inteiro sempre de 00:00 a 23:59
create or replace function public.appointments_all_day_times()
returns trigger
language plpgsql
as $$
begin
  if new.all_day then
    new.start_time := '00:00';
    new.end_time := '23:59';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_all_day_times on public.appointments;
create trigger appointments_all_day_times
  before insert or update on public.appointments
  for each row execute function public.appointments_all_day_times();

notify pgrst, 'reload schema';
