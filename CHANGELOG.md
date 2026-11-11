# Histórico de versões — Razão Finance ARC

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), com numeração [SemVer](https://semver.org/lang/pt-BR/).
O esquema de versões e o que entra em cada uma estão em [docs/ESCOPO.md](docs/ESCOPO.md#7-versionamento).

## [Não lançado]

### Adicionado
- **Multiempresa e multiusuário.** Cada usuário pode participar de várias empresas, e cada empresa de vários usuários. Todos os dados (clientes, fornecedores, contas, caixa, lançamentos, cartões) passam a ser da empresa; o banco só mostra a empresa aberta. Os dados existentes foram para uma empresa criada automaticamente para cada usuário, com ele como administrador. SQL `supabase/migrations/20261111_multiempresa.sql`.
- Permissões por usuário em cada empresa: Administrador (pode tudo, configura a empresa e os usuários, cria empresas), Cadastrar, Alterar, Excluir e Baixar (pagar, receber e estornar). Todos podem visualizar. As telas só mostram os botões permitidos, e o banco barra o resto.
- Convite por código (vale 7 dias, uso único), com mensagem pronta para mandar pelo WhatsApp.
- Cadastro da empresa (Configurações → Empresas → botão Cadastro em cada empresa da lista; administradores alteram, os demais só veem): CPF ou CNPJ reconhecido pelo número de dígitos (com conferência dos dígitos verificadores); com CPF escolhe PF ou PJ; com CNPJ é PJ e pede razão social, nome fantasia e regime tributário (Simples Nacional, Simples Nacional – MEI, Regime Normal, Não contribuinte); inscrições, contato e endereço com CEP automático.
- Busca do CNPJ na Receita: ao terminar de digitar um CNPJ válido no cadastro da empresa, razão social, nome fantasia, regime (Simples/MEI), inscrição estadual ativa, telefone, e-mail e endereço se preenchem sozinhos, e aparecem a situação cadastral (aviso se não estiver ativa), a data de abertura e a atividade principal. Fontes gratuitas: CNPJ.ws (consulta pública) e, se falhar, BrasilAPI. Botão "Buscar na Receita" para repetir. Telefone e e-mail só entram se estiverem vazios.
- A mesma busca do CNPJ em clientes e fornecedores, que ganham os campos Nome fantasia e Inscrição estadual (SQL `supabase/migrations/20261111_nome_fantasia_ie_clientes_fornecedores.sql`). O CPF/CNPJ é formatado ao digitar; no cliente, o Tipo vira Pessoa Física ou Jurídica sozinho. A busca da lista também procura pelo nome fantasia.
- Dados de empresa sempre visíveis e editáveis: no cadastro da empresa, Razão social, Nome fantasia, Enquadramento (regime tributário), Inscrição estadual e municipal aparecem desde o início (somem só para pessoa física). Em clientes e fornecedores, com CNPJ ou Tipo "Pessoa Jurídica" aparecem Razão social, Nome fantasia, Enquadramento e Inscrição estadual. Fornecedor ganha o campo Tipo (PF/PJ), escolhido sozinho pelo CPF/CNPJ. O CPF/CNPJ fica no topo do formulário. SQL `supabase/migrations/20261111_enquadramento_clientes_fornecedores.sql` (enquadramento em clientes e fornecedores, tipo no fornecedor e enquadramento da empresa liberado também para CPF de PJ).
- Contas Gerenciais passa para o grupo Financeiro do menu.
- **Permissões por tela.** Em cada tela o administrador escolhe Ver, Cadastrar, Alterar, Excluir e, em Contas a Pagar e a Receber, Baixar. A grade em Usuários e permissões é dividida em Geral (Painel inicial, Relatórios), Cadastros (Clientes, Fornecedores) e Financeiro, que tem as divisões Lançamentos (Contas a Pagar, Contas a Receber) e Contas e caixa (Caixa, Contas Bancárias, Cartões, Contas Gerenciais). Sem "Ver", a tela some do menu e, aberta pelo endereço, mostra um aviso. O convite usa a mesma grade. O banco confere a permissão da tela em cada gravação (caixa e conta bancária pelo tipo da conta; pagar/receber/estornar pela tela certa). Quem já estava na empresa recebeu em todas as telas as permissões que tinha. SQL `supabase/migrations/20261111_permissoes_por_tela.sql`.
- **ID EMPRESA.** Cada cliente do sistema é um ID (número sequencial a partir do 2; o 1 fica reservado) e as empresas dele têm o código 1, 2, 3... A Dons virou o ID 2, empresa 1. O login pede ID EMPRESA, e-mail e senha (o ID fica lembrado no navegador) e o banco só abre empresas do ID informado de que a conta participa: ID de outro cliente é barrado no login, em cada leitura/gravação e na troca de empresa. ID e código não podem ser alterados. SQL `supabase/migrations/20261111_id_empresa.sql`.
- Tela "Em qual empresa você vai operar?" logo depois do login, com as empresas do ID liberadas para a pessoa (pula quando só há uma e ela já está aberta). O seletor do topo mostra o código e troca só dentro do ID.
- Primeiro acesso: conta sem empresa entra com o ID em branco e cai em "Cadastre sua empresa", com o cadastro completo (CNPJ com busca na Receita, enquadramento, endereço); ao cadastrar nasce um ID novo com a pessoa como administradora. Empresas novas ficam no mesmo ID, com o próximo código, e todos os administradores do ID entram nelas.
- **Cadastrar usuário** (Usuários e permissões, pelo botão no topo da tela; o formulário só abre ao clicar e tem Cancelar; o convite por código também fica atrás do botão "Convidar por código"): nome, e-mail, senha, empresas do ID em que vai operar (caixinhas) e a grade de permissões, que vale para todas as marcadas. Se o e-mail já tiver conta, ele só é incluído nas empresas. O administrador também muda as empresas em que a pessoa opera e troca a senha de quem opera só em empresas dele. Roda na função `supabase/functions/admin-users` do Supabase, que tem a chave secreta (o site não tem). O convite por código continua.
- Configurações → Empresas (lista com Cadastro e Abrir; botão Nova empresa, que abre o cadastro completo em branco; entrar com código), Usuários e permissões e Meu perfil (nome, telefone/WhatsApp, CPF e endereço).
- Tela de entrada para quem ainda não tem empresa: criar a primeira (vira administrador) ou entrar com código.
- Menu lateral agrupado: Cadastros (clientes, fornecedores), Financeiro (contas a pagar e a receber, caixa, contas bancárias, cartões, contas gerenciais), Relatórios e Configurações. Recolhido, mostra os ícones separados por grupo.
- Nome da empresa no centro do topo; com mais de uma empresa vira um seletor para trocar.
- Endereço opcional em clientes e fornecedores (CEP, rua, número, complemento, bairro, cidade e UF). Ao digitar o CEP, rua, bairro, cidade e UF se preenchem sozinhos pelo ViaCEP (base dos Correios) e o cursor vai para o número; CEP inexistente ou serviço fora do ar só avisam, sem travar o cadastro. SQL `supabase/migrations/20261111_endereco_clientes_fornecedores.sql`.
- Listas de clientes e fornecedores com filtro por Estado (UF) e Cidade (só aparecem os que têm cadastro, com a quantidade; opção "Sem endereço"), coluna Cidade/UF e busca também por rua, bairro e cidade. Cidades iguais com grafias diferentes ("São Paulo" e "sao paulo") contam como uma só.
- Relatórios com filtro por Estado e Cidade do fornecedor/cliente, e Torres e Pizza agrupadas por estado ou por cidade.
- Conta gerencial obrigatória nos lançamentos: contas a pagar só aceitam contas de **despesa** e contas a receber só de **receita** (regra também no banco de dados). Contas que têm subcontas aparecem como título; o lançamento vai na subconta. A coluna "Categoria" virou "Conta gerencial".
- Caixa (`/caixa`): cadastro de caixas de dinheiro físico, com saldo, entradas e saídas avulsas, transferência banco ↔ caixa (saque/depósito) e fluxo de caixa por período (saldo anterior, entradas, saídas, saldo linha a linha). O caixa nunca fica negativo.
- Pagamentos e recebimentos podem ser feitos pelo caixa, mostrando o saldo antes e depois.
- Relatórios com 4 visões: Descritivo (tabela, agora com a conta gerencial), Torres (barras de entradas x saídas), Curvas (linhas com resultado acumulado) e Pizza (despesas ou receitas por conta gerencial, por conta principal ou subconta). Transferências não contam como entrada nem saída.
- SQL `supabase/migrations/20261110_lancamentos_e_caixa.sql`.
- Lançamentos antigos (só com categoria em texto) aparecem nos relatórios como "NOME (categoria antiga)".
- Relatórios com filtros amplos, que valem para a tabela, o resumo e todos os gráficos: conta/caixa, conta gerencial (inclui as subcontas), fornecedor/cliente e origem. Atalhos de período: hoje, este mês, mês passado, últimos 30/90 dias, este ano, ano passado.
- Torres com "Ver por": período, conta gerencial (principal ou subconta), fornecedor/cliente, lançamento (parcelas juntas), conta/caixa ou origem. Pizza com "Mostrar" (saídas, entradas ou entradas x saídas) e "Fatias por" com as mesmas opções. Cada item mantém a mesma cor ao filtrar.
- Tabela do relatório com a coluna "Fornecedor / cliente".
- Modo claro e modo escuro: chave em pílula no topo, ao lado do nome do usuário (bolinha à esquerda = claro, à direita = escuro), que se estica ao deslizar. O claro é o padrão e tem fundo branco e tons claros de azul da marca. A escolha fica salva no navegador, e os gráficos e a tela de entrada acompanham o tema.
- Menu lateral: o item selecionado é um botão azul sólido com texto branco, e os demais itens têm texto mais forte.
- Menu lateral recolhível, com botão à esquerda do título no topo. No computador, recolhe para uma faixa só com ícones (o nome aparece ao passar o mouse) e o conteúdo ocupa o espaço liberado; a escolha fica salva. No celular (até 768px), o menu vira uma gaveta que abre por cima da tela e fecha ao escolher uma tela, ao tocar no fundo escuro ou com Esc.

### Segurança
- Papel de servidor do Supabase (`service_role`, usado só pela função `admin-users` com a chave secreta) com acesso às tabelas: neste projeto ele não vinha liberado nas tabelas criadas por SQL. SQL `supabase/migrations/20261111_permissao_servidor.sql`. A função usa as chaves novas do Supabase (publishable/secret) e mostra o motivo técnico quando falha.
- Pagamento, recebimento e os dois estornos agora são uma operação só, feita no banco de dados (`supabase/migrations/20261111_pagamentos_atomicos.sql`): o lançamento na conta/caixa e a mudança de status acontecem juntos, ou nada muda. A conta fica travada durante o pagamento, então cliques repetidos não pagam duas vezes. As telas continuam iguais.
- Cabeçalhos de segurança no `vercel.json`: Content-Security-Policy (o site só carrega coisas dele mesmo, do Supabase, das fontes do Google e das consultas de CEP (ViaCEP) e CNPJ (CNPJ.ws, BrasilAPI), e não aceita script embutido), proibição de abrir o sistema dentro de outro site, HTTPS obrigatório (HSTS), `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- O script que aplica o tema saiu de dentro do `index.html` para `public/theme-init.js`, para a regra acima poder bloquear scripts embutidos.
- Ferramentas de desenvolvimento atualizadas com `npm audit fix` (Vite 8.3.7): as 5 vulnerabilidades altas foram resolvidas; sobram 10 moderadas só no ESLint.
- Diagnóstico de segurança registrado no `docs/ESCOPO.md` (seção 3.11).

### Corrigido
- Campo de valor zerado: ao clicar, o campo fica vazio para digitar direto (antes, digitar "50" em "0,00" não fazia nada).
- Contas Gerenciais (`/contas-gerenciais`): plano de contas de receitas e despesas. Cada conta tem nome, tipo (receita ou despesa) e se é fixa ou variável, e pode ter subcontas em vários níveis (ex.: RECEITA TRABALHO › Empresa X). A subconta herda o tipo da conta pai; nomes repetidos no mesmo nível e exclusão de conta com subcontas são bloqueados. Tabela criada por `supabase/migrations/20261110_contas_gerenciais.sql`.
- Identidade visual ARC em todo o sistema: tema escuro com azul elétrico e brilho, baseado na logo da ARC (D&C). Cores centralizadas em variáveis em `src/styles/global.css`; fontes Inter, Exo 2 e Michroma.
- Logo ARC na tela de entrada, símbolo de circuito no menu lateral e no ícone da aba do navegador; título da aba "Razão Finance ARC".
- Tela "Criar conta" (`/cadastro`): e-mail, senha e confirmação; a conta é ativada com um código enviado por e-mail, com opção de reenviar (a cada 60 s) e trocar o e-mail.
- Tela "Esqueceu a senha?" (`/esqueci-senha`): código enviado por e-mail e criação da nova senha.
- Login com links para as duas telas; e-mail não confirmado leva direto para a digitação do código.
- Mensagens de erro do login/cadastro traduzidas para português.
- Contas bancárias: a lista mostra o código do banco ("748 - SICREDI", códigos conferidos na lista do Banco Central) e o campo "Nome da conta" foi removido; o nome passa a ser o próprio banco.
- Contas aparecem como "748 - SICREDI · Ag. · Conta" nas baixas, nos cartões, no Dashboard e nos relatórios.
- Todos os campos de dinheiro (conta bancária, contas a pagar/receber, juros, multa, baixas) usam o `CurrencyInput`: 2 casas decimais, edição em qualquer posição. O saldo inicial aceita valor negativo.
- Contas bancárias: o banco é escolhido numa lista fixa de bancos do Brasil (só o nome, sem código), com a opção "Outro banco" para digitar. Contas antigas com código ("748 - Sicredi") abrem já com o banco certo selecionado.
- Cartões: o banco é escolhido entre as contas bancárias cadastradas, em vez de digitado.
- Cartões: lista fixa das bandeiras usadas no Brasil (Visa, Mastercard, Elo, American Express, Hipercard e outras).
- Cartões: o nome é montado sozinho com banco + bandeira em maiúsculas (ex.: SICREDI VISA), sem digitação e sem o código numérico do banco.
- Campo de valor em reais (`CurrencyInput`) com 2 casas decimais: edita qualquer casa do número sem o cursor pular, centavos por substituição, e formata como 5.000,00 ao sair do campo. Usado no limite total do cartão.
- Versão do app no rodapé do menu lateral.
- `vercel.json` para as rotas internas funcionarem ao atualizar a página na Vercel.
- README do projeto.
- Consulta para levantar a estrutura do banco (`supabase/levantamento-schema.sql`).

### Corrigido
- Tela de Cartões não funcionava: usava colunas que não existiam na tabela `credit_cards`. Agora usa `credit_limit` como limite total, e o SQL `supabase/migrations/20261110_cartoes_e_politicas.sql` cria os campos que faltavam.
- Limite disponível do cartão passa a ser só exibido, calculado como limite total − (gastos − baixas de fatura), em vez de digitado.
- Dashboard mostrava o limite utilizado em cartões sempre como R$ 0,00.
- Remoção de políticas de segurança duplicadas em `credit_cards` e `receivables`.
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
