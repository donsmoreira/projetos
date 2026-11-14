-- Exclusão: o sistema confere ANTES de perguntar "Tem certeza?"
-- Rode DEPOIS de 20261113_inativar_e_bloquear_exclusao.sql.
-- delete_block_reason(tabela, id) devolve o motivo que impede a exclusão
-- (ou null se pode excluir). O gatilho de exclusão usa a mesma função,
-- então a tela e o banco dão sempre a mesma resposta.

create or replace function public.delete_block_reason_for_company(p_table text, p_id uuid, p_company uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  company uuid := p_company;
  v_name text;
  v_open integer;
  v_any integer;
  v_open_value numeric(14,2);
begin
  if company is null then
    return null;
  end if;

  if p_table = 'clients' then
    select name into v_name from public.clients where id = p_id and company_id = company;
    if not found then return null; end if;

    select count(*) filter (where status <> 'recebido'),
           count(*),
           coalesce(sum(original_value + coalesce(interest, 0) + coalesce(penalty, 0)) filter (where status <> 'recebido'), 0)
      into v_open, v_any, v_open_value
      from public.receivables where client_id = p_id;

    if v_open > 0 then
      return format(
        'O cliente "%s" tem %s conta%s a receber em aberto (R$ %s) e não pode ser excluído. Receba ou exclua essas contas, ou use "Inativar".',
        v_name, v_open, case when v_open = 1 then '' else 's' end,
        translate(to_char(v_open_value, 'FM999,999,990.00'), ',.', '.,'));
    end if;

    if v_any > 0 then
      return format('O cliente "%s" tem contas já recebidas (movimentação) e não pode ser excluído. Use "Inativar" para tirá-lo das listas.', v_name);
    end if;

    if exists (select 1 from public.appointments where client_id = p_id) then
      return format('O cliente "%s" tem agendamentos na Agenda e não pode ser excluído. Use "Inativar" para tirá-lo das listas.', v_name);
    end if;

  elsif p_table = 'suppliers' then
    select name into v_name from public.suppliers where id = p_id and company_id = company;
    if not found then return null; end if;

    select count(*) filter (where status <> 'pago'),
           count(*),
           coalesce(sum(original_value + coalesce(interest, 0) + coalesce(penalty, 0)) filter (where status <> 'pago'), 0)
      into v_open, v_any, v_open_value
      from public.payables where supplier_id = p_id;

    if v_open > 0 then
      return format(
        'O fornecedor "%s" tem %s conta%s a pagar em aberto (R$ %s) e não pode ser excluído. Pague ou exclua essas contas, ou use "Inativar".',
        v_name, v_open, case when v_open = 1 then '' else 's' end,
        translate(to_char(v_open_value, 'FM999,999,990.00'), ',.', '.,'));
    end if;

    if v_any > 0 then
      return format('O fornecedor "%s" tem contas já pagas (movimentação) e não pode ser excluído. Use "Inativar" para tirá-lo das listas.', v_name);
    end if;

  elsif p_table = 'bank_accounts' then
    select name into v_name from public.bank_accounts where id = p_id and company_id = company;
    if not found then return null; end if;

    if exists (select 1 from public.payables where bank_account_id = p_id and status <> 'pago')
       or exists (select 1 from public.receivables where bank_account_id = p_id and status <> 'recebido') then
      return format('"%s" está escolhida em contas a pagar ou a receber em aberto e não pode ser excluída.', v_name);
    end if;

    if exists (select 1 from public.bank_transactions where bank_account_id = p_id)
       or exists (select 1 from public.payables where bank_account_id = p_id)
       or exists (select 1 from public.receivables where bank_account_id = p_id)
       or exists (select 1 from public.cash_sessions where cash_account_id = p_id) then
      return format('"%s" tem movimentação (entradas, saídas ou pagamentos) e não pode ser excluída.', v_name);
    end if;

    if exists (select 1 from public.credit_cards where bank_account_id = p_id) then
      return format('"%s" está ligada a um cartão de crédito e não pode ser excluída. Troque a conta do cartão antes.', v_name);
    end if;

  elsif p_table = 'credit_cards' then
    select name into v_name from public.credit_cards where id = p_id and company_id = company;
    if not found then return null; end if;

    if exists (select 1 from public.card_transactions where card_id = p_id and not settled) then
      return format('O cartão "%s" tem compras em faturas em aberto e não pode ser excluído. Use "Desativar".', v_name);
    end if;

    if exists (select 1 from public.card_transactions where card_id = p_id) then
      return format('O cartão "%s" tem compras lançadas (movimentação) e não pode ser excluído. Use "Desativar".', v_name);
    end if;
  end if;

  return null;
end;
$$;

-- Só o banco usa esta (a tela usa a de baixo, presa à empresa aberta)
revoke all on function public.delete_block_reason_for_company(text, uuid, uuid) from public, anon, authenticated;

-- Para a tela: confere na empresa aberta
create or replace function public.delete_block_reason(p_table text, p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.delete_block_reason_for_company(p_table, p_id, public.current_company_id());
$$;

revoke all on function public.delete_block_reason(text, uuid) from public, anon;
grant execute on function public.delete_block_reason(text, uuid) to authenticated;

-- Gatilho de exclusão passa a usar a mesma função
create or replace function public.block_delete_with_movements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  -- Empresa sendo apagada: deixa a cascata seguir
  if not exists (select 1 from public.companies where id = old.company_id) then
    return old;
  end if;

  -- A função confere pela empresa aberta; aqui conferimos pela empresa do registro
  v_reason := public.delete_block_reason_for_company(tg_table_name, old.id, old.company_id);

  if v_reason is not null then
    raise exception '%', v_reason;
  end if;

  return old;
end;
$$;
