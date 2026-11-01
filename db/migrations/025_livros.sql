-- Livros: ponte entre o celular (módulo Livros do app) e o LivreQ (editor de livros no computador).
--   * O LivreQ publica o catálogo (grupos e livros) com PUT /api/livros/catalogo.
--     O id é o syncId gravado pelo LivreQ em <Livro>.livreq.json / grupo.json: não muda se o livro for renomeado
--     ou movido (o caminho do .msk muda).
--   * O celular escreve textos e lança ideias. O id (uuid) nasce no celular, então salvar duas vezes ou mandar
--     depois de ficar sem rede não duplica.
--   * O LivreQ só lê os textos e marca "já usei" (usado_em); as ideias ele grava no ideias.json e marca importada_em.
-- Nada é apagado de verdade: removido_em (sumiu do computador) e apagado_em (apagado no celular, com Desfazer).

create table livros_grupos (
  id          text primary key check (length(id) between 8 and 40),
  nome        text not null check (length(nome) between 1 and 200),
  removido_em timestamptz
);

create table livros (
  id                text primary key check (length(id) between 8 and 40),
  grupo_id          text references livros_grupos(id),
  titulo            text not null check (length(titulo) between 1 and 300),
  subtitulo         text check (length(subtitulo) <= 300),
  volume            int,
  palavras          int not null default 0 check (palavras >= 0),
  capitulos         int not null default 0 check (capitulos >= 0),
  ultima_escrita_em timestamptz,
  removido_em       timestamptz,
  atualizado_em     timestamptz not null default now()
);

create table livros_textos (
  id            uuid primary key,
  livro_id      text not null references livros(id),
  titulo        text check (length(titulo) <= 300),
  texto         text not null default '' check (length(texto) <= 200000),
  palavras      int  not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  usado_em      timestamptz,
  apagado_em    timestamptz
);
create index livros_textos_livro on livros_textos (livro_id) where apagado_em is null;

create table livros_ideias (
  id           uuid primary key,
  grupo_id     text references livros_grupos(id),
  titulo       text check (length(titulo) <= 300),
  texto        text not null check (length(texto) between 1 and 20000),
  criado_em    timestamptz not null default now(),
  importada_em timestamptz,
  apagado_em   timestamptz
);

-- Quando o LivreQ mandou o catálogo pela última vez (linha única).
create table livros_sync (
  id            int primary key default 1 check (id = 1),
  catalogo_em   timestamptz not null default now()
);
