-- Nome fantasia e inscrição estadual (opcionais) em clientes e fornecedores,
-- preenchidos pela busca do CNPJ na Receita.
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema. Os cadastros antigos continuam iguais.

alter table public.clients
  add column if not exists trade_name text,
  add column if not exists state_registration text;

alter table public.suppliers
  add column if not exists trade_name text,
  add column if not exists state_registration text;

-- Avisa a API do Supabase das colunas novas na hora
notify pgrst, 'reload schema';
