-- Endereço (opcional) em clientes e fornecedores.
-- Todos os campos podem ficar vazios; os cadastros antigos continuam funcionando.
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

alter table public.clients
  add column if not exists zip_code text,
  add column if not exists street text,
  add column if not exists address_number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text;

alter table public.suppliers
  add column if not exists zip_code text,
  add column if not exists street text,
  add column if not exists address_number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text;

-- CEP com 8 números; UF com 2 letras maiúsculas
alter table public.clients drop constraint if exists clients_zip_code_check;
alter table public.clients add constraint clients_zip_code_check
  check (zip_code is null or zip_code ~ '^[0-9]{8}$');

alter table public.clients drop constraint if exists clients_state_check;
alter table public.clients add constraint clients_state_check
  check (state is null or state ~ '^[A-Z]{2}$');

alter table public.suppliers drop constraint if exists suppliers_zip_code_check;
alter table public.suppliers add constraint suppliers_zip_code_check
  check (zip_code is null or zip_code ~ '^[0-9]{8}$');

alter table public.suppliers drop constraint if exists suppliers_state_check;
alter table public.suppliers add constraint suppliers_state_check
  check (state is null or state ~ '^[A-Z]{2}$');

-- Busca por estado e cidade
create index if not exists clients_state_city_idx on public.clients (user_id, state, city);
create index if not exists suppliers_state_city_idx on public.suppliers (user_id, state, city);
