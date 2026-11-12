-- Agenda: cor própria de cada agendamento (azul por padrão).
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

alter table public.appointments
  add column if not exists color text not null default '#1a5cff';

alter table public.appointments drop constraint if exists appointments_color_check;
alter table public.appointments add constraint appointments_color_check
  check (color ~ '^#[0-9a-fA-F]{6}$');

notify pgrst, 'reload schema';
