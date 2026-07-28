# Razão — Gestão Financeira (100% offline)

Site local para gestão financeira: fornecedores, contas bancárias, contas a
pagar (com juros e multa), cartões de crédito e relatórios filtráveis.

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
├── index.html          → estrutura da página e das abas
├── css/style.css        → identidade visual (tema "livro-razão")
├── js/app.js            → todos os dados, cálculos e regras de negócio
└── README.md
```

Simples assim — pode abrir e editar tudo no VS Code sem processo de build,
sem `npm install`, sem dependências externas.

## O que já vem pronto (dados de exemplo)

Na primeira vez que abrir, o sistema cria 2 fornecedores, 1 conta bancária,
1 cartão de crédito e algumas contas a pagar de exemplo, só para você ver o
funcionamento. Pode editar ou excluir tudo livremente — é só um ponto de
partida.

## Abas e regras de negócio

### Fornecedores
Cadastro de quem você paga (produto, serviço ou ambos), com documento,
telefone, e-mail e observações. Um fornecedor só pode ser excluído se não
tiver nenhuma conta a pagar vinculada.

### Contas bancárias
Cadastre quantas contas quiser, com saldo inicial. Em cada conta você pode:
- **Movimentar**: lançar uma entrada ou saída manual (depósito, saque,
  transferência, etc.);
- **Pagar conta a pagar**: escolher uma dívida pendente e vincular o
  pagamento a essa conta — isso debita o valor total automaticamente e marca
  a conta a pagar como paga;
- Ver o extrato completo, com o saldo atual sempre recalculado.

Excluir uma movimentação vinculada a um pagamento reverte automaticamente a
conta a pagar (ou a baixa de cartão) para o estado pendente/aberto.

### Contas a pagar
Cada conta tem fornecedor, descrição, **valor original**, **juros** e
**multa** (opcionais) e datas de **emissão** e **vencimento**. Juros e multa
somam ao total automaticamente — o total é sempre `valor + juros + multa`,
mostrado ao vivo enquanto você digita.

Pagamento: escolha entre uma **conta bancária** (debita o valor total dessa
conta) ou um **cartão de crédito** (lança o valor como um débito na fatura
do cartão, para ser pago depois). Contas pagas podem ser **estornadas**,
voltando ao estado pendente e desfazendo o lançamento gerado.

### Cartões de crédito
Cadastre o cartão vinculando-o a uma conta bancária (necessário para dar
baixa depois). Lance compras/débitos avulsos ou receba lançamentos vindos de
contas a pagar quitadas no cartão. Em **Dar baixa**, escolha quais
lançamentos em aberto quer quitar agora — o sistema soma o total selecionado
e debita automaticamente da conta bancária vinculada.

### Relatórios
Filtros em cascata (fornecedor → cartão → status → período de vencimento)
para ir afunilando a análise. Mostra totais gerais, total de juros e multas,
total pendente no filtro, a lista detalhada e o resumo por fornecedor e por
cartão.

## Backup dos dados

Como tudo fica salvo no navegador, vale exportar de vez em quando:

- **Exportar dados** (barra lateral): baixa um arquivo `.json` com tudo.
- **Importar dados**: recarrega os dados a partir de um arquivo exportado
  (substitui totalmente os dados atuais — peça confirmação antes de usar).

Guarde esse arquivo em um lugar seguro. Se limpar o cache do navegador ou
trocar de computador sem esse backup, os dados são perdidos.

## Observações importantes

- O pagamento de uma conta a pagar é sempre pelo **valor total** (não há
  pagamento parcial). Se quiser um valor diferente, ajuste juros/multa antes
  de pagar.
- Excluir uma conta bancária ou um cartão só é permitido se não houver
  movimentações vinculadas a eles — isso evita perda de histórico por
  engano.
- Nenhum dado sai da sua máquina: não há chamadas de rede, CDN, fontes
  externas ou telemetria.
