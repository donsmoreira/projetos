-- Agenda: o cliente deixa de ser obrigatório (ex.: reunião interna, compromisso).
-- Sem cliente, o agendamento precisa ter pelo menos o serviço/assunto (a tela confere).
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

alter table public.appointments
  alter column client_id drop not null;

notify pgrst, 'reload schema';
