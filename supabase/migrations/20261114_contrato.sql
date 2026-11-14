-- Contas de contrato (Contas a Pagar e Contas a Receber)
-- Ao cadastrar, "Isso é um contrato?" + duração em meses cria uma conta por
-- mês com o valor mensal. Esta coluna marca essas contas para a lista mostrar
-- "Contrato 3/24" na coluna Parcela.

alter table public.payables
  add column if not exists contract boolean not null default false;

alter table public.receivables
  add column if not exists contract boolean not null default false;

notify pgrst, 'reload schema';
