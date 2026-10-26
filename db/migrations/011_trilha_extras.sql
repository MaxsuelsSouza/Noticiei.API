-- Trilha de estudos: o que o usuário personaliza (antes só no aparelho, em AsyncStorage "trilha:extras").
-- O conteúdo fixo da trilha continua no app (src/trilha/data.ts). As chaves seguem as do app:
--   "dia:índice" (tópico ou material que já vem na trilha), "dia:tN" (tópico criado), "dia:mN" (curso criado).
-- O app grava o conjunto inteiro de uma vez (PUT /api/trilha), então cada tabela é substituída numa transação.

-- Anotação de um tópico/subtópico.
create table trilha_anotacoes (
  chave text primary key check (length(chave) <= 40),
  nota  text not null check (length(nota) between 1 and 10000)
);

-- Links que o usuário adicionou a um tópico/subtópico.
create table trilha_links (
  chave  text not null check (length(chave) <= 40),
  ordem  int  not null,
  titulo text check (length(titulo) <= 300),
  url    text not null check (length(url) <= 2000),
  primary key (chave, ordem)
);

-- Ajuste de título/link de um material que já vem na trilha.
create table trilha_material_ajustes (
  chave  text primary key check (length(chave) <= 40),
  titulo text check (length(titulo) <= 300),
  url    text not null check (length(url) <= 2000)
);

-- Subcursos de um material (da trilha ou criado).
create table trilha_subcursos (
  chave  text not null check (length(chave) <= 40),
  ordem  int  not null,
  titulo text check (length(titulo) <= 300),
  url    text not null check (length(url) <= 2000),
  primary key (chave, ordem)
);

-- Tópicos e subtópicos criados num dia (o id vem do app e é estável).
create table trilha_topicos (
  id    int primary key,
  dia   int not null check (dia between 1 and 366),
  ordem int not null,
  nome  text not null check (length(nome) between 1 and 300),
  nivel int not null check (nivel in (1, 2))
);

-- Cursos (materiais) criados num dia.
create table trilha_cursos (
  id     int primary key,
  dia    int not null check (dia between 1 and 366),
  ordem  int not null,
  titulo text not null check (length(titulo) between 1 and 300),
  url    text not null check (length(url) <= 2000)
);

-- Quando o conjunto foi gravado pela última vez (uma linha só).
create table trilha_sync (
  id         int primary key default 1 check (id = 1),
  next_id    int not null,
  updated_at timestamptz not null default now()
);
