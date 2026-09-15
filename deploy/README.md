# Puxada de Fábrica N&L — Guia de Migração e Instalação

Este pacote permite instalar o sistema no seu próprio servidor.

**Stack:** PostgreSQL + Node.js + React (Vite) — o banco é gerenciado pelo
**Supabase** (open source, auto-hospedável). O motivo é que o sistema usa o
Supabase para **autenticação** (login/senha), **API** (PostgREST) e **segurança
por linha** (RLS). Não é possível rodar só com "PostgreSQL puro + Node.js" sem
reescrever todo o controle de acesso.

---

## Componentes

| Item | Onde está | O que faz |
|---|---|---|
| **Schema do banco** | `deploy/schema.sql` | Todas as tabelas, visões, funções, triggers, políticas RLS e dados iniciais |
| **Funções de backend** | `supabase/functions/*` | `manage-users` e `process-import` (edge functions) |
| **Servidor Node.js (opcional)** | `deploy/server/` | Porta das mesmas funções para rodar como serviço Node |
| **Frontend** | raiz do projeto (`src/`) | React + Vite; gera os arquivos estáticos com `pnpm build` |
| **Robô SAP (opcional)** | gerado na tela Importação | Automação de extração do SAP |

---

## Opção A — Supabase auto-hospedado (recomendada)

A instalação mais completa e fiel ao sistema atual.

### 1. Pré-requisitos

- Docker + Docker Compose (para o Supabase)
- Node.js **20+** e **pnpm**
- Nginx (ou outro servidor web) para servir o frontend
- Domínio com SSL (recomendado)

### 2. Subir o Supabase

Use a CLI oficial (ou o Docker Compose do projeto supabase):

```bash
npx supabase init
npx supabase start          # sobe Postgres + API + Auth + Storage + Functions
```

Anote a URL (`http://localhost:54321` em dev) e as chaves **anon** e **service_role**.

### 3. Criar o banco

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -f deploy/schema.sql
```

Ou cole o conteúdo de `deploy/schema.sql` no editor SQL do painel do Supabase.

> O schema usa o schema `auth` do Supabase (usuários e sessões). Por isso o
> banco precisa ser o do Supabase, não um PostgreSQL "puro".

### 4. Configurar autenticação

- **Desativar cadastro público** (o cadastro é feito pelos administradores):
  em Auth → Providers, desative "Allow new users to sign up".
- **Auto-confirmar e-mail** (os usuários são criados pela administração).
- Crie o primeiro usuário administrador:

```bash
curl -X POST http://localhost:54321/auth/v1/signup \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com.br","password":"SenhaForte123"}'
```

Depois, pelo painel (ou pela SQL), promova-o a admin:

```sql
update public.profiles set role = 'admin'
where email = 'admin@empresa.com.br';
```

> O schema já insere o perfil de administrador quando a primeira conta é criada
> (trigger `handle_new_user`), mas é bom conferir.

### 5. Subir as funções de backend

```bash
npx supabase functions deploy manage-users
npx supabase functions deploy process-import
```

### 6. Build do frontend

Edite a URL/chave da sua instância em `src/integrations/supabase/client.ts`
(ou, melhor, coloque os valores em variáveis e aponte lá):

```ts
export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "SUA_CHAVE_ANON";
```

Compile e sirva como estático:

```bash
pnpm install
pnpm build
# dist/ -> aponte o Nginx para esta pasta (SPA: try_files ... /index.html)
```

### 7. Proxy reverso (produção)

Exemplo de Nginx:

```nginx
server {
  listen 443 ssl;
  server_name puxada.suaempresa.com.br;
  root /var/www/puxada/dist;
  location / { try_files $uri /index.html; }
  # Se usar o servidor Node: proxy para http://127.0.0.1:3001
}
```

---

## Opção B — PostgreSQL puro + Servidor Node.js

Útil se você prefere rodar as duas funções como um serviço Node próprio, em vez
de edge functions do Supabase. O frontend **continua precisando** de uma
instância Supabase para autenticação e RLS — o servidor Node só substitui as
funções de backend.

### 1. Banco

Carregue `deploy/schema.sql` (mesmo passo 3 da Opção A — ainda precisa do
Supabase para `auth` e RLS).

### 2. Servidor Node

```bash
cd deploy/server
cp .env.example .env
# preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
pnpm install        # ou npm install
pnpm start          # sobe em http://localhost:3001
```

Rotas disponíveis (iguais às edge functions):

- `POST /process-import` — importação COOISPI / Recebimento / MON (JWT ou `x-api-key`)
- `POST /manage-users` — administração de usuários (JWT de admin)

### 3. Apontar o frontend para o servidor Node

As chamadas `supabase.functions.invoke(...)` do frontend podem ser trocadas por
`fetch` para o seu servidor. Em `src/lib/queries.ts` e nas páginas que chamam
`functions.invoke`, substitua:

```ts
// antes
supabase.functions.invoke("process-import", { body })
// depois
fetch("https://API.SEU-DOMINIO/process-import", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessao },
  body: JSON.stringify(body),
})
```

---

## Migração de dados (do ambiente atual)

Para levar os dados já existentes (ordens, recebimentos, tarefas, usuários):

```bash
# no servidor antigo (banco do Supabase/Enter Cloud)
pg_dump "postgresql://.../postgres" --data-only --exclude-table=audit_logs -f dados.sql

# no novo
psql "postgresql://.../postgres" -f deploy/schema.sql
psql "postgresql://.../postgres" -f dados.sql
```

Dica: o dump de dados precisa ignorar `auth.users` e `profiles` (esses vêm do
Supabase Auth) — recrie os usuários pela tela de Usuários após instalar, ou
importe `auth.users` junto com o `profiles` (veja a documentação do Supabase).

---

## Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `SUPABASE_URL` | servidor Node / frontend | URL da instância |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor Node (só servidor!) | Chave de serviço — **nunca** no frontend |
| `SUPABASE_PUBLISHABLE_KEY` | frontend | Chave anon |
| `PORT` | servidor Node | Porta do serviço (padrão 3001) |

---

## Checklist final

- [ ] Supabase rodando e `deploy/schema.sql` aplicado (sem erros)
- [ ] Cadastro público desativado; primeiro admin criado
- [ ] Edge functions (ou servidor Node) no ar
- [ ] Frontend compilado e servido; `SUPABASE_URL` apontando para a nova instância
- [ ] Login, importação manual e automação SAP testados
- [ ] (Opcional) Robô SAP configurado no PC da operação
