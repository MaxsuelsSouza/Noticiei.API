-- Esquema inicial: fontes, assuntos, grafo, conteúdo, perfil de interesse e digest.

create table sources (
  id                     serial primary key,
  name                   text not null,
  type                   text not null check (type in ('rss', 'reddit', 'devto', 'hackernews')),
  address                text not null unique,
  default_category       text not null check (default_category in ('tecnologia', 'curiosidades', 'mundo', 'aleatorio')),
  language               text not null default 'en',
  is_official            boolean not null default false,
  active                 boolean not null default true,
  collect_interval_hours int not null default 24,
  last_collected_at      timestamptz,
  consecutive_failures   int not null default 0,
  last_error             text,
  created_at             timestamptz not null default now()
);

create table topics (
  slug     text primary key,
  name     text not null,
  category text not null check (category in ('tecnologia', 'curiosidades', 'mundo')),
  keywords text[] not null
);

-- Ligações do grafo de assuntos. O par é sempre gravado em ordem alfabética (topic_a < topic_b).
create table topic_links (
  topic_a        text not null references topics (slug) on delete cascade,
  topic_b        text not null references topics (slug) on delete cascade,
  manual         boolean not null default false,
  manual_strength real not null default 0,
  cooccurrences  int not null default 0,
  primary key (topic_a, topic_b),
  check (topic_a < topic_b)
);

create table contents (
  id               bigserial primary key,
  source_id        int not null references sources (id) on delete cascade,
  url              text not null,
  url_canonical    text not null unique,
  title            text not null,
  title_hash       text not null unique,
  summary          text,
  language         text not null,
  published_at     timestamptz,
  engagement       int not null default 0,
  category         text not null check (category in ('tecnologia', 'curiosidades', 'mundo', 'aleatorio')),
  topics           text[] not null default '{}',
  format           text not null,
  status           text not null default 'classificado'
                   check (status in ('novo', 'classificado', 'entregue', 'descartado')),
  collected_at     timestamptz not null default now()
);

create index contents_status_collected_idx on contents (status, collected_at desc);

create table interest_weights (
  kind                text not null check (kind in ('topic', 'format')),
  key                 text not null,
  weight              real not null check (weight between 0 and 1),
  last_interaction_at timestamptz,
  primary key (kind, key)
);

create table digests (
  id          serial primary key,
  digest_date date not null unique,
  created_at  timestamptz not null default now()
);

create table digest_items (
  digest_id      int not null references digests (id) on delete cascade,
  content_id     bigint not null unique references contents (id) on delete cascade,
  position       int not null,
  slot           text not null check (slot in ('tecnologia', 'curiosidades', 'mundo', 'aleatorio')),
  is_exploration boolean not null default false,
  primary key (digest_id, position)
);
