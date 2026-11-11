-- Enquadramento (regime tributário) em clientes e fornecedores, Tipo (PF/PJ)
-- em fornecedores, e regra da
-- empresa ajustada: o enquadramento pode ser informado também com CPF de PJ.
--
-- Valores: simples (Simples Nacional), simples_mei (Simples Nacional - MEI),
-- normal (Regime Normal), nao_contribuinte (Não contribuinte).
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema. Os cadastros antigos continuam iguais.

alter table public.clients
  add column if not exists tax_regime text;

-- Fornecedor ganha também o Tipo (Pessoa Física / Pessoa Jurídica), como o cliente
alter table public.suppliers
  add column if not exists tax_regime text,
  add column if not exists type text;

alter table public.suppliers drop constraint if exists suppliers_type_check;
alter table public.suppliers add constraint suppliers_type_check
  check (type is null or type in ('Pessoa Física', 'Pessoa Jurídica'));

alter table public.clients drop constraint if exists clients_tax_regime_check;
alter table public.clients add constraint clients_tax_regime_check
  check (tax_regime is null or tax_regime in ('simples', 'simples_mei', 'normal', 'nao_contribuinte'));

alter table public.suppliers drop constraint if exists suppliers_tax_regime_check;
alter table public.suppliers add constraint suppliers_tax_regime_check
  check (tax_regime is null or tax_regime in ('simples', 'simples_mei', 'normal', 'nao_contribuinte'));

-- Empresa: antes só aceitava enquadramento com CNPJ
alter table public.companies drop constraint if exists companies_tax_regime_check;
alter table public.companies add constraint companies_tax_regime_check
  check (tax_regime is null or tax_regime in ('simples', 'simples_mei', 'normal', 'nao_contribuinte'));

-- Avisa a API do Supabase das colunas novas na hora
notify pgrst, 'reload schema';
