-- Ajuste da tabela de cartões para a tela de Cartões + limpeza de políticas duplicadas.
-- Como usar: Supabase → SQL Editor → New query → cole tudo → Run.
-- Seguro para rodar mais de uma vez. Não apaga dados: só acrescenta colunas e remove regras repetidas.

begin;

-- 1. Campos que a tela de Cartões usa e ainda não existiam no banco.
--    O limite total continua sendo a coluna credit_limit. O limite disponível
--    não é guardado: o app calcula a partir das compras em card_transactions.
alter table public.credit_cards
  add column if not exists bank text,
  add column if not exists final_digits text,
  add column if not exists holder_name text,
  add column if not exists color text,
  add column if not exists notes text,
  add column if not exists active boolean not null default true;

-- Só os 4 últimos dígitos, nunca o número completo do cartão.
alter table public.credit_cards
  drop constraint if exists credit_cards_final_digits_check;

alter table public.credit_cards
  add constraint credit_cards_final_digits_check
  check (final_digits is null or final_digits ~ '^[0-9]{4}$');

alter table public.credit_cards
  drop constraint if exists credit_cards_limit_nonnegative;

alter table public.credit_cards
  add constraint credit_cards_limit_nonnegative
  check (credit_limit >= 0);

-- 2. Políticas antigas para o papel "public", repetidas pelas versões "_own"
--    (papel authenticated), que continuam valendo.
drop policy if exists credit_cards_select on public.credit_cards;
drop policy if exists credit_cards_insert on public.credit_cards;
drop policy if exists credit_cards_update on public.credit_cards;
drop policy if exists credit_cards_delete on public.credit_cards;

drop policy if exists receivables_select on public.receivables;
drop policy if exists receivables_insert on public.receivables;
drop policy if exists receivables_update on public.receivables;
drop policy if exists receivables_delete on public.receivables;

commit;
