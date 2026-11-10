# Razão Finance ARC

Gestor financeiro do ecossistema **ARC** (Análises Reais e Computacionais), da D&C.
Controla contas a pagar e a receber, contas bancárias, cartões de crédito e relatórios.
Feito para o computador, com adaptação para o celular.

- **Escopo e roteiro:** [docs/ESCOPO.md](docs/ESCOPO.md)
- **Histórico de versões:** [CHANGELOG.md](CHANGELOG.md)

## Tecnologias

React 19 + TypeScript + Vite, React Router, Supabase (login e banco de dados) e ícones lucide-react.

## Como rodar no computador

Precisa do [Node.js](https://nodejs.org) instalado.

1. Instale as dependências (só na primeira vez ou quando o `package.json` mudar):
   ```bash
   npm install
   ```
2. Crie o arquivo `.env.local` na raiz do projeto com os dados do Supabase
   (em Project Settings → API Keys):
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   Use só a chave **publishable**. Nunca coloque a chave `secret` / `service_role` no frontend.
3. Inicie o servidor:
   ```bash
   npm run dev
   ```
   e abra http://localhost:5173. Para parar, `Ctrl + C` no terminal.

## Outros comandos

| Comando | Para que serve |
|---|---|
| `npm run build` | gera a versão de produção na pasta `dist` |
| `npm run preview` | abre localmente a versão de produção gerada |
| `npm run lint` | procura problemas no código |

## Publicação (Vercel)

- Framework: **Vite** · Build: `npm run build` · Saída: `dist`
- Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
- O `vercel.json` faz as rotas internas (ex.: `/clientes`) funcionarem ao atualizar a página.

## Estrutura

```
src/
  components/   componentes genéricos
  contexts/     sessão do usuário (AuthContext)
  layouts/      menu lateral + barra superior
  pages/        uma pasta por tela
  routes/       rotas e proteção por login
  services/     acesso ao Supabase
  types/        tipos de dados
  utils/        funções auxiliares
```

## Versões

O projeto segue [SemVer](https://semver.org/lang/pt-BR/). A versão fica no `package.json` e aparece no rodapé do menu.
Cada entrega é registrada no [CHANGELOG.md](CHANGELOG.md).
