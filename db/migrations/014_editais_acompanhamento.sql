-- Editais, fases 2 e 3: PDF do edital, acompanhamento dos favoritos, edital anterior e "em alta".

alter table concursos
  add column interesse          boolean not null default false,
  -- Busca do edital anterior ("tenho interesse" ou favoritar um rumor).
  add column busca_anterior     text check (busca_anterior in ('pendente', 'encontrado', 'nao_encontrado')),
  add column busca_anterior_em  timestamptz,
  add column busca_anterior_erro text,
  -- Última vez que o acompanhamento diário olhou este concurso.
  add column acompanhado_em     timestamptz,
  -- Até que data o Diário Oficial (Querido Diário) já foi lido para este concurso.
  add column diario_visto_ate   date;

-- PDFs do edital: o atual, as retificações e o anterior (referência para estudar antes de sair o novo).
create table concurso_editais (
  id           bigserial primary key,
  concurso_id  bigint not null references concursos (id) on delete cascade,
  url          text not null,
  tipo         text not null check (tipo in ('atual', 'retificacao', 'anterior')),
  status       text not null default 'pendente' check (status in ('pendente', 'ok', 'falhou', 'sem_texto')),
  tentativas   int not null default 0,
  erro         text,
  paginas      int,
  baixado_em   timestamptz,
  extracao     jsonb,
  criado_em    timestamptz not null default now(),
  unique (concurso_id, url)
);

create index concurso_editais_pendentes_idx on concurso_editais (status) where status = 'pendente';

-- Cada matéria que aparece numa listagem, com o órgão do título: é o termômetro do "em alta" (inclui o que o filtro esconde).
create table edital_mencoes (
  url_canonica text primary key,
  orgao_chave  text not null,
  orgao_nome   text not null,
  uf           text,
  site         text not null,
  titulo       text not null,
  visto_em     timestamptz not null default now()
);

create index edital_mencoes_uf_idx on edital_mencoes (uf, visto_em desc);

-- Menções fora dos sites de concurso (Reddit), medidas por dia.
create table concurso_mencoes (
  orgao_chave  text not null,
  fonte        text not null,
  medido_em    date not null,
  quantidade   int not null,
  primary key (orgao_chave, fonte, medido_em)
);

alter table concurso_eventos drop constraint concurso_eventos_tipo_check;
alter table concurso_eventos add constraint concurso_eventos_tipo_check
  check (tipo in ('novo', 'fase', 'banca', 'inscricoes', 'prova', 'edital', 'lembrete', 'diario', 'anterior'));
