-- =========================================================================
-- Nota de serviço: FORMA DE PAGAMENTO e ligação com o Contas a Receber
--
--   À vista:  dinheiro (caixa), Pix / depósito (banco) ou cartão de débito (banco)
--             -> 1 conta a receber já RECEBIDA na conta/caixa escolhido.
--   A prazo:  crediário (parcelas mensais no Contas a Receber)
--             ou cartão de crédito em X vezes (parcelas mensais que a
--             maquininha repassa para o banco escolhido)
--             -> X contas a receber PENDENTES.
--
-- O valor lançado é o VALOR LÍQUIDO da nota (o que o cliente paga, já sem
-- as retenções). Parcelas: os centavos que sobram ficam na 1ª, igual à
-- renegociação.
--
-- Juros do parcelamento no cartão (taxa da maquininha): os campos já ficam
-- prontos (quem paga os juros e a taxa), mas o cálculo será ligado depois.
-- Por enquanto só "sem juros" é aceito no lançamento.
--
-- O lançamento no financeiro acontece quando a nota for AUTORIZADA
-- (função service_invoice_post_receivables, chamada pela emissão).
-- =========================================================================

alter table public.service_invoices
  add column if not exists payment_term text not null default 'a_vista',
  add column if not exists payment_method text not null default 'pix',
  add column if not exists payment_account_id uuid references public.bank_accounts (id) on delete set null,
  add column if not exists installments integer not null default 1,
  add column if not exists first_due_date date,
  -- preparado para o futuro: juros do parcelamento no cartão
  add column if not exists card_interest_mode text not null default 'sem_juros',
  add column if not exists card_interest_rate numeric(6, 3) not null default 0,
  add column if not exists card_interest_amount numeric(14, 2) not null default 0;

alter table public.service_invoices drop constraint if exists service_invoices_payment_check;
alter table public.service_invoices add constraint service_invoices_payment_check check (
  payment_term in ('a_vista', 'a_prazo')
  and (
    (payment_term = 'a_vista' and payment_method in ('dinheiro', 'pix', 'debito') and installments = 1)
    or (payment_term = 'a_prazo' and payment_method = 'crediario' and installments between 1 and 60)
    or (payment_term = 'a_prazo' and payment_method = 'credito' and installments between 1 and 24)
  )
  and card_interest_mode in ('sem_juros', 'cliente', 'empresa')
  and card_interest_rate between 0 and 100
  and card_interest_amount >= 0
  -- juros só existem no cartão de crédito
  and (payment_method = 'credito' or (card_interest_mode = 'sem_juros' and card_interest_rate = 0))
);

-- Conta a receber criada por uma nota de serviço
alter table public.receivables
  add column if not exists service_invoice_id uuid references public.service_invoices (id) on delete set null;

create index if not exists receivables_service_invoice_idx
  on public.receivables (service_invoice_id)
  where service_invoice_id is not null;

-- ---------- Conferência da conta escolhida (na gravação da nota) ----------
create or replace function public.service_invoice_check_payment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_type text;
begin
  if new.payment_account_id is not null then
    select account_type into v_type
      from public.bank_accounts
     where id = new.payment_account_id and company_id = new.company_id;

    if not found then
      raise exception 'A conta de recebimento não é desta empresa.';
    end if;

    if new.payment_method = 'dinheiro' and v_type <> 'caixa' then
      raise exception 'Pagamento em dinheiro entra num caixa: escolha um caixa.';
    end if;

    if new.payment_method <> 'dinheiro' and v_type = 'caixa' then
      raise exception 'Pix, cartão e crediário entram numa conta bancária: escolha um banco.';
    end if;
  end if;

  -- à vista não tem vencimento próprio (recebe na data da emissão)
  if new.payment_term = 'a_vista' then
    new.first_due_date := null;
  end if;

  return new;
end;
$$;

drop trigger if exists service_invoices_check_payment on public.service_invoices;
create trigger service_invoices_check_payment
  before insert or update on public.service_invoices
  for each row execute function public.service_invoice_check_payment();

-- ---------- Plano de lançamento (só leitura, usado para conferir) ----------
create or replace function public.service_invoice_payment_plan(p_invoice_id uuid)
returns table (installment integer, due_date date, value numeric, received boolean)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  inv public.service_invoices%rowtype;
  v_total numeric;
  v_count integer;
  v_each numeric;
  v_first numeric;
  v_first_due date;
  i integer;
begin
  select * into inv from public.service_invoices where id = p_invoice_id;

  if not found then
    raise exception 'Nota não encontrada.';
  end if;

  v_total := round(inv.net_amount, 2);

  if inv.payment_term = 'a_vista' then
    installment := 1; due_date := inv.issue_date; value := v_total; received := true;
    return next;
    return;
  end if;

  v_count := greatest(inv.installments, 1);
  v_each := trunc(v_total / v_count, 2);
  v_first := v_total - v_each * (v_count - 1);
  v_first_due := coalesce(inv.first_due_date, (inv.issue_date + interval '1 month')::date);

  for i in 1..v_count loop
    installment := i;
    due_date := (v_first_due + make_interval(months => i - 1))::date;
    value := case when i = 1 then v_first else v_each end;
    received := false;
    return next;
  end loop;
end;
$$;

grant execute on function public.service_invoice_payment_plan(uuid) to authenticated;

-- ---------- Lançar a nota no Contas a Receber (chamada na autorização) ----------
create or replace function public.service_invoice_post_receivables(p_invoice_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  company uuid := public.current_company_id();
  inv public.service_invoices%rowtype;
  acc public.bank_accounts%rowtype;
  svc public.services%rowtype;
  p record;
  v_group uuid := gen_random_uuid();
  v_label text;
  v_method text;
  v_description text;
  v_id uuid;
  v_count integer := 0;
begin
  if company is null then
    raise exception 'Abra uma empresa primeiro.';
  end if;

  if not public.has_module_permission('notas_servico', 'settle') then
    raise exception 'Você não tem permissão para emitir notas nesta empresa.';
  end if;

  select * into inv
    from public.service_invoices
   where id = p_invoice_id and company_id = company
   for update;

  if not found then
    raise exception 'Nota não encontrada.';
  end if;

  if inv.status <> 'autorizada' then
    raise exception 'Só nota autorizada vai para o Contas a Receber.';
  end if;

  if exists (select 1 from public.receivables where service_invoice_id = inv.id) then
    raise exception 'Esta nota já foi lançada no Contas a Receber.';
  end if;

  if inv.card_interest_mode <> 'sem_juros' then
    raise exception 'Juros do parcelamento no cartão ainda não estão disponíveis.';
  end if;

  select * into acc
    from public.bank_accounts
   where id = inv.payment_account_id and company_id = company;

  if not found then
    raise exception 'Escolha na nota a conta ou o caixa que recebe o pagamento.';
  end if;

  select * into svc from public.services where id = inv.service_id;

  v_method := case inv.payment_method
    when 'dinheiro' then 'Dinheiro'
    when 'pix' then 'Pix / depósito'
    when 'debito' then 'Cartão de débito'
    when 'crediario' then 'Crediário'
    when 'credito' then 'Cartão de crédito'
  end;

  v_label := 'NFS-e' || coalesce(' nº ' || inv.nfse_number, '') || ' - ' || left(inv.description, 120);

  for p in select * from public.service_invoice_payment_plan(inv.id) loop
    v_description := v_label || case when inv.installments > 1 then ' (' || p.installment || '/' || inv.installments || ')' else '' end;

    insert into public.receivables (
      user_id, company_id, client_id, description, category, management_account_id,
      original_value, interest, penalty, issue_date, due_date, notes, status,
      installment_group_id, installment_index, installment_count, service_invoice_id
    ) values (
      auth.uid(), company, inv.client_id, v_description, svc.category, svc.management_account_id,
      p.value, 0, 0, inv.issue_date, p.due_date,
      'Forma de pagamento: ' || v_method || case when inv.payment_term = 'a_prazo' then ' · recebe em: ' || acc.name else '' end,
      'pendente', v_group, p.installment, inv.installments, inv.id
    )
    returning id into v_id;

    if p.received then
      perform public.settle_receivable_row(v_id, acc, inv.issue_date, p.value, v_method, false, null);
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.service_invoice_post_receivables(uuid) from public, anon;
grant execute on function public.service_invoice_post_receivables(uuid) to authenticated;
