# Histórico de versões — Razão Finance ARC

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), com numeração [SemVer](https://semver.org/lang/pt-BR/).
O esquema de versões e o que entra em cada uma estão em [docs/ESCOPO.md](docs/ESCOPO.md#7-versionamento).

## [Não lançado]

### Adicionado
- Versão do app no rodapé do menu lateral.
- `vercel.json` para as rotas internas funcionarem ao atualizar a página na Vercel.
- README do projeto.
- Consulta para levantar a estrutura do banco (`supabase/levantamento-schema.sql`).

### Corrigido
- Parcelas com vencimento entre os dias 29 e 31 pulavam um mês (ex.: 31/01 + 1 mês virava 03/03). Agora usam o último dia do mês.

### Interno
- `getAuthenticatedUser` em um só arquivo (`src/services/auth.ts`), em vez de repetido em 6 services.

## [0.1.0] — 09/11/2026
Linha de base: registro do que já existia quando o projeto foi retomado (desenvolvido antes sem controle de versão).

### Funcionalidades existentes
- Login com e-mail e senha (Supabase Auth), rotas protegidas e logout.
- Dashboard: totais a pagar e a receber, saldo em contas, próximos vencimentos e saldo por conta.
- Cadastro de clientes (PF/PJ) e fornecedores, com busca.
- Cadastro de contas bancárias.
- Contas a pagar e a receber: cadastro, parcelamento, juros e multa, baixa pela conta bancária e estorno.
- Cadastro de cartões de crédito.
- Relatório de entradas e saídas por período.
