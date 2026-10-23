# Noticiei.API

Backend do Noticiei: coleta conteúdo técnico de fontes abertas, classifica por regras (sem IA) e monta um
resumo diário balanceado que o app Android lê em voz alta às 05:30.

- **Runtime:** funções serverless da Vercel (Node 24, TypeScript)
- **Banco:** Postgres no Neon (driver `@neondatabase/serverless`)
- **Agendamento:** Vercel Cron, todo dia às 07:00 UTC (04:00 em Brasília)

## Rotas

| Rota | Auth | O que faz |
| --- | --- | --- |
| `GET /api/digest/today[?date=YYYY-MM-DD]` | `x-api-key` | Digest mais recente (ou da data). Lido pelo app e pelo widget. |
| `POST /api/digest/refresh[?force=1]` | `x-api-key` | Coleta agora e monta o digest do dia se não existir. `force=1` refaz o do dia. |
| `GET /api/content/{id}` | `x-api-key` | Texto completo do item em blocos (título, parágrafo, código), no idioma original. Extrai na hora se ainda não foi tentado. |
| `GET /api/cron/daily` | `Authorization: Bearer CRON_SECRET` | Rotina diária (chamada pela Vercel). |
| `GET /api/health` | opcional | Sem chave: `{ok:true}`. Com chave: fontes ativas/desativadas e último digest. |

## Como funciona a rotina diária

1. **Coleta** (`src/collect`): busca as fontes ativas em paralelo (RSS/Atom, Hacker News, dev.to, Reddit).
   Feeds RSS respeitam o `robots.txt`; Reddit só pela API oficial e só se as credenciais estiverem configuradas.
   Itens com mais de 7 dias são ignorados. Duplicados (URL canônica ou título igual) são descartados pelo banco.
   Uma fonte com 5 falhas seguidas é desativada.
2. **Curadoria** (`src/curation`): assuntos por palavras-chave (título pesa 3, resumo 1, tags da fonte valem
   como título), formato por sinais no título, idioma por trigramas (`franc`). Assuntos que aparecem juntos
   reforçam a ligação no grafo (`topic_links`).
3. **Digest** (`src/digest`): pontuação = peso dos assuntos × 0,6 + peso do formato × 0,3 + engajamento × 0,1;
   cotas 4 tecnologia / 4 curiosidades / 4 mundo / 1 aleatório (13 itens), no máximo 2 itens por assunto, 1 vaga de exploração.
   O foco de cada categoria vem dos pesos de interesse semeados em
   [005_digest_trilha.sql](db/migrations/005_digest_trilha.sql): tecnologia no estilo da trilha de estudos (fundamentos,
   clean code e patterns, APIs, DDD, system design), curiosidades com vulnerabilidades novas e "como funciona", e mundo com
   tecnologias que estão mudando algo (IA, chips, energia, biotech, robótica).
   Falta de item numa categoria é completada com tecnologia. Um item nunca entra em dois digests.

4. **Texto completo** (`src/extract`): para os itens do digest, baixa a página do artigo (respeitando o
   `robots.txt`) e extrai o texto principal com o Readability da Mozilla — regras sobre o HTML, sem IA e sem
   tradução: o texto fica no idioma original. Paywall, vídeo ou página curta ficam como `falhou` e o app
   mostra só o resumo e o link. O texto é apagado depois de 30 dias; título e link ficam.

Fontes, assuntos e ligações iniciais ficam em [db/migrations/002_seed.sql](db/migrations/002_seed.sql) e
[005_digest_trilha.sql](db/migrations/005_digest_trilha.sql). Fontes com `lock_category` nunca mudam de categoria pelo
assunto (ex.: MIT Technology Review fica sempre em mundo). Palavras-chave que começam com `re:` são expressões regulares
(ex.: `how <algo> works`).
Para adicionar fontes, crie uma nova migração (`003_...sql`).

## Desenvolvimento local

```bash
npm install
docker compose up -d                      # Postgres + proxy que imita o Neon
cp .env.example .env                      # e use a DATABASE_URL local abaixo
export DATABASE_URL=postgres://postgres:postgres@db.localtest.me:5432/noticiei
npm run db:migrate
npm run daily                             # coleta e monta o digest (npm run daily -- --force refaz)
npm test && npm run typecheck
```

## Deploy (uma vez)

1. **Neon:** crie um projeto (região `sa-east-1`) e copie a connection string *pooled*.
   Rode as migrações apontando para ela: `DATABASE_URL="<string do neon>" npm run db:migrate`.
2. **Vercel:** importe este repositório (framework: *Other*, root: raiz do repo) e cadastre as variáveis:
   - `DATABASE_URL` — string do Neon
   - `APP_API_KEY` — `openssl rand -hex 32` (a mesma vai para o app)
   - `CRON_SECRET` — `openssl rand -hex 32` (a Vercel usa automaticamente no cron)
   - `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` — opcionais, app do tipo *script* em https://www.reddit.com/prefs/apps
3. Depois do primeiro deploy, gere o primeiro digest sem esperar o cron:
   `curl -X POST -H "x-api-key: $APP_API_KEY" https://<seu-projeto>.vercel.app/api/digest/refresh`

> No plano Hobby o cron roda uma vez por dia e pode disparar em qualquer minuto dentro da hora marcada
> (04:00–04:59 em Brasília) — por isso ele está uma hora e meia antes das 05:30.
