-- =========================================================================
-- Cadastro de serviço: campos que faltavam para a NFS-e nacional
--   * unidade de medida (padrão UN)
--   * PIS/COFINS: CST + se PIS, COFINS e CSLL são retidos (tpRetPisCofins)
--   * tributos aproximados (Lei 12.741): federal, estadual e municipal
--   * Simples Nacional: prestador optante + alíquota do Simples
--   * Reforma tributária (IBS/CBS): indicador de operação, CST e
--     classificação tributária (cClassTrib)
-- Os mesmos campos vão para a nota (service_invoices), que guarda a cópia.
--
-- Mudança de cálculo: PIS, COFINS e CSLL só descontam do valor líquido
-- quando marcados como RETIDOS. IRRF e contribuição previdenciária (INSS)
-- continuam sempre como retenção. Os cadastros e notas que já existem são
-- marcados como "retido" quando têm alíquota, então nada muda de valor.
-- =========================================================================

-- ---------- Serviços ----------
alter table public.services
  add column if not exists unit text not null default 'UN',
  add column if not exists pis_cofins_cst text,
  add column if not exists pis_withheld boolean not null default false,
  add column if not exists cofins_withheld boolean not null default false,
  add column if not exists csll_withheld boolean not null default false,
  add column if not exists approx_tax_federal numeric(5, 2) not null default 0,
  add column if not exists approx_tax_state numeric(5, 2) not null default 0,
  add column if not exists approx_tax_municipal numeric(5, 2) not null default 0,
  add column if not exists simples_optant boolean not null default false,
  add column if not exists simples_rate numeric(5, 2) not null default 0,
  add column if not exists ibs_cbs_ind_op text,
  add column if not exists ibs_cbs_cst text,
  add column if not exists ibs_cbs_class_trib text;

alter table public.services drop constraint if exists services_unit_check;
alter table public.services add constraint services_unit_check
  check (unit ~ '^[A-Z0-9]{1,6}$');

alter table public.services drop constraint if exists services_tax_codes_check;
alter table public.services add constraint services_tax_codes_check check (
  (pis_cofins_cst is null or pis_cofins_cst ~ '^[0-9]{2}$')
  and (ibs_cbs_ind_op is null or ibs_cbs_ind_op ~ '^[0-9]{6}$')
  and (ibs_cbs_cst is null or ibs_cbs_cst ~ '^[0-9]{3}$')
  and (ibs_cbs_class_trib is null or ibs_cbs_class_trib ~ '^[0-9]{6}$')
  -- a classificação tributária sempre começa com o CST
  and (ibs_cbs_class_trib is null or ibs_cbs_cst is null or left(ibs_cbs_class_trib, 3) = ibs_cbs_cst)
);

alter table public.services drop constraint if exists services_tax_rates_check;
alter table public.services add constraint services_tax_rates_check check (
  approx_tax_federal between 0 and 100
  and approx_tax_state between 0 and 100
  and approx_tax_municipal between 0 and 100
  and simples_rate between 0 and 100
);

-- Antes, toda alíquota de PIS/COFINS/CSLL era tratada como retenção
update public.services
set pis_withheld = pis_rate > 0,
    cofins_withheld = cofins_rate > 0,
    csll_withheld = csll_rate > 0;

-- ---------- Notas de serviço (cópia dos campos) ----------
alter table public.service_invoices
  add column if not exists unit text not null default 'UN',
  add column if not exists pis_cofins_cst text,
  add column if not exists pis_withheld boolean not null default false,
  add column if not exists cofins_withheld boolean not null default false,
  add column if not exists csll_withheld boolean not null default false,
  add column if not exists approx_tax_federal numeric(5, 2) not null default 0,
  add column if not exists approx_tax_state numeric(5, 2) not null default 0,
  add column if not exists approx_tax_municipal numeric(5, 2) not null default 0,
  add column if not exists simples_optant boolean not null default false,
  add column if not exists simples_rate numeric(5, 2) not null default 0,
  add column if not exists ibs_cbs_ind_op text,
  add column if not exists ibs_cbs_cst text,
  add column if not exists ibs_cbs_class_trib text;

alter table public.service_invoices drop constraint if exists service_invoices_unit_check;
alter table public.service_invoices add constraint service_invoices_unit_check
  check (unit ~ '^[A-Z0-9]{1,6}$');

alter table public.service_invoices drop constraint if exists service_invoices_tax_codes_check;
alter table public.service_invoices add constraint service_invoices_tax_codes_check check (
  (pis_cofins_cst is null or pis_cofins_cst ~ '^[0-9]{2}$')
  and (ibs_cbs_ind_op is null or ibs_cbs_ind_op ~ '^[0-9]{6}$')
  and (ibs_cbs_cst is null or ibs_cbs_cst ~ '^[0-9]{3}$')
  and (ibs_cbs_class_trib is null or ibs_cbs_class_trib ~ '^[0-9]{6}$')
  and (ibs_cbs_class_trib is null or ibs_cbs_cst is null or left(ibs_cbs_class_trib, 3) = ibs_cbs_cst)
);

alter table public.service_invoices drop constraint if exists service_invoices_tax_rates_check;
alter table public.service_invoices add constraint service_invoices_tax_rates_check check (
  approx_tax_federal between 0 and 100
  and approx_tax_state between 0 and 100
  and approx_tax_municipal between 0 and 100
  and simples_rate between 0 and 100
);

-- ---------- Cálculo da nota: PIS/COFINS/CSLL só descontam se retidos ----------
create or replace function public.service_invoice_compute()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base numeric;
begin
  if tg_op = 'UPDATE' and old.status <> 'rascunho'
     and coalesce(current_setting('razao.nfse_system', true), '') <> 'on' then
    raise exception 'Só nota em rascunho pode ser alterada.';
  end if;

  v_base := round(new.amount - new.unconditional_discount - new.deductions, 2);

  if v_base <= 0 then
    raise exception 'O valor do serviço precisa ser maior que o desconto e as deduções.';
  end if;

  new.tax_base := v_base;
  new.iss_amount := case when new.iss_taxation = 'tributavel' then round(v_base * new.iss_rate / 100, 2) else 0 end;
  new.pis_amount := round(v_base * new.pis_rate / 100, 2);
  new.cofins_amount := round(v_base * new.cofins_rate / 100, 2);
  new.csll_amount := round(v_base * new.csll_rate / 100, 2);
  new.irrf_amount := round(v_base * new.irrf_rate / 100, 2);
  new.inss_amount := round(v_base * new.inss_rate / 100, 2);

  -- Líquido = valor − desconto incondicional − retenções
  -- (ISS, PIS, COFINS e CSLL só quando retidos; IRRF e INSS sempre)
  new.net_amount := round(
    new.amount - new.unconditional_discount
    - case when new.iss_withheld then new.iss_amount else 0 end
    - case when new.pis_withheld then new.pis_amount else 0 end
    - case when new.cofins_withheld then new.cofins_amount else 0 end
    - case when new.csll_withheld then new.csll_amount else 0 end
    - new.irrf_amount - new.inss_amount,
    2
  );

  if new.net_amount < 0 then
    raise exception 'As retenções são maiores que o valor da nota.';
  end if;

  if not exists (select 1 from public.clients where id = new.client_id and company_id = new.company_id) then
    raise exception 'Escolha um cliente (tomador) desta empresa.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Notas que já existem: marca como retido o que tem alíquota (o líquido não muda).
-- A trava "só rascunho" é liberada só durante este ajuste.
select set_config('razao.nfse_system', 'on', false);

update public.service_invoices
set pis_withheld = pis_rate > 0,
    cofins_withheld = cofins_rate > 0,
    csll_withheld = csll_rate > 0;

select set_config('razao.nfse_system', '', false);
