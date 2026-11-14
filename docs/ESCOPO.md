# Razão Finance ARC — Escopo do Projeto

> Documento vivo. Atualize os checkboxes conforme as entregas forem concluídas.
> Última revisão: 12/11/2026 · **Versão atual: v0.1.0+ (alpha; a v0.2.0 sai ao fechar a Fase 0)** · histórico em [CHANGELOG.md](../CHANGELOG.md)
> A página visual deste documento é o **Scopo** (`docs/escopo.html`, publicado como artifact). Os dois devem dizer a mesma coisa.

---

## 1. Visão geral

**Razão Finance ARC** é o **gestor financeiro** do ecossistema **ARC** (*Análises Reais e Computacionais*), a marca guarda-chuva da **D&C** (Donovan & Christopher) para sistemas, principalmente da área financeira. É uma aplicação web pensada primeiro para o **computador**, que também funciona no **celular** e pode ser **instalada como app** (PWA).

No futuro, ele será a **fonte de dados financeira** usada pelo **Assessor Financeiro ARC (WhatsApp)**. O usuário vai poder consultar e registrar informações financeiras por mensagem, e tudo o que for registrado deve aparecer no Razão, e vice-versa.

### Objetivos
1. Controlar contas a pagar e a receber, contas bancárias, caixa e cartões de crédito em um só lugar.
2. Dar visão clara do saldo atual e do que está por vir (fluxo de caixa e agenda de vencimentos).
3. Gerar relatórios para tomada de decisão.
4. Organizar atendimentos e compromissos (agenda) ligados ao financeiro.
5. Servir de base (dados e regras) para o Assessor Financeiro ARC no WhatsApp.

### Público
- **Empresas e pessoas** (PF ou PJ). Cada cliente do sistema é um **ID EMPRESA**, com uma ou mais empresas, vários usuários e permissões por tela.

---

## 2. Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite 8 |
| Rotas | React Router 7 |
| Ícones e gráficos | lucide-react · Recharts |
| Estilo | CSS puro, um arquivo por componente; variáveis globais em `src/styles/global.css` |
| Identidade visual | Marca ARC (D&C): **modo claro (padrão)** com fundo branco e tons de azul da marca, e **modo escuro** com azul elétrico e brilho. Fontes Inter (texto), Exo 2 (títulos) e Michroma (marca). Logo em `src/assets/arc-logo.png`, símbolo em `components/ArcMark` |
| Backend | Supabase (Auth + Postgres com RLS + funções RPC), acessado pelo frontend via `@supabase/supabase-js` |
| Funções no servidor | Supabase Edge Function `admin-users` (Deno), com a chave secreta: cadastro de usuários, troca de senha e empresas do usuário |
| Serviços externos | ViaCEP (endereço pelo CEP) · CNPJ.ws e BrasilAPI (dados do CNPJ na Receita) |
| Publicação | Vercel (https://razao-finance-arc.vercel.app), cada push na `main` publica · GitHub `donsmoreira/projetos` |
| App instalável | PWA: `public/manifest.webmanifest`, `public/icons/`, `public/sw.js` (só guarda a página "Sem conexão") |
| Config | `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` |

### Estrutura de pastas
```
src/
  components/      componentes genéricos (AddressSection, CnpjLookup, CurrencyInput, Modal...)
  contexts/        AuthContext (sessão) e CompanyProvider (empresa aberta e permissões)
  hooks/           useCompany/usePermissions, useCnpjLookup, useTheme
  layouts/         MainLayout (Sidebar com menu agrupado + Topbar)
  pages/<Módulo>/  página + components/
  routes/          AppRoutes, ProtectedRoute, CompanyGate, ModuleRoute
  services/        acesso ao Supabase, um arquivo por módulo
  types/           tipos de domínio
  utils/           formatação, CEP, CNPJ, documento, login com ID
  styles/          CSS global
supabase/
  migrations/      SQLs rodados no Supabase, em ordem
  functions/       Edge Function admin-users
```

---

## 3. O que já existe (estado atual)

Legenda: ✅ pronto · 🟡 parcial · ❌ não existe

### 3.1 Login e conta
| Item | Status | Observação |
|---|---|---|
| Login com **ID EMPRESA**, e-mail e senha | ✅ | o ID fica lembrado no navegador; ID de outro cliente é barrado (no login e no banco) |
| Escolha da empresa depois do login | ✅ | "Em qual empresa você vai operar?", com as empresas do ID liberadas para a pessoa |
| Primeiro acesso (conta sem empresa) | ✅ | ID em branco → "Cadastre sua empresa" com o cadastro completo; nasce um ID novo com a pessoa como administradora |
| Rotas protegidas e sair | ✅ | `ProtectedRoute`, `CompanyGate`, `ModuleRoute` |
| Criar conta (cadastro público) | 🟡 | tela pronta com código por e-mail; **fechado no Supabase** durante os testes. Usuários são criados pelo administrador |
| Esqueceu a senha (código por e-mail) | 🟡 | tela pronta; o e-mail só chega a quem é da equipe do Supabase até configurar o SMTP próprio |
| Meu perfil | ✅ | nome, telefone/WhatsApp, CPF, endereço |
| Alterar a própria senha | ✅ | Meu perfil → Alterar senha: senha atual (conferida sem derrubar a sessão), nova e confirmação; mínimo de 8 caracteres |
| Mensagens de erro em português | ✅ | |

### 3.2 Empresas, usuários e permissões (Configurações)
| Item | Status | Observação |
|---|---|---|
| ID EMPRESA (grupo) | ✅ | sequencial a partir do **2** (o 1 é reservado); a Dons é o ID 2. Empresas do ID têm código 1, 2, 3... ID e código não mudam |
| Multiempresa | ✅ | todos os dados são da empresa aberta; empresa no centro do topo, com seletor (só entre as empresas do ID) |
| Empresas | ✅ | lista com **Cadastro** e **Abrir**; **Nova empresa** abre o cadastro completo; todos os administradores do ID entram nas empresas novas |
| Cadastro da empresa | ✅ | CPF/CNPJ pelo número de dígitos; CNPJ **busca os dados na Receita** (razão social, nome fantasia, enquadramento Simples/MEI, inscrição estadual ativa, contato, endereço, situação cadastral); PF/PJ, regime tributário, inscrições |
| Permissões por tela | ✅ | Administrador; em cada tela **Ver, Cadastrar, Alterar, Excluir** e **Baixar** (contas a pagar/receber). Grade por grupo: Geral (Painel, Agenda, Relatórios), Cadastros, Financeiro (Lançamentos / Contas e caixa). Sem "Ver" a tela some do menu |
| Cadastrar usuário | ✅ | nome, e-mail, senha, empresas do ID (caixinhas) e grade de permissões; se o e-mail já tiver conta, só entra nas empresas. Pelo botão no topo; roda na Edge Function `admin-users` |
| Editar usuário | ✅ | nome, permissões, empresas em que opera e troca de senha (só de quem opera apenas em empresas suas) |
| Convite por código | ✅ | vale 7 dias, uso único, com a mesma grade; mensagem pronta para o WhatsApp |
| Convite por e-mail | ❌ | depende do SMTP |
| Logo da empresa | ❌ | |

### 3.3 Dashboard (`/`)
| Item | Status | Observação |
|---|---|---|
| Total a pagar e a receber (pendentes) | ✅ | valor original + juros + multa |
| Saldo em contas e no caixa | ✅ | saldo inicial + `bank_transactions` |
| Limite utilizado em cartões | ✅ | |
| Próximos vencimentos e saldo por conta | ✅ | |
| Quadro de avisos da semana | ✅ | agendamentos e contas em aberto de domingo a sábado, dia a dia |
| Contas vencidas em destaque | ❌ | (na Agenda as vencidas já aparecem destacadas) |
| Gráficos no painel | ❌ | já existem em Relatórios |

### 3.4 Cadastros
| Módulo | Status | Campos |
|---|---|---|
| Clientes (`/clientes`) | ✅ CRUD + busca + filtro por UF/cidade | tipo (PF/PJ automático pelo documento), CPF/CNPJ com **busca na Receita**, nome/razão social; com PJ: nome fantasia, enquadramento, inscrição estadual; telefone, e-mail, observações, endereço com CEP automático (ViaCEP) |
| Fornecedores (`/fornecedores`) | ✅ CRUD + busca + filtro por UF/cidade | os mesmos campos dos clientes (inclusive o Tipo) |
| Inativar / reativar | ✅ | filtro Ativos/Inativos/Todos; inativo some das listas de escolha e o banco recusa lançamento novo |
| Exclusão bloqueada com movimentação | ✅ | cliente, fornecedor, conta/caixa e cartão com lançamentos ou contas em aberto não são excluídos (gatilho no banco) |

### 3.5 Contas gerenciais (`/contas-gerenciais`, no grupo Financeiro)
✅ Plano de contas de receita e despesa, fixa/variável, contas pai e subcontas em vários níveis, busca e filtro; regras no banco (tipo herdado, nome único por nível, conta em uso não exclui). Obrigatória nos lançamentos.

### 3.6 Controle Bancário (`/bancos`)
| Item | Status | Observação |
|---|---|---|
| Cadastro de contas | ✅ | banco numa lista com código, agência, número, **saldo atual** (o sistema ajusta o saldo inicial), cheque especial |
| Extrato da conta | 🟡 | o service tem `listBankTransactions`, **sem tela** |
| Lançamento manual em banco | 🟡 | existe no Caixa; falta tela para bancos |
| Transferência | 🟡 | banco ↔ caixa pronto (e no fechamento do caixa); falta banco ↔ banco |
| Importar extrato (OFX/CSV) | ❌ | |

### 3.7 Caixa — dinheiro físico (`/caixa`)
| Item | Status | Observação |
|---|---|---|
| Caixa de **operação** e de **retaguarda** (cofre) | ✅ | operação abre e fecha em turnos; retaguarda não abre nem fecha e recebe o dinheiro no fechamento |
| Abertura conferindo o troco | ✅ | troco esperado (reserva do último fechamento) × contado; diferença só com confirmação |
| Fechamento | ✅ | valor contado **obrigatório**; esperado × contado × diferença; envio para a retaguarda e/ou depósito no banco; o resto fica de **reserva** para a próxima abertura |
| Quebra de caixa | ✅ | diferença confirmada vira o lançamento "Quebra de caixa (sobra/falta)" |
| Trava | ✅ | caixa fechado não recebe nem tem saída (inclusive pagar/receber em dinheiro); lançamentos de turno fechado não mudam; só o administrador reabre o último fechamento (desfaz o que ele lançou) |
| Vários turnos por dia e histórico | ✅ | "Aberturas e fechamentos" na tela do Caixa |
| Entradas e saídas avulsas, saque/depósito com o banco | ✅ | |
| Pagar e receber em dinheiro | ✅ | com o caixa aberto |
| Fluxo de caixa por período | ✅ | |
| Saldo nunca negativo | ✅ | regra no banco |

### 3.8 Contas a pagar (`/contas-pagar`) e a receber (`/contas-receber`)
| Item | Status | Observação |
|---|---|---|
| Cadastro e edição (enquanto pendente) | ✅ | |
| Parcelamento | ✅ | vencimento no fim do mês corrigido; o valor informado é o de cada parcela |
| Contrato (meses) | ✅ | "Isso é um contrato?" + meses: uma conta por mês com o valor mensal; bloqueia o parcelamento e vice-versa (`20261114_contrato.sql`) |
| Juros e multa | ✅ | |
| Pagar / receber pela conta ou pelo caixa | ✅ | operação única no banco, sem pagamento em dobro |
| Estorno | ✅ | |
| Conta gerencial | ✅ | **opcional**; se escolhida: pagar só despesa, receber só receita |
| Conta a receber criada ao concluir atendimento | ✅ | pela Agenda |
| Pagar com cartão | — | **não permitido**: compras no cartão ficam em Cartões (regra também no banco) |
| Status "vencido" | ❌ | só `pendente` e `pago`/`recebido` (a Agenda destaca as vencidas) |
| Pagamento/recebimento parcial | ✅ | valor menor que o total: **baixa parcial** (o restante vira nova conta pendente, mesmo vencimento, "(restante)") ou **quitar com desconto**; o estorno junta o restante de volta (`20261114_baixa_parcial.sql`) |
| Baixa em lote | ✅ | várias contas numa operação; valor menor só com o mesmo fornecedor/cliente; estorno desfaz o lote (`20261114_lote_e_renegociacao.sql`) |
| Renegociação | ✅ | contas do mesmo fornecedor/cliente viram "renegociada"; novas à vista ou parceladas, com acréscimo/desconto e **valor de entrada** (já baixada; só o restante é parcelado); dá para desfazer (`20261114_renegociacao_entrada.sql`) |
| Contas recorrentes | ❌ | |
| Anexos (boleto, comprovante) | ❌ | |

### 3.9 Cartões de crédito (`/cartoes`)
| Item | Status | Observação |
|---|---|---|
| Cadastro, banco e bandeira em listas, nome automático | ✅ | |
| Desativar cartão | ✅ | |
| Limite calculado sozinho | ✅ | |
| Lançar compras (à vista e parceladas, até 24x) | ✅ | função `create_card_purchase`: divide o valor (centavos na 1ª) e coloca cada parcela na fatura certa pelo dia de fechamento |
| Faturas | ✅ | mês a mês: fechamento, vencimento, situação, total e histórico (parcela 3/10, total da compra) |
| Pagar fatura e estornar | ✅ | pela conta bancária ou caixa (`pay_card_invoice` / `reverse_card_payment`); permissão "Baixar" na tela Cartões |
| Antecipar fatura | ✅ | só a do mês seguinte (botão "Antecipar fatura"); mais à frente não paga (regra no banco) |
| Extrato detalhado | ✅ | valor da fatura, vencimento, barra do limite (utilizado × disponível), gastos por conta gerencial e parcelamentos em andamento |
| Previsão das próximas faturas | ✅ | até o último mês com parcela |
| Limite usado | ✅ | parcelas ainda não pagas |
| Pagamento parcial da fatura | ❌ | |
| Compras do cartão nos relatórios por conta gerencial | ❌ | hoje o relatório mostra o pagamento da fatura como uma saída |

### 3.10 Agenda (`/agenda`)
| Item | Status | Observação |
|---|---|---|
| Visões Mês (padrão), Semana, Dia e Lista | ✅ | Hoje e setas; a visão escolhida fica lembrada |
| Agendamento | ✅ | cliente (opcional), serviço/assunto, data, início, término, responsável, valor (opcional), status, observações |
| Responsável e conflito | ✅ | todos veem a agenda de todos; filtro por responsável; aviso se o responsável já tem horário sobreposto |
| Status | ✅ | agendado, confirmado, concluído, cancelado, faltou |
| Concluir com conta a receber | ✅ | com valor e cliente, oferece criar a conta a receber (ligada ao agendamento) |
| Concluído travado | ✅ | não move nem altera (regra no banco); só excluir |
| Arrastar | ✅ | para outro dia (Mês) ou dia/horário (Semana/Dia), de 15 em 15 min; cartão que balança como pêndulo; no celular, segura e arrasta |
| Cor por agendamento | ✅ | azul por padrão, 11 sugestões ou qualquer cor (seletor RGB) |
| Vencimentos de contas | ✅ | a pagar (vermelho) e a receber (verde) pela data de vencimento; vencidas destacadas, quitadas apagadas; botões para mostrar/esconder |
| Permissão própria | ✅ | Ver, Cadastrar, Alterar, Excluir |
| Integração com o Google Agenda | ❌ | próxima etapa (projeto no Google Cloud + autorização) |

### 3.11 Relatórios
| Item | Status | Observação |
|---|---|---|
| Geral: Descritivo, Torres, Curvas e Pizza | ✅ | baseado em `bank_transactions`; transferências fora dos totais |
| Filtros | ✅ | conta/caixa, conta gerencial, fornecedor/cliente, estado e cidade, origem; atalhos de período |
| Quebra de caixa | ✅ | período e caixa; sobras, faltas e resultado; cada quebra com quem, esperado, contado e diferença |
| Fluxo de caixa projetado | ❌ | |
| Exportar PDF/Excel | ❌ | |

### 3.12 Visual, menu e celular
| Item | Status | Observação |
|---|---|---|
| Identidade ARC, modo claro (padrão) e escuro | ✅ | chave em pílula no topo, que se estica ao deslizar |
| Menu agrupado | ✅ | Dashboard, Agenda, Cadastros, Financeiro, Relatórios, Configurações; telas sem permissão somem |
| Pílula animada no menu | ✅ | o destaque desliza e estica até o item clicado |
| Menu recolhível / gaveta no celular | ✅ | |
| App instalável (PWA) | ✅ | ícone ARC em fundo branco, tela cheia, barra do celular na cor do sistema, página "Sem conexão" |
| Páginas em telas menores | 🟡 | há ajustes; tabelas ainda precisam virar cartões no celular |
| Formulários em tela cheia no celular | ❌ | |

### 3.13 Segurança — situação em 12/11/2026
| Ponto | Situação |
|---|---|
| Criptografia | ✅ HTTPS no Supabase e na Vercel; disco e backups criptografados; senhas só como hash. Dados não são criptografados campo a campo |
| Acesso sem login | ✅ tabelas e funções negam leitura e gravação |
| Isolamento entre clientes | ✅ RLS por **empresa aberta**, que só vale se for do **ID EMPRESA** com que a pessoa entrou; testado: IDs 1, 3, 999 e em branco barrados; empresa de fora barrada |
| Permissões | ✅ o banco confere a permissão da tela em cada gravação (`has_module_permission`); pagar/receber/estornar pela tela certa; caixa e agenda com travas próprias |
| Chaves | ✅ o site usa só a chave pública; a chave secreta fica só na Edge Function `admin-users`. Papel de servidor (`service_role`) com acesso às tabelas |
| Cabeçalhos de segurança | ✅ `vercel.json`: CSP (próprio site, Supabase, Google Fonts, ViaCEP, CNPJ.ws, BrasilAPI; nada de script embutido), anti-iframe, HSTS, nosniff, Referrer-Policy, Permissions-Policy |
| Cadastro público | ✅ fechado ("Allow new users to sign up" desligado); usuários criados pelo administrador |
| Ferramentas de desenvolvimento | 🟡 10 vulnerabilidades moderadas só no ESLint (não vão para o site) |
| E-mail dos códigos (SMTP) | ❌ o envio padrão do Supabase só chega a quem é da equipe do projeto |
| Senha mínima no Supabase | ❓ conferir se está em 8 (igual à tela) |
| Verificação em duas etapas | ❓ ligar no Supabase, GitHub, Vercel e no e-mail |
| Security Advisor do Supabase | ❓ revisar os avisos |
| LGPD | 🟡 falta termo de consentimento simples para testadores |

---

## 4. Modelo de dados (Supabase)

> Todas as tabelas de dados têm `company_id` e RLS ativo. Valores em `numeric(14,2)`. Os SQLs ficam em `supabase/migrations/` (rodados à mão no SQL Editor, em ordem de data).

| Tabela | Campos principais | Relações |
|---|---|---|
| `company_groups` (ID EMPRESA) | id (a partir do 2), name | created_by |
| `companies` | name, trade_name, document, person_type, tax_regime, inscrições, contato, endereço, **group_id**, **code** (1, 2, 3...) | group_id |
| `company_members` | is_admin (+ permissões gerais antigas, usadas como resumo) | company_id, user_id |
| `company_member_permissions` | module (tela), can_view, can_create, can_update, can_delete, can_settle | company_id, user_id |
| `company_invites` | code, is_admin, module_permissions (JSON), expires_at, used_by/used_at | company_id |
| `profiles` | full_name, phone, cpf, endereço, active_group_id, active_company_id | user_id |
| `clients` | name, type, document, trade_name, state_registration, tax_regime, phone, email, notes, endereço | company_id |
| `suppliers` | os mesmos campos de `clients` (inclusive type) | company_id |
| `management_accounts` | name, type (receita/despesa), nature (fixa/variável) | company_id, parent_id |
| `bank_accounts` | name, bank, agency, account_number, initial_balance, overdraft_limit, account_type (banco/caixa), cash_role (operacao/retaguarda) | company_id |
| `bank_transactions` (o **razão**) | transaction_date, description, value (+ entrada / − saída), transaction_type (manual, payable_payment, receivable_receipt, card_settlement, transfer, cash_adjustment), reference_type, reference_id | bank_account_id, payable_id, cash_session_id |
| `cash_sessions` (turnos do caixa) | status, abertura (esperado, contado, diferença), fechamento (esperado, contado, diferença, retaguarda, depósito, reserva), reabertura | cash_account_id, backoffice_account_id, bank_account_id |
| `payables` | description, category, original_value, interest, penalty, issue_date, due_date, status (pendente/pago/renegociada), payment_*, paid_value, installment_*, partial_of, batch_id, renegotiation_id, renegotiated_from | supplier_id, bank_account_id, management_account_id, card_id |
| `receivables` | igual a payables, com received_value / receipt_date | client_id, bank_account_id, management_account_id |
| `appointments` (agenda) | appointment_date, start_time, end_time, title, amount, color, status, notes, confirmed_at/completed_at/canceled_at | client_id (opcional), responsible_id, receivable_id |
| `credit_cards` | name, brand, credit_limit, closing_day, due_day, active | bank_account_id |
| `card_transactions` / `card_settlements` | compras e pagamentos de fatura | card_id |

**Funções principais:** `current_company_id()`, `current_group_id()`, `enter_group(id)`, `set_active_company`, `has_module_permission(tela, ação)`, `pay_payable` / `receive_receivable` e estornos, `transfer_between_accounts`, `open_cash_session` / `close_cash_session` / `reopen_cash_session`, `create_company`, `set_member_permissions`, `create_invite` / `accept_invite`, `update_member_name`.

**Princípio central:** `bank_transactions` é o **razão** do sistema. Todo dinheiro que entra ou sai de uma conta ou caixa vira uma linha nessa tabela, e saldos e relatórios saem dela.

---

## 5. Regras de negócio atuais
1. Todo dado pertence a uma **empresa**. A pessoa só vê a empresa aberta, que precisa ser do **ID EMPRESA** com que entrou e de que ela participa.
2. O que cada usuário pode fazer é definido **por tela** (Ver, Cadastrar, Alterar, Excluir, Baixar). O administrador pode tudo.
3. Contas a pagar e a receber só podem ser editadas ou excluídas enquanto estiverem `pendente`.
4. Pagar ou receber gera uma `bank_transaction` e marca a conta como `pago`/`recebido`, numa operação só. O estorno desfaz os dois juntos.
5. Parcelamento: N registros com vencimento mês a mês e descrição "(i/N)".
6. Valor de uma conta = valor original + juros + multa.
7. Caixa de operação só movimenta com o turno **aberto**. Fechamento exige o valor contado; diferença confirmada vira "Quebra de caixa". Turno fechado fica travado; só o administrador reabre o último.
8. O saldo do caixa nunca fica negativo.
9. Atendimento **concluído** na agenda não pode ser movido nem alterado; só excluído.

---

## 6. Problemas conhecidos (dívida técnica)

| # | Problema | Onde | Prioridade |
|---|---|---|---|
| D1 | ✅ Resolvido: pagamento, recebimento e estornos atômicos no banco | `20261111_pagamentos_atomicos.sql` | — |
| D2 | 🟡 Os SQLs ficam versionados em `supabase/migrations`, mas o esquema original (de antes da retomada) não tem migration própria | `supabase/` | Média |
| D3 | ✅ Resolvido: git e GitHub | — | — |
| D4 | ✅ Resolvido: parcelas no fim do mês | `src/utils/date.ts` | — |
| D5 | Dashboard calcula saldo baixando **todas** as transações (não escala) | `dashboardService.ts` | Média |
| D6 | ✅ Resolvido: limite utilizado em cartões | — | — |
| D7 | 🟡 `getAuthenticatedUser` já unificado; falta um SearchBar genérico e unificar formatação de moeda/data | `pages/*/components` | Baixa |
| D8 | ~~Excluir conta bancária com lançamentos~~ ✅ resolvido em 13/11/2026: gatilho no banco bloqueia | `20261113_inativar_e_bloquear_exclusao.sql` | — |
| D9 | ✅ Resolvido: README | — | — |
| D10 | Testes automáticos: só scripts de regras rodados à parte; nenhum teste de tela | — | Média |
| D11 | `npm run lint` acusa 15 erros antigos (`setState` direto em `useEffect` e um export misto no AuthContext). Não quebra o app | páginas e formulários | Baixa |
| D12 | ✅ Resolvido: tela de Cartões batendo com o banco | — | — |
| D13 | ✅ Resolvido: políticas RLS duplicadas | — | — |
| D14 | Usuário com acesso limitado ainda não foi testado com uma segunda conta de verdade | permissões | Média |
| D15 | A função `admin-users` é publicada à mão pelo painel do Supabase: toda mudança no arquivo precisa ser republicada | `supabase/functions/admin-users` | Baixa |
| D16 | "Ver" controla a tela; a leitura dos dados pela API continua liberada a quem é da empresa (uma tela usa dados de outras) | RLS | Baixa |
| D17 | Um cadastro poderia apontar para fornecedor/conta de outra empresa (identificadores impossíveis de adivinhar; risco quase nulo) | chaves estrangeiras | Baixa |

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
2. A versão fica em `package.json` e aparece no rodapé do menu.
3. Cada versão vira uma tag no git: `v0.2.0`, `v1.0.0-beta.1`...
4. A v0.1.0 é a **linha de base**: tudo que existia ao retomar o projeto.

**Mapa de versões**
| Versão | Entrega |
|---|---|
| v0.1.0 | Linha de base |
| v0.2.0 | Fase 0 — Fundação |
| v0.3.0 | Fase 1 — Celular |
| v0.4.0 → v0.7.0 | Fase 2 — Bancos (0.4), Contas (0.5), Contas gerenciais (0.6), Cartões (0.7); Caixa e Agenda adiantados |
| v0.8.0 | Fase 3 — Painel e relatórios |
| v0.9.0 | Fase 4 — Conta, empresas e usuários |
| v1.0.0-beta → v1.0.0 | Fase 5 — Qualidade e publicação |
| v1.1.0 | Fase 6 — Integração com o Assessor WhatsApp |

---

## 8. Roadmap (o que está planejado)

### Fase 0 — Fundação · v0.2.0
- [x] Repositório git e GitHub (versão antiga preservada como legado)
- [x] Levantar a estrutura real do banco (`supabase/schema-atual.json`)
- [x] Revisar as regras de acesso (RLS) de todas as tabelas
- [x] Corrigir a tela de Cartões e rodar os SQLs pendentes
- [x] Pagamento, recebimento e estorno atômicos no Postgres (D1)
- [x] Corrigir vencimento das parcelas (D4) · README (D9) · versão no menu
- [x] Publicação na Vercel ligada ao GitHub, `vercel.json`, variáveis e endereços no Supabase
- [x] Cabeçalhos de segurança, cadastro público fechado, ferramentas atualizadas
- [ ] Gerar tipos TypeScript a partir do banco (`supabase gen types`)
- [ ] Unificar formatação de moeda/data e um SearchBar genérico (D7)
- [ ] Corrigir os avisos do lint (D11)
- [ ] E-mail próprio (SMTP) no Supabase
- [ ] Senha mínima 8 no Supabase · verificação em duas etapas · revisar o Security Advisor
- [ ] Testar cada módulo com um usuário de acesso limitado (D14)

### Fase 1 — Celular · v0.3.0
- [x] Menu recolhível (gaveta no celular, só ícones no computador)
- [x] App instalável (PWA) com ícone ARC e página "Sem conexão"
- [ ] Tabelas viram lista de cartões no celular
- [ ] Formulários em tela cheia no celular
- [ ] Tamanhos de toque e teclado numérico nos campos de valor

### Fase 2 — Completar os módulos · v0.4.0 → v0.7.0
**Controle Bancário** (v0.4.0)
- [x] Transferência banco ↔ caixa
- [ ] Tela de extrato por conta
- [ ] Lançamento manual em banco
- [ ] Transferência banco ↔ banco
- [ ] Saldo calculado no banco (D5)

**Caixa** (adiantado)
- [x] Caixa de dinheiro físico com fluxo de caixa; pagar e receber pelo caixa
- [x] Abertura e fechamento em turnos, quebra de caixa, retaguarda, depósito, reserva e trava
- [x] Relatório de quebra de caixa

**Agenda** (adiantado)
- [x] Mês, semana, dia e lista; responsável, conflito e status
- [x] Concluir gera conta a receber; concluído travado
- [x] Arrastar com cartão que balança; cor por agendamento (sugestões e RGB)
- [x] Vencimentos de contas a pagar e a receber na agenda
- [ ] Integração com o Google Agenda

**Contas a pagar / receber** (v0.5.0)
- [ ] Status "vencido" (calculado pela data)
- [x] Pagamento/recebimento parcial (restante em aberto ou desconto)
- [x] Baixa em lote (pagar/receber várias de uma vez)
- [x] Renegociação (à vista ou parcelada, com entrada e desfazer)
- [ ] Contas recorrentes
- [ ] Filtros por período, status, fornecedor/cliente e conta gerencial

**Contas gerenciais** (v0.6.0)
- [x] Plano de contas com subcontas
- [x] Conta gerencial nos lançamentos (opcional desde 13/11/2026)

**Cartões de crédito** (v0.7.0)
- [x] Limite calculado sozinho; limite utilizado no Dashboard
- [x] Lançar compras (à vista e parceladas)
- [x] Faturas com histórico, pagamento e estorno; previsão das próximas
- [ ] Pagamento parcial da fatura
- [ ] Compras do cartão nos relatórios por conta gerencial

### Fase 3 — Painel e relatórios · v0.8.0
- [x] Torres, curvas e pizza; despesas e receitas por conta gerencial; filtros amplos
- [x] Relatório de quebra de caixa
- [ ] Contas vencidas e de hoje em destaque no painel
- [ ] Gráficos no painel inicial
- [ ] Fluxo de caixa projetado
- [ ] Exportar PDF e Excel

### Fase 4 — Conta, empresas e usuários · v0.9.0
- [x] Criar conta e recuperar senha com código no e-mail (telas)
- [x] Meu perfil (nome, WhatsApp, CPF, endereço)
- [x] Multiempresa e multiusuário
- [x] ID EMPRESA, login com ID, escolha da empresa e primeiro acesso com cadastro completo
- [x] Cadastro da empresa com busca do CNPJ na Receita
- [x] Permissões por tela
- [x] Cadastrar e editar usuário (nome, empresas, permissões, senha); convite por código
- [ ] Convite por e-mail (depende do SMTP)
- [ ] Logo da empresa

### Fase 5 — Qualidade e publicação · v1.0.0-beta → v1.0.0
- [ ] Testes automáticos (Vitest e Playwright)
- [ ] Checagem automática a cada mudança (CI: lint + build + testes)
- [ ] Ambientes de teste e de produção
- [ ] Monitorar erros
- [ ] Beta com usuários convidados, release candidate e lançamento da v1.0.0

### Fase 6 — Integração com o Assessor Financeiro ARC (WhatsApp) · v1.1.0
Objetivo: o Assessor no WhatsApp lê e escreve nos mesmos dados do Razão.

**Arquitetura proposta**
- Mesmo projeto Supabase e mesma base de usuários.
- O Assessor **não** acessa as tabelas direto: usa uma **camada de API** (Edge Functions ou funções RPC) com as mesmas regras do app.
- Vínculo do número de WhatsApp ao usuário (com verificação por código), respeitando o ID EMPRESA e as permissões.
- Coluna `source` (`app` | `whatsapp`) nos lançamentos, para auditoria.

**Casos de uso previstos**
- [ ] Vincular número de WhatsApp
- [ ] "Gastei R$ 50 no mercado" → registrar despesa
- [ ] "Quanto tenho na conta?" → consultar saldos
- [ ] "O que vence essa semana?" → listar contas
- [ ] Marcar conta como paga
- [ ] Lembretes de vencimento e de agendamentos
- [ ] Resumo diário, semanal e mensal

### Fase 7 — Nota fiscal de serviço (NFS-e)
Objetivo: emitir NFS-e (padrão nacional) pelo sistema, por meio de uma API de emissão (ex.: Focus NFe, PlugNotas, NFE.io, Nuvem Fiscal), com chamadas feitas no servidor (Edge Functions). NF-e e NFC-e ficam para depois (dependem de produtos/estoque e PDV).

- [x] Código IBGE da cidade no endereço (automático pelo CEP e pelo CNPJ)
- [x] Empresa: CNAE principal, regime especial de tributação, série e próximo número, ambiente (homologação/produção); inscrição municipal
- [x] Cliente PJ: inscrição municipal
- [ ] Escolher a API de emissão; certificado digital A1 enviado para ela
- [ ] Cadastro de serviços (código do serviço, ISS, retenções) — sob comando
- [ ] Emitir, consultar, cancelar; guardar XML e PDF (5 anos)
- [ ] Ambientes de homologação e produção do sistema (ramificações `homolog` e `prod`)

---

## 9. Ecossistema ARC

| Produto | Papel | Relação com o Razão |
|---|---|---|
| **Razão Finance ARC** | Gestor financeiro (computador, celular e app instalável) | este projeto |
| **Assessor Financeiro ARC (WhatsApp)** | Assistente financeiro conversacional | consome a API do Razão (Fase 6) |
| *outros produtos ARC* | *a preencher* | |

---

## 10. Decisões

**Já decididas**
1. **Público:** empresas e pessoas (PF/PJ), organizadas por **ID EMPRESA**, com multiempresa, multiusuário e permissões por tela.
2. **"Desktop":** o app web no navegador, **instalável como PWA** no celular e no computador.
3. **Multiempresa:** sim. Só administradores criam empresas; quem cria vira administrador; os administradores do ID entram nas empresas novas.
4. **Agenda (`appointments`):** é do Razão.
5. **Login:** ID EMPRESA + e-mail + senha; usuários criados pelo administrador.

**Em aberto**
1. **ID 1:** reservado para um uso específico, a definir.
2. **Google Agenda:** só enviar do sistema para o Google, ou nos dois sentidos?
3. **Cadastro público:** quando reabrir o "Criar conta" (depende do SMTP)?
4. **Assessor WhatsApp:** tecnologia (API oficial da Meta, Z-API, Evolution API) e se usa o mesmo Supabase.
5. **Login único ARC:** todos os produtos ARC vão compartilhar a mesma conta?
6. **Planos e cobrança:** limites por plano (o ID EMPRESA é a unidade natural de cobrança)?
