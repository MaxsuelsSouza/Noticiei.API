-- Adaptações: livros que vão virar filme ou série (módulo Adaptações do app).
--   * A rotina (cron "adaptacoes") busca no TMDB filmes e séries com a palavra-chave "baseado em livro" que ainda não
--     estrearam, liga cada um ao livro de origem (Wikidata → título + autor creditado → só título) e guarda sinais de
--     fama do livro (semanas na lista do NYT, leitores na Open Library). A nota é calculada na leitura.
--   * id da adaptação: "m<tmdb>" (filme) ou "t<tmdb>" (série).
--   * id do livro: chave da obra na Open Library ("OL123W") ou, sem ela, o item do Wikidata ("wd:Q123").
-- Nada é apagado: some da lista o que a coleta não vê há 7 dias, o que foi cancelado e o que você ocultou.

create table adaptacoes (
  id              text primary key check (id ~ '^[mt][0-9]+$'),
  tipo            text not null check (tipo in ('filme', 'serie')),
  tmdb_id         int  not null,
  titulo          text not null,
  titulo_original text,
  status_tmdb     text,
  fase            text not null check (fase in ('anunciado', 'producao', 'pos', 'com_data', 'lancado', 'cancelado')),
  estreia         date,
  estreia_br      date,
  popularidade    real not null default 0,
  capa            text,
  direcao         text,
  autor_creditado text,
  oculta          boolean not null default false,
  visto_em        timestamptz not null default now(),
  fase_mudou_em   timestamptz not null default now(),
  criado_em       timestamptz not null default now()
);

create table adaptacoes_livros (
  id          text primary key,
  ol_key      text,
  wikidata    text,
  titulo      text not null,
  autor       text,
  ano         int,
  leitores    int,
  nyt_semanas int,
  nyt_melhor  int,
  ol_em       timestamptz,
  nyt_em      timestamptz
);

-- Uma ligação por adaptação. origem: manual (você escolheu; a rotina não mexe), wikidata, titulo_autor, titulo
-- (só pelo título: "livro a confirmar") ou nenhum (não achou; tenta de novo depois de 7 dias).
create table adaptacoes_ligacoes (
  adaptacao_id  text primary key references adaptacoes(id),
  livro_id      text references adaptacoes_livros(id),
  origem        text not null check (origem in ('manual', 'wikidata', 'titulo_autor', 'titulo', 'nenhum')),
  atualizado_em timestamptz not null default now()
);

-- Histórico de fase: é dele que sai o "Pós-produção → Com data" do app.
create table adaptacoes_fases (
  id           bigserial primary key,
  adaptacao_id text not null references adaptacoes(id),
  fase         text not null,
  estreia      date,
  em           timestamptz not null default now()
);
create index adaptacoes_fases_adaptacao on adaptacoes_fases (adaptacao_id, em);
