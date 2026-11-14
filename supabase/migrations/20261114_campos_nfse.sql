-- Campos para a futura emissão de NFS-e (nota fiscal de serviço)
-- (o cadastro de serviços e o certificado digital vêm depois)
--
-- Endereço (empresas, clientes, fornecedores e perfil): código IBGE do
--   município, preenchido sozinho pelo CEP.
-- Empresa: CNAE principal, regime especial de tributação municipal,
--   série e próximo número da nota e ambiente de emissão
--   (homologação = testes sem valor fiscal / produção).
-- Cliente: inscrição municipal (tomador PJ).

---------------------------------------------------------------------------
-- 1) Código IBGE do município (7 números)
---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'clients', 'suppliers', 'profiles'] loop
    execute format('alter table public.%I add column if not exists city_code text', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_city_code_check');
    execute format(
      'alter table public.%I add constraint %I check (city_code is null or city_code ~ ''^[0-9]{7}$'')',
      t, t || '_city_code_check'
    );
  end loop;
end $$;

---------------------------------------------------------------------------
-- 2) Empresa: dados da NFS-e
---------------------------------------------------------------------------
alter table public.companies
  add column if not exists cnae text,
  add column if not exists cnae_description text,
  add column if not exists special_tax_regime text not null default 'nenhum',
  add column if not exists nfse_series text not null default '1',
  add column if not exists nfse_next_number integer not null default 1,
  add column if not exists nfse_environment text not null default 'homologacao';

alter table public.companies drop constraint if exists companies_cnae_check;
alter table public.companies add constraint companies_cnae_check
  check (cnae is null or cnae ~ '^[0-9]{7}$');

alter table public.companies drop constraint if exists companies_special_tax_regime_check;
alter table public.companies add constraint companies_special_tax_regime_check
  check (special_tax_regime in (
    'nenhum', 'cooperativa', 'estimativa', 'microempresa_municipal',
    'notario_registrador', 'profissional_autonomo', 'sociedade_profissionais'
  ));

alter table public.companies drop constraint if exists companies_nfse_series_check;
alter table public.companies add constraint companies_nfse_series_check
  check (nfse_series ~ '^[0-9A-Za-z]{1,5}$');

alter table public.companies drop constraint if exists companies_nfse_next_number_check;
alter table public.companies add constraint companies_nfse_next_number_check
  check (nfse_next_number >= 1);

alter table public.companies drop constraint if exists companies_nfse_environment_check;
alter table public.companies add constraint companies_nfse_environment_check
  check (nfse_environment in ('homologacao', 'producao'));

---------------------------------------------------------------------------
-- 3) Cliente: inscrição municipal
---------------------------------------------------------------------------
alter table public.clients
  add column if not exists municipal_registration text;

notify pgrst, 'reload schema';
