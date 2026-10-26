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
| `GET /api/reservas?mes=YYYY-MM` | `x-api-key` | Reservas do mês (agenda e widgets de agendamentos). |
| `PUT /api/reservas/{YYYY-MM-DD}` | `x-api-key` | Cria ou edita a reserva do dia (uma por dia): `{ nome, telefone, observacao?, pago? }`. |
| `DELETE /api/reservas/{YYYY-MM-DD}` | `x-api-key` | Libera o dia. |
| `GET /api/contas` | `x-api-key` | Contas em aberto e as pagas nos últimos 45 dias (lembrete de contas e widgets). |
| `POST /api/contas` | `x-api-key` | Nova conta: `{ nome, valorCentavos, vencimento, repeticao?: uma_vez\|mensal\|parcelas, parcelaAtual?, parcelasTotal?, codigo?, lembreteVespera?, lembreteDia?, lembreteInsistir? }`. |
| `PUT /api/contas/{id}` | `x-api-key` | Edita a conta (mesmo corpo). |
| `PATCH /api/contas/{id}` | `x-api-key` | `{ pago: true }` marca como paga e cria a próxima se for mensal/parcelada; `{ pago: false }` desfaz e apaga a próxima ainda em aberto. |
| `DELETE /api/contas/{id}` | `x-api-key` | Remove a conta. |
| `POST /api/checkin` | `x-api-key` | Pede o check-in no site da academia. Corpo `{ source?: app\|widget\|auto, dryRun? }`. Escolhe a aula pelo horário e registra a tentativa. `502` só em erro de verdade; sem aula, fora da regra ou já feito respondem `200` com `status: skipped`. |
| `GET /api/checkin[?limit=50]` | `x-api-key` | Histórico das tentativas (ok, duplicate, skipped, error), com a mensagem de erro e a etapa em que falhou. |
| `GET /api/trilha` | `x-api-key` | Personalização da trilha de estudos (anotações, links, ajustes de material, tópicos e cursos criados) no formato do app; `updatedAt: null` = nunca gravada. |
| `PUT /api/trilha` | `x-api-key` | Grava a personalização inteira (substitui a anterior), em tabelas `trilha_*` ([011](db/migrations/011_trilha_extras.sql)). |
| `GET /api/cron/daily` | `Authorization: Bearer CRON_SECRET` | Rotina diária (chamada pela Vercel). |
| `GET /api/health` | opcional | Sem chave: `{ok:true}`. Com chave: fontes ativas/desativadas e último digest. |

## Como funciona a rotina diária

1. **Coleta** (`src/collect`): busca as fontes ativas em paralelo (RSS/Atom, Hacker News, dev.to, Reddit e os
   "populares" de cada blog acompanhado).
   Feeds RSS respeitam o `robots.txt`; Reddit só pela API oficial e só se as credenciais estiverem configuradas.
   Itens com mais de 7 dias são ignorados (menos os populares, que valem pela pontuação). Duplicados (URL canônica ou
   título igual) são descartados pelo banco. Uma fonte com 5 falhas seguidas é desativada. Nas fontes do Aleatório,
   item de tecnologia é descartado já na coleta.
2. **Curadoria** (`src/curation`): assuntos por palavras-chave (título pesa 3, resumo 1, tags da fonte valem
   como título), formato por sinais no título, idioma por trigramas (`franc`). Assuntos que aparecem juntos
   reforçam a ligação no grafo (`topic_links`).
3. **Digest** (`src/digest`): pontuação = peso dos assuntos × 0,6 + peso do formato × 0,3 + engajamento × 0,1.
   Seções, nesta ordem ([010_secoes_noticias.sql](db/migrations/010_secoes_noticias.sql)):

   | Seção | Itens | O quê |
   |---|---|---|
   | Tecnologia | 4 | ferramentas, linguagens, formas de codar, estruturas de dados e arquiteturas novas (precisa ter assunto de tecnologia) |
   | HackerNews | 4 | CVEs, vulnerabilidades, ataques (DDoS, ransomware), pentest e correções |
   | Curiosidades | 3 | "como funciona" e ciência |
   | Mundo | 4 | tecnologias que estão mudando algo (IA, chips, energia, biotech, robótica) |
   | Para acompanhar | 1 por blog | blogs da Trilha: o post mais recente ainda não entregue; sem novidade, o mais popular do blog no Hacker News |
   | Aleatório | 4 | curiosidades do mundo sem tecnologia (Mental Floss, Smithsonian Smart News) |

   No máximo 2 itens por assunto e 2 da mesma fonte por seção, 1 vaga de exploração em tecnologia. Falta de item numa
   seção é completada com tecnologia (nunca com Para acompanhar ou Aleatório). Um item nunca entra em dois digests.

4. **Texto completo** (`src/extract`): baixa a página do artigo (respeitando o `robots.txt`) e extrai o texto principal
   com o Readability da Mozilla — regras sobre o HTML, sem IA e sem tradução: o texto fica no idioma original.
   **Só entra no digest item com texto extraído**: a montagem escolhe, extrai o texto dos escolhidos (10 em paralelo,
   até 90 s) e troca quem falhou (paywall, vídeo, bloqueio) pelo próximo candidato, em até 10 rodadas. O sorteio usa a
   data como semente, então de uma rodada para outra só muda o que falhou. O texto é apagado depois de 30 dias;
   título e link ficam.

Fontes, assuntos e ligações iniciais ficam em [db/migrations/002_seed.sql](db/migrations/002_seed.sql),
[005_digest_trilha.sql](db/migrations/005_digest_trilha.sql) e [010_secoes_noticias.sql](db/migrations/010_secoes_noticias.sql).
Fontes com `lock_category` nunca mudam de categoria pelo assunto (ex.: MIT Technology Review fica sempre em mundo).
Palavras-chave que começam com `re:` são expressões regulares (ex.: `how <algo> works`).
Para adicionar fontes, crie uma nova migração (`011_...sql`).

## Check-in na academia

`POST /api/checkin` faz o login no site da academia (Supabase Auth), lê as aulas do dia, escolhe a aula pelo horário
(de 30 min antes do início até o fim) e envia o pedido, que o professor valida depois. Cada tentativa vira uma linha em
`checkin_attempts` ([009](db/migrations/009_checkin_attempts.sql)).

- **Unidade:** `BORRACHA_UNIDADE` (padrão Espinheiro). Aula de outra unidade é ignorada: a confirmação "treino com outro
  professor" é do aluno e nunca é marcada por aqui.
- **`source=auto`** (geofence do app): só ter/qui/sex, 19h–21h, e no máximo um sucesso por dia.
- **Sem retry no envio:** repetir o pedido poderia duplicar; a falha fica no histórico para o app mostrar.
- Código em [src/checkin](src/checkin): `rules.ts` (regras puras), `run.ts` (fluxo), `borracha.ts` (site), `store.ts` (banco).

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
