# Razão — Gestão Financeira (100% offline)

Site local para gestão financeira, com login para mais de uma pessoa usar o
mesmo sistema sem misturar dados: fornecedores, clientes, contas bancárias
(com cheque especial), contas a pagar e a receber (com juros, multa e
parcelamento), cartões de crédito (com compras parceladas) e relatórios
filtráveis.

Não depende de internet, servidor, banco de dados externo ou instalação de
pacotes. Todos os dados ficam salvos no `localStorage` do próprio navegador,
no seu computador.

## Como abrir

**Opção 1 — mais simples:** dê duplo-clique em `index.html`. Abre direto no
navegador e já funciona.

**Opção 2 — recomendada, evita qualquer bloqueio do navegador para arquivos
locais:** sirva a pasta como um site local.

- No VS Code, instale a extensão **Live Server** e clique em "Go Live" com o
  `index.html` aberto; ou
- Pelo terminal, dentro da pasta do projeto:
  ```bash
  python3 -m http.server 8000
  ```
  e acesse `http://localhost:8000` no navegador.

Qualquer uma das duas formas funciona 100% offline — nenhuma requisição sai
da sua máquina.

## Estrutura do projeto

```
gestao-financeira/
├── index.html          → estrutura da página, tela de login e das abas
├── css/style.css        → identidade visual (tema "livro-razão")
├── js/app.js            → todos os dados, cálculos e regras de negócio
└── README.md
```

Simples assim — pode abrir e editar tudo no VS Code sem processo de build,
sem `npm install`, sem dependências externas.

## Login e múltiplos usuários

Ao abrir o site, aparece uma tela de login. Clique em **Criar usuário** para
cadastrar o primeiro acesso (usuário + senha). Cada usuário cadastrado tem
seus **próprios dados**, completamente separados dos demais — fornecedores,
clientes, contas, cartões, tudo. Várias pessoas podem usar o mesmo
computador/instalação sem que uma veja ou afete os dados da outra.

**Importante sobre segurança:** como este é um site 100% local, sem
servidor, esse login serve para **organizar** os dados de cada pessoa — não
é uma segurança real como a de um sistema bancário. As senhas são
transformadas com um hash (SHA-256) antes de serem salvas, então não ficam
"em texto puro", mas qualquer pessoa com acesso técnico ao navegador (ex.:
DevTools) ou ao arquivo consegue, em tese, acessar os dados salvos. Não use
senhas que você usa em outros lugares importantes.

Se você já vinha usando uma versão anterior deste sistema (sem login) e tem
dados salvos, ao criar o **primeiro** usuário o sistema pergunta se você
quer migrar esses dados antigos para a nova conta.

Há um botão **Sair** na barra lateral para trocar de usuário.

## Abas e regras de negócio

### Fornecedores / Clientes
Fornecedores só aparecem em **Contas a Pagar**; clientes só aparecem em
**Contas a Receber** — essa separação vale em todo o sistema, inclusive nos
Relatórios. Cada cadastro tem nome, tipo, documento, telefone, e-mail e
observações. Só podem ser excluídos se não tiverem nenhuma conta vinculada.

### Contas bancárias
Cadastre quantas contas quiser, com saldo inicial e um **limite de cheque
especial** opcional (a conta pode ficar negativa até esse valor). Em cada
conta você pode:
- **Movimentar**: lançar uma entrada ou saída manual;
- **Pagar conta a pagar** / **Receber conta a receber**: vincular uma
  dívida/recebimento pendente a essa conta — debita ou credita o valor total
  automaticamente;
- Ver o extrato completo, com saldo atual e saldo disponível (considerando o
  limite) sempre recalculados.

Qualquer saída (manual, pagamento ou baixa de cartão) que ultrapasse o
limite de cheque especial é bloqueada com aviso. Entradas (manuais ou
recebimentos) sempre abatem automaticamente um saldo negativo, pois o saldo
é sempre a soma de tudo. Excluir/estornar uma movimentação que reduziria o
saldo abaixo do limite também é bloqueado, para não deixar a conta num
estado impossível.

### Contas a pagar / Contas a receber
Fornecedor ou cliente, descrição, **valor**, **juros** e **multa**
(opcionais, somam ao total automaticamente) e datas de **emissão** e
**vencimento**.

**Parcelamento:** ao criar uma conta nova, informe a quantidade de parcelas;
o sistema gera uma parcela (um lançamento independente) para cada uma, e
você define a data de vencimento de cada parcela individualmente (por
padrão, mensal a partir da data informada, mas editável). Juros/multa não se
aplicam no momento de parcelar — se uma parcela específica vencer em atraso,
edite só ela depois para adicionar juros/multa.

Pagamento/recebimento: contas a pagar podem ser quitadas por **conta
bancária** ou **cartão de crédito**; contas a receber, sempre por **conta
bancária**. Ambas podem ser **estornadas**, voltando ao estado pendente.

### Cartões de crédito
Vincule o cartão a uma conta bancária (necessário para dar baixa depois).

**Compras parceladas:** ao lançar uma compra, informe o valor total e a
quantidade de parcelas — o sistema calcula sozinho em qual fatura cada
parcela cai, com base no dia de fechamento do cartão (compras após o
fechamento entram na fatura seguinte).

Em **Dar baixa**, escolha quais lançamentos em aberto quer quitar agora — o
sistema soma o total selecionado e debita automaticamente da conta bancária
vinculada (respeitando o limite de cheque especial dela).

### Relatórios
Alterne entre **Contas a pagar** e **Contas a receber** no topo. Contas a
pagar: filtros em cascata por fornecedor → cartão → status → período. Contas
a receber: cliente → status → período. Mostra totais gerais, juros e
multas, pendente no filtro, lista detalhada e resumo por fornecedor/cartão
ou por cliente.

## Backup dos dados

Como tudo fica salvo no navegador (por usuário), vale exportar de vez em
quando:

- **Exportar dados**: baixa um `.json` com todos os dados do usuário logado.
- **Importar dados**: substitui os dados do usuário logado pelos do arquivo
  (pede confirmação antes).
- **Limpar dados**: apaga todos os dados do usuário logado (não apaga a
  conta de login, nem os dados de outros usuários).

Guarde o backup em lugar seguro. Se limpar o cache do navegador sem backup,
os dados daquele usuário são perdidos.

## Observações importantes

- Pagamento/recebimento de uma conta (parcela) é sempre pelo **valor
  total** dela (sem pagamento parcial). Se quiser um valor diferente, ajuste
  juros/multa antes, ou parcele a conta em mais partes.
- Excluir uma conta bancária ou um cartão só é permitido se não houver
  movimentações vinculadas a eles.
- Nenhum dado sai da sua máquina: não há chamadas de rede, CDN, fontes
  externas ou telemetria.
