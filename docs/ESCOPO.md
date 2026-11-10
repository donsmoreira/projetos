# Razão Finance ARC — Escopo do Projeto

> Documento vivo. Atualize os checkboxes conforme as entregas forem concluídas.
> Última revisão: 10/11/2026 · **Versão atual: v0.1.0 (alpha)** · histórico em [CHANGELOG.md](../CHANGELOG.md)

---

## 1. Visão geral

**Razão Finance ARC** é o **gestor financeiro** do ecossistema **ARC** (*Análises Reais e Computacionais*), a marca guarda-chuva da **D&C** (Donovan & Christopher) para sistemas, principalmente da área financeira. É uma aplicação web pensada primeiro para uso em **desktop**, mas que também deve funcionar bem no **celular**, adaptando o layout ao tamanho da tela.

No futuro, ele será a **fonte de dados financeira** usada pelo **Assessor Financeiro ARC (WhatsApp)**. O usuário vai poder consultar e registrar informações financeiras por mensagem, e tudo o que for registrado deve aparecer no Razão, e vice-versa.

### Objetivos
1. Controlar contas a pagar e a receber, contas bancárias e cartões de crédito em um só lugar.
2. Dar visão clara do saldo atual e do que está por vir (fluxo de caixa).
3. Gerar relatórios para tomada de decisão.
4. Servir de base (dados e regras) para o Assessor Financeiro ARC no WhatsApp.

### Público
- Pessoa física e/ou pequena empresa (o cadastro de clientes já distingue PF e PJ). *A definir: ver seção 9.*

---

## 2. Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite 8 |
| Rotas | React Router 7 |
| Ícones | lucide-react |
| Estilo | CSS puro, um arquivo por componente; variáveis globais em `src/styles/global.css` |
| Identidade visual | Marca ARC (D&C): tema escuro, azul elétrico `#1a7cff` / ciano `#4fc3ff` com brilho, texto branco/prata. Fontes Inter (texto), Exo 2 (títulos) e Michroma (marca). Logo em `src/assets/arc-logo.png`, símbolo em `components/ArcMark`. Todas as cores vêm das variáveis do `global.css` (um tema claro pode ser criado só trocando essas variáveis) |
| Backend | Supabase (Auth + Postgres), acessado direto pelo frontend via `@supabase/supabase-js` |
| Config | `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` |

### Estrutura de pastas
```
src/
  components/      componentes genéricos (Button, Card)
  contexts/        AuthContext (sessão do Supabase)
  layouts/         MainLayout (Sidebar + Topbar + conteúdo)
  pages/<Módulo>/  página + components/ (SearchBar, Table, Form, Modal)
  routes/          AppRoutes e ProtectedRoute
  services/        acesso ao Supabase, um arquivo por módulo
  types/           tipos de domínio
  styles/          CSS global
```

---

## 3. O que já existe (estado atual)

Legenda: ✅ pronto · 🟡 parcial · ❌ não existe

### 3.1 Autenticação
| Item | Status | Observação |
|---|---|---|
| Login com e-mail e senha | ✅ | `pages/Login` |
| Rotas protegidas | ✅ | `routes/ProtectedRoute.tsx` |
| Logout | ✅ | botão na Topbar |
| Cadastro de usuário | 🟡 | `pages/Signup`: e-mail + senha, conta ativada por código enviado ao e-mail. Depende de configurar o modelo de e-mail no Supabase |
| Recuperação de senha | 🟡 | `pages/ForgotPassword`: código por e-mail + nova senha. Mesma dependência |
| Perfil do usuário | ❌ | a Topbar usa `full_name` ou o e-mail |

### 3.2 Dashboard (`/`)
| Item | Status | Observação |
|---|---|---|
| Total a pagar (pendentes) | ✅ | soma valor original + juros + multa |
| Total a receber (pendentes) | ✅ | |
| Saldo em contas | ✅ | saldo inicial + soma das `bank_transactions` |
| Limite utilizado em cartões | ✅ | soma das compras em aberto dos cartões ativos |
| Próximas 6 contas a pagar e a receber | ✅ | |
| Saldo por conta bancária | ✅ | |
| Contas vencidas em destaque | ❌ | |
| Gráficos | ❌ | |

### 3.3 Cadastros
| Módulo | Status | Campos |
|---|---|---|
| Clientes (`/clientes`) | ✅ CRUD + busca | nome, tipo (PF/PJ), documento, telefone, e-mail, observações |
| Fornecedores (`/fornecedores`) | ✅ CRUD + busca | nome, documento, telefone, e-mail, observações |
| Contas gerenciais (`/contas-gerenciais`) | ✅ CRUD + busca | árvore de contas pai/subcontas; nome, receita/despesa, fixa/variável; filtro por tipo, busca, expandir/recolher |

### 3.4 Contas bancárias (`/bancos`)
| Item | Status | Observação |
|---|---|---|
| CRUD de contas | ✅ | nome, banco, agência, número, saldo inicial, limite de cheque especial |
| Extrato da conta (lista de lançamentos) | 🟡 | o service tem `listBankTransactions`, mas **nenhuma tela usa** |
| Lançamento manual (entrada/saída avulsa) | 🟡 | o service tem `createBankTransaction` e `deleteBankTransaction`, mas **sem tela** |
| Transferência entre contas | 🟡 | função `transfer_between_accounts` no banco; usada na tela do Caixa (banco ↔ caixa). Falta transferência banco ↔ banco |
| Conciliação / importação de extrato (OFX/CSV) | ❌ | |

### 3.4b Caixa — dinheiro físico (`/caixa`)
| Item | Status | Observação |
|---|---|---|
| Cadastro de caixas | ✅ | é uma conta em `bank_accounts` com `account_type = 'caixa'` (sem banco, sem cheque especial) |
| Saldo atual e total em dinheiro | ✅ | saldo inicial + movimentações |
| Entrada e saída avulsas | ✅ | `transaction_type = 'manual'` |
| Transferência banco ↔ caixa (saque/depósito) | ✅ | duas movimentações gravadas juntas (`transaction_type = 'transfer'`); não conta como receita/despesa |
| Pagamento e recebimento em dinheiro | ✅ | nas telas de baixa, o caixa aparece junto das contas, com saldo antes/depois |
| Fluxo de caixa por período | ✅ | saldo anterior, entradas, saídas, saldo linha a linha |
| Saldo nunca negativo | ✅ | regra no banco (inclusive ao desfazer um recebimento) |
| Fechamento de caixa diário / conferência | ❌ | |

### 3.5 Contas a pagar (`/contas-pagar`)
| Item | Status | Observação |
|---|---|---|
| CRUD (apenas enquanto pendente) | ✅ | |
| Parcelamento | ✅ | gera N registros ligados por `installment_group_id` |
| Juros e multa | ✅ | informados manualmente |
| Baixa (pagamento) via conta bancária ou caixa | ✅ | gera `bank_transaction` negativa; `payment_method` = `banco` ou `caixa` |
| Estorno de pagamento | ✅ | apaga a transação e volta para pendente |
| Pagamento com cartão de crédito | 🟡 | colunas `card_id` e `card_transaction_id` existem, **sem uso** |
| Status "vencido" | ❌ | só existem `pendente` e `pago` |
| Pagamento parcial | ❌ | |
| Conta gerencial | ✅ | obrigatória; só contas de **despesa** (regra no banco). O caminho da conta fica guardado em `category` |
| Recorrência (contas fixas mensais) | ❌ | |
| Anexos (boleto, comprovante) | ❌ | |

### 3.6 Contas a receber (`/contas-receber`)
Espelha as contas a pagar: CRUD, parcelamento, juros e multa, baixa via conta bancária ou caixa (transação positiva) e estorno. ✅
Conta gerencial obrigatória, só contas de **receita** (regra no banco). ✅
Mesmas lacunas: status vencido, recebimento parcial, recorrência. ❌

### 3.7 Cartões de crédito (`/cartoes`)
| Item | Status | Observação |
|---|---|---|
| CRUD de cartões | ✅ | código corrigido para bater com o banco (D12) |
| Exclusão lógica | ✅ | `active = false` |
| Tabelas de compras e faturas no banco | ✅ | `card_transactions` (com parcelas) e `card_settlements` já existem, sem tela |
| Lançamento de compras no cartão | ❌ | |
| Compras parceladas no cartão | ❌ | |
| Faturas (abertura, fechamento, pagamento) | ❌ | |
| Cálculo automático do limite disponível | ✅ | limite total − (gastos em `card_transactions` − baixas em `card_settlements`); só exibido, não editável |
| Banco do cartão | ✅ | escolhido entre as contas bancárias cadastradas (`bank_account_id`) |
| Bandeiras | ✅ | lista fixa das bandeiras do Brasil (`src/constants/cardBrands.ts`) |
| Nome do cartão | ✅ | automático: banco + bandeira em maiúsculas (ex.: SICREDI VISA), sem o código do banco (`src/utils/bank.ts`) |
| Valores em reais | 🟡 | componente `CurrencyInput` (edita qualquer casa, formata 5.000,00) no limite do cartão; aplicar nos demais formulários |
| Banco nas contas bancárias | ✅ | lista fixa de bancos do Brasil (`src/constants/banks.ts`) + "Outro banco"; o código numérico é removido ao salvar |

### 3.8 Relatórios (`/relatorios`)
| Item | Status | Observação |
|---|---|---|
| Entradas x saídas por período | ✅ | baseado em `bank_transactions` |
| Filtro entrada/saída/todos | ✅ | |
| Resumo (receitas, despesas, saldo, quantidade) | ✅ | |
| Descritivo (tabela) | ✅ | agora com conta/caixa e conta gerencial |
| Torres (barras entradas x saídas) | ✅ | por dia até 62 dias; acima, por mês |
| Curvas (linhas + resultado acumulado) | ✅ | |
| Pizza | ✅ | saídas, entradas ou entradas x saídas; fatias por conta gerencial (principal/subconta), fornecedor/cliente, lançamento, conta/caixa ou origem; até 8 fatias + "Outros" |
| Torres agrupadas ("Ver por") | ✅ | mesmas formas de agrupar da pizza, além do período; até 12 grupos + "Outros" |
| Filtros do relatório | ✅ | conta/caixa, conta gerencial (com subcontas), fornecedor/cliente, origem; valem para tabela, resumo e gráficos |
| Atalhos de período | ✅ | hoje, este mês, mês passado, 30/90 dias, este ano, ano passado |
| Transferências fora dos totais | ✅ | banco ↔ caixa não conta como entrada/saída |
| Fluxo de caixa projetado (pendentes futuros) | ❌ | |
| Exportação (PDF / Excel) | ❌ | |

### 3.9 Layout e responsividade
| Item | Status | Observação |
|---|---|---|
| Layout desktop (Sidebar + Topbar) | ✅ | |
| Ajustes de grid nas páginas para telas menores | 🟡 | há `@media` nas páginas |
| Menu lateral recolhível | ✅ | botão no topo: no computador recolhe para só ícones (fica salvo); abaixo de 768px vira gaveta por cima da tela, que fecha ao escolher uma tela, no fundo escuro ou com Esc |
| Tabelas no mobile | 🟡 | precisam virar cards ou ter rolagem horizontal |
| Instalável (PWA) | ❌ | |

### 3.10 Verificação feita em 09/11/2026
Comparação entre o histórico do desenvolvimento anterior (ChatGPT) e o código atual:

| Ponto | Situação |
|---|---|
| Build de produção (`npm run build`) | ✅ passa sem erros (só um aviso de tamanho do pacote JS, 543 kB) |
| Cartões de crédito (havia tela branca/404) | ❌ o código compila, mas **não bate com o banco**: usa `bank`, `final_digits`, `holder_name`, `limit_total`, `available_limit`, `color`, `notes` e `active`, que não existem. O banco tem `credit_limit` e `bank_account_id` |
| Segurança (RLS) | ✅ as 11 tabelas têm RLS ativo, e cada usuário só acessa as próprias linhas (`auth.uid() = user_id`). Há políticas duplicadas em `credit_cards` e `receivables` (inofensivas) |
| Tabelas extras no banco | `profiles` (criada no cadastro do usuário), `card_transactions`, `card_settlements` e `appointments` (agenda com clientes) |
| Relatórios (não tinha confirmação final) | ✅ o código compila e usa `bank_transactions`. Falta testar na tela |
| Convenção de sinais | ✅ confirmada no código: pagamentos gravam valor negativo, recebimentos positivo |
| Tabelas no Supabase | ✅ as 7 tabelas existem (`clients`, `suppliers`, `bank_accounts`, `bank_transactions`, `payables`, `receivables`, `credit_cards`), e o acesso sem login é negado |
| Repositório no GitHub | ⚠️ existe, mas guarda a versão antiga em HTML/CSS/JS puro, anterior à migração para Vite. A pasta local não tem git |
| Deploy na Vercel | ❌ nunca foi criado |
| `vercel.json` (rotas do BrowserRouter) | ❌ não existe: no ar, atualizar uma página interna daria erro 404 |
| Nome da variável da chave do Supabase | ⚠️ o código usa `VITE_SUPABASE_PUBLISHABLE_KEY`, e o histórico orientava `VITE_SUPABASE_ANON_KEY`. A Vercel precisa usar o nome novo |
| `.env.local` fora do git | ✅ coberto pela regra `*.local` do `.gitignore` |

---

## 4. Modelo de dados (Supabase)

> Estrutura real exportada em 10/11/2026 para `supabase/schema-atual.json` (gerada por `supabase/levantamento-schema.sql`). São 11 tabelas, todas com RLS ativo. Valores em `numeric(14,2)`.

| Tabela | Campos principais | Relações |
|---|---|---|
| `clients` | name, type, document, phone, email, notes | user_id |
| `suppliers` | name, document, phone, email, notes | user_id |
| `bank_accounts` | name, bank, agency, account_number, initial_balance, overdraft_limit | user_id |
| `bank_transactions` | transaction_date, description, value (+ entrada / − saída), transaction_type (`manual`, `payable_payment`, ...), reference_type, reference_id | bank_account_id, payable_id |
| `payables` | description, category, original_value, interest, penalty, issue_date, due_date, status, payment_*, paid_value, installment_* | supplier_id, bank_account_id, bank_transaction_id, card_id, card_transaction_id |
| `receivables` | igual a payables, com received_value / receipt_date | client_id, bank_account_id, bank_transaction_id |
| `credit_cards` | name, brand, credit_limit, closing_day, due_day (1–31) | user_id, bank_account_id |
| `card_transactions` | transaction_date, description, value, settled, installment_* | card_id, payable_id, settlement_id |
| `card_settlements` (pagamento de fatura) | settlement_date, value | card_id, bank_account_id, bank_transaction_id |
| `profiles` | full_name, company_name, phone, preferred_theme, currency | user_id (criado automaticamente no cadastro) |
| `appointments` (agenda) | appointment_date, start_time, end_time, status (agendado/confirmado), confirmed_at | user_id, client_id |
| `management_accounts` (contas gerenciais) — usada em `payables` / `receivables.management_account_id` | name, type (`receita`/`despesa`), nature (`fixa`/`variavel`). Subconta tem o mesmo tipo da conta pai; nome único por nível; sem ciclos (regras no banco) | user_id, parent_id → management_accounts |

**Princípio central:** `bank_transactions` é o **razão** do sistema. Todo dinheiro que entra ou sai de uma conta vira uma linha nessa tabela, e saldos e relatórios saem dela.

---

## 5. Regras de negócio atuais
1. Toda tabela pertence a um usuário (`user_id`). O isolamento entre usuários **depende das políticas RLS do Supabase**.
2. Contas a pagar e a receber só podem ser editadas ou excluídas enquanto estiverem `pendente`.
3. Pagar ou receber gera uma `bank_transaction` (negativa ou positiva) e marca a conta como `pago` ou `recebido`.
4. O estorno apaga a `bank_transaction` e devolve a conta para `pendente`.
5. Parcelamento: N registros com vencimento mês a mês e descrição "(i/N)".
6. Lançamentos bancários gerados por pagamento só podem ser apagados pelo estorno. Só os `manual` podem ser excluídos direto.
7. Valor de uma conta = valor original + juros + multa.

---

## 6. Problemas conhecidos (dívida técnica)

| # | Problema | Onde | Prioridade |
|---|---|---|---|
| D1 | Pagamento e estorno não são atômicos (duas operações separadas; se falhar no meio, os dados ficam inconsistentes) | `payablesService.ts`, `receivablesService.ts` | Alta |
| D2 | Schema e RLS não versionados no repositório | — | Alta |
| D3 | Projeto sem git | raiz | Alta |
| D4 | Parcelas com vencimento no dia 29–31 "pulam" de mês (`setMonth`) | `createPayables` / `createReceivables` | Média |
| D5 | Dashboard calcula saldo baixando **todas** as transações para o navegador (não escala) | `dashboardService.ts` | Média |
| D6 | "Limite utilizado em cartões" fixo em 0 | `dashboardService.ts` | Média |
| D7 | `getAuthenticatedUser` duplicado em vários services; `SearchBar` duplicado em todos os módulos | `services/`, `pages/*/components` | Baixa |
| D8 | Excluir conta bancária com lançamentos: comportamento depende das FKs do banco | `bankAccountsService.ts` | Média |
| D9 | README ainda é o template do Vite | `README.md` | Baixa |
| D10 | Sem testes automatizados | — | Média |
| D12 | Tela de Cartões não batia com a tabela `credit_cards`. **Código corrigido**; falta rodar o SQL de migração | `creditCardsService.ts`, `supabase/migrations/` | Alta |
| D13 | Políticas RLS duplicadas em `credit_cards` e `receivables` (versões antigas para o papel `public`) | Supabase | Baixa |
| D11 | `npm run lint` acusa 16 erros: `setState` chamado direto dentro de `useEffect` (padrão que o React 19 desaconselha) e um export misto no AuthContext. Não quebra o app | páginas e formulários | Baixa |

---

## 7. Versionamento

Usamos **SemVer**: `MAIOR.MENOR.CORREÇÃO`, por exemplo `1.4.2`.

| Parte | Quando sobe | Exemplo |
|---|---|---|
| **MAIOR** | mudança que quebra compatibilidade (dados, API usada pelo Assessor) | 1.4.2 → 2.0.0 |
| **MENOR** | funcionalidade nova | 1.4.2 → 1.5.0 |
| **CORREÇÃO** | conserto de bug, sem funcionalidade nova | 1.4.2 → 1.4.3 |

**Estágios**
| Estágio | Numeração | Significado |
|---|---|---|
| Alpha | `0.x.y` | em construção, só você usa; qualquer coisa pode mudar |
| Beta | `1.0.0-beta.1`, `-beta.2`... | completo para uso real, testado por usuários convidados |
| Release candidate | `1.0.0-rc.1` | candidata final, só entram correções |
| Estável | `1.0.0` | publicado para todos |

**Regras do dia a dia**
1. Toda entrega concluída ganha uma linha no [CHANGELOG.md](../CHANGELOG.md).
2. A versão fica em `package.json` e será exibida no app (rodapé do menu).
3. Com o git criado (Fase 0), cada versão vira uma tag: `v0.2.0`, `v1.0.0-beta.1`...
4. A v0.1.0 é a **linha de base**: tudo que existia ao retomar o projeto. Versões anteriores não foram registradas.

**Mapa de versões**
| Versão | Entrega |
|---|---|
| v0.1.0 | Linha de base (estado atual) |
| v0.2.0 | Fase 0 — Fundação |
| v0.3.0 | Fase 1 — Celular |
| v0.4.0 → v0.7.0 | Fase 2 — Bancos (0.4), Contas (0.5), Categorias (0.6), Cartões (0.7) |
| v0.8.0 | Fase 3 — Painel e relatórios |
| v0.9.0 | Fase 4 — Conta do usuário |
| v1.0.0-beta → v1.0.0 | Fase 5 — Qualidade e publicação |
| v1.1.0 | Fase 6 — Integração com o Assessor WhatsApp |

---

## 8. Roadmap (o que está planejado)

### Fase 0 — Fundação · v0.2.0
- [x] Iniciar repositório git e primeiro commit (v0.1.0 no GitHub, versão antiga na tag `legado-html`)
- [x] Levantar a estrutura real do banco (`supabase/schema-atual.json`)
- [ ] Transformar a estrutura em migrations versionadas (`supabase/migrations`)
- [x] Revisar RLS de todas as tabelas (cada usuário só vê os próprios dados)
- [x] Corrigir a tela de Cartões para bater com o banco (D12) — código pronto
- [x] Rodar `supabase/migrations/20261110_cartoes_e_politicas.sql` no Supabase (colunas dos cartões + remove políticas duplicadas D13)
- [ ] Gerar tipos TypeScript a partir do schema (`supabase gen types`)
- [ ] Mover pagamento, recebimento e estorno para funções no Postgres (RPC) com transação atômica (D1)
- [x] Corrigir cálculo de vencimento das parcelas (D4) — `src/utils/date.ts`
- [x] Juntar `getAuthenticatedUser` num só lugar (`src/services/auth.ts`)
- [ ] Unificar formatação de moeda/data e um SearchBar genérico (D7)
- [x] Escrever o README real do projeto (D9)
- [x] Exibir a versão do app no rodapé do menu
- [ ] Corrigir os avisos do lint (D11)
- [ ] Levar a versão Vite para o repositório do GitHub, preservando a versão antiga em HTML como legado
- [ ] Criar o projeto na Vercel ligado ao GitHub
- [x] Criar `vercel.json` com rewrite para as rotas do BrowserRouter
- [ ] Na Vercel, cadastrar `VITE_SUPABASE_PUBLISHABLE_KEY` (o nome antigo era `ANON_KEY`)
- [ ] Testar na tela cada módulo, principalmente Cartões e Relatórios

### Fase 1 — Responsividade e mobile · v0.3.0
- [x] Sidebar vira menu recolhível (drawer) abaixo de 768px, com botão na Topbar — e no computador recolhe para só ícones
- [ ] Tabelas viram lista de cards no mobile
- [ ] Modais e formulários em tela cheia no mobile
- [ ] Revisar tamanhos de toque (botões, inputs) e teclado numérico em campos de valor
- [ ] PWA: manifest + ícones, para "instalar" no celular e no desktop

### Fase 2 — Completar os módulos · v0.4.0 → v0.7.0
**Contas bancárias** (v0.4.0)
- [ ] Tela de extrato por conta (usar `listBankTransactions`)
- [ ] Lançamento manual de entrada/saída
- [ ] Transferência entre contas (duas transações vinculadas)
- [ ] Saldo calculado no banco (view ou RPC) (D5)

**Contas a pagar / receber** (v0.5.0)
- [ ] Status "vencido" (calculado pela data)
- [ ] Pagamento/recebimento parcial
- [ ] Contas recorrentes (fixas mensais)
- [ ] Filtros por período, status, fornecedor/cliente e categoria
- [ ] Ações em lote (pagar várias)

**Categorias → Contas Gerenciais** (v0.6.0)
- [x] Cadastro de contas gerenciais (`/contas-gerenciais`): nome, tipo receita/despesa, fixa/variável, conta pai e subcontas em quantos níveis quiser (adiantado; precisa rodar `supabase/migrations/20261110_contas_gerenciais.sql`)
- [x] Substituir o campo texto livre "Categoria" de contas a pagar/receber pela escolha de uma conta gerencial (despesa/receita)

**Cartões de crédito** (v0.7.0)
- [ ] Lançamento de compras (à vista e parceladas)
- [ ] Faturas: geração pelo dia de fechamento, fechamento e pagamento (gera `bank_transaction`)
- [ ] Pagar conta a pagar com cartão (usar `card_id`)
- [x] Limite disponível calculado automaticamente
- [x] Dashboard com limite utilizado real (D6)

### Fase 3 — Dashboard e relatórios · v0.8.0
- [ ] Destaque de contas vencidas e que vencem hoje
- [x] Gráfico de entradas x saídas (torres e curvas)
- [x] Despesas/receitas por conta gerencial (pizza)
- [ ] Fluxo de caixa projetado (saldo atual + pendentes futuros)
- [ ] Exportação PDF e Excel

### Fase 4 — Conta do usuário · v0.9.0
- [x] Cadastro de usuário com código de verificação por e-mail (adiantado)
- [x] "Esqueceu a senha?" com código por e-mail (adiantado)
- [ ] SMTP próprio no Supabase (o envio padrão só manda para e-mails da equipe do projeto e tem limite por hora)
- [ ] Tela de perfil (nome, telefone/WhatsApp, preferências)
- [ ] *A definir:* múltiplas empresas por usuário / usuários compartilhando uma empresa

### Fase 5 — Qualidade e publicação · v1.0.0-beta → v1.0.0
- [ ] Testes unitários das regras (Vitest) e de fluxo (Playwright)
- [ ] CI (lint + build + testes)
- [ ] Deploy (ex.: Vercel/Netlify) com ambientes de homologação e produção
- [ ] Monitoramento de erros
- [ ] Beta com usuários convidados (`1.0.0-beta.N`)
- [ ] Release candidate e lançamento da v1.0.0

### Fase 6 — Integração com o Assessor Financeiro ARC (WhatsApp) · v1.1.0
Objetivo: o Assessor no WhatsApp lê e escreve nos mesmos dados do Razão.

**Arquitetura proposta**
- Mesmo projeto Supabase e mesma base de usuários (login único ARC).
- O Assessor **não** acessa as tabelas direto: usa uma **camada de API** (Supabase Edge Functions ou funções RPC) com as mesmas regras de negócio do app. Assim a regra fica num lugar só.
- Vínculo do número de WhatsApp ao usuário (com verificação por código).
- Coluna `source` (`app` | `whatsapp`) nos lançamentos, para auditoria.

**Casos de uso previstos**
- [ ] Vincular número de WhatsApp à conta do Razão
- [ ] "Gastei R$ 50 no mercado" → registrar despesa (com categoria sugerida)
- [ ] "Quanto tenho na conta?" → consultar saldos
- [ ] "O que vence essa semana?" → listar contas a pagar
- [ ] Marcar conta como paga pelo WhatsApp
- [ ] Lembretes automáticos de vencimento
- [ ] Resumo diário/semanal/mensal

**Pré-requisitos dentro do Razão:** Fases 0 (RPCs atômicas, RLS), 2 (categorias), 4 (telefone no perfil) e 5 (app publicado).

---

## 9. Ecossistema ARC

| Produto | Papel | Relação com o Razão |
|---|---|---|
| **Razão Finance ARC** | Gestor financeiro (desktop + mobile) | este projeto |
| **Assessor Financeiro ARC (WhatsApp)** | Assistente financeiro conversacional | consome a API do Razão (Fase 6) |
| *outros produtos ARC* | *a preencher* | |

---

## 10. Decisões em aberto
1. **Público-alvo:** pessoa física, pequena empresa, ou ambos (com perfis separados)?
2. **"Desktop":** basta o app web no navegador (PWA instalável) ou precisa de um app desktop empacotado (ex.: Tauri/Electron)?
3. **Assessor WhatsApp:** já existe? Em que tecnologia (API oficial do WhatsApp/Meta, Z-API, Evolution API...)? Usa o mesmo Supabase?
4. **Login único ARC:** todos os produtos ARC vão compartilhar a mesma conta de usuário?
5. **Multiempresa:** um usuário pode gerir mais de uma empresa/carteira?
6. **Monetização/planos:** haverá limites por plano que o sistema precise controlar?
7. **Agenda (`appointments`):** a tabela de agendamentos com clientes no banco é do Razão ou de outro produto ARC que usa o mesmo Supabase?
