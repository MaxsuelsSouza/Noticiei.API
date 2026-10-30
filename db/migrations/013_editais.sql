-- Módulo de editais: concursos de TI (e polícia/inteligência) com salário >= R$ 6 mil, peso para PE e vizinhos.
-- A unidade é o CONCURSO (órgão + ciclo); as matérias que falam dele ficam em concurso_fontes e o resumo é
-- recalculado a partir delas (assim uma regra melhorada vale para tudo que já foi coletado).

-- Páginas de listagem dos sites de concurso (os testados não têm RSS útil).
create table edital_sites (
  id                   serial primary key,
  nome                 text not null,
  tipo                 text not null default 'pagina' check (tipo in ('pagina', 'rss')),
  endereco             text not null unique,
  -- Regex sobre o caminho dos links que são matérias (opcional).
  padrao_link          text,
  ativo                boolean not null default true,
  ultima_coleta        timestamptz,
  falhas_seguidas      int not null default 0,
  ultimo_erro          text
);

create table concursos (
  id                   bigserial primary key,
  orgao_chave          text not null,
  -- Um órgão pode ter um concurso novo anos depois do anterior: cada um é um ciclo.
  ciclo                int not null default 1,
  orgao_nome           text not null,
  uf                   text,                      -- 'BR' = nacional
  esfera               text check (esfera in ('federal', 'estadual', 'municipal')),
  orgao_area           text check (orgao_area in ('ti', 'policia', 'fora')),
  orgao_origem         text not null check (orgao_origem in ('dicionario', 'padrao')),
  fase                 text not null default 'rumor'
                       check (fase in ('rumor', 'autorizado', 'comissao', 'banca', 'edital', 'inscricoes', 'andamento', 'encerrado')),
  -- Resultado da avaliação (src/editais/avaliar.ts).
  visivel              boolean not null default false,
  motivo_oculto        text,
  area                 text check (area in ('ti', 'policia_ti', 'policia')),
  situacao_salario     text check (situacao_salario in ('ok', 'so_final', 'desconhecido')),
  salario_inicial_centavos int,
  salario_final_centavos   int,
  peso                 real not null default 0,
  inscricoes_ate       date,
  prova_em             date,
  -- Resumo completo (banca, vagas, etapas, cidades de prova, editais...).
  resumo               jsonb not null,
  favorito             boolean not null default false,
  favoritado_em        timestamptz,
  primeira_vez         timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  -- Última mudança relevante (fase, prazo, banca, edital): é o que entra em "hoje".
  mudou_em             timestamptz not null default now(),
  unique (orgao_chave, ciclo)
);

create index concursos_lista_idx on concursos (visivel, peso desc);

create table concurso_fontes (
  id                   bigserial primary key,
  concurso_id          bigint not null references concursos (id) on delete cascade,
  url                  text not null,
  url_canonica         text not null unique,
  titulo               text not null,
  site                 text not null,
  publicado_em         timestamptz,
  coletado_em          timestamptz not null default now(),
  extracao             jsonb not null
);

create index concurso_fontes_concurso_idx on concurso_fontes (concurso_id, publicado_em);

-- Matérias abertas que não viraram concurso (panorama, órgão não reconhecido): não abre de novo.
create table edital_urls_vistas (
  url_canonica         text primary key,
  motivo               text not null,
  visto_em             timestamptz not null default now()
);

create table concurso_eventos (
  id                   bigserial primary key,
  concurso_id          bigint not null references concursos (id) on delete cascade,
  tipo                 text not null check (tipo in ('novo', 'fase', 'banca', 'inscricoes', 'prova', 'edital')),
  descricao            text not null,
  em                   timestamptz not null default now()
);

create index concurso_eventos_em_idx on concurso_eventos (em desc);

insert into edital_sites (nome, endereco, padrao_link) values
  ('PCI Concursos · Nordeste', 'https://www.pciconcursos.com.br/concursos/nordeste/', '^/noticias/'),
  ('PCI Concursos · Nacional', 'https://www.pciconcursos.com.br/concursos/nacional/', '^/noticias/'),
  ('Gran · Pernambuco',        'https://blog.grancursosonline.com.br/concursos/nordeste/pernambuco/', '^/[a-z0-9-]+/?$'),
  ('Gran · Paraíba',           'https://blog.grancursosonline.com.br/concursos/nordeste/paraiba/', '^/[a-z0-9-]+/?$'),
  ('Gran · Alagoas',           'https://blog.grancursosonline.com.br/concursos/nordeste/alagoas/', '^/[a-z0-9-]+/?$'),
  ('Gran · Rio Grande do Norte','https://blog.grancursosonline.com.br/concursos/nordeste/rio-grande-do-norte/', '^/[a-z0-9-]+/?$'),
  ('Gran · Bahia',             'https://blog.grancursosonline.com.br/concursos/nordeste/bahia/', '^/[a-z0-9-]+/?$'),
  ('Gran · Últimas notícias',  'https://blog.grancursosonline.com.br/ultimas-noticias/', '^/[a-z0-9-]+/?$')
on conflict (endereco) do nothing;
