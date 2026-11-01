-- Concursos de todo o país: listagens do PCI das regiões que faltavam e do Gran por estado.
-- A coleta não descarta mais por área nem por salário (quem filtra é o app); o que cada concurso é
-- (área, salário, escolaridade) vira atributo no /api/editais/sync.
-- Endereço que não existir falha 5 vezes seguidas e é desativado sozinho (collect.ts, MAX_FALHAS).
insert into edital_sites (nome, endereco, padrao_link) values
  ('PCI Concursos · Norte',        'https://www.pciconcursos.com.br/concursos/norte/', '^/noticias/'),
  ('PCI Concursos · Centro-Oeste', 'https://www.pciconcursos.com.br/concursos/centrooeste/', '^/noticias/'),
  ('PCI Concursos · Sudeste',      'https://www.pciconcursos.com.br/concursos/sudeste/', '^/noticias/'),
  ('PCI Concursos · Sul',          'https://www.pciconcursos.com.br/concursos/sul/', '^/noticias/'),
  ('Gran · Ceará',                 'https://blog.grancursosonline.com.br/concursos/nordeste/ceara/', '^/[a-z0-9-]+/?$'),
  ('Gran · Sergipe',               'https://blog.grancursosonline.com.br/concursos/nordeste/sergipe/', '^/[a-z0-9-]+/?$'),
  ('Gran · Piauí',                 'https://blog.grancursosonline.com.br/concursos/nordeste/piaui/', '^/[a-z0-9-]+/?$'),
  ('Gran · Maranhão',              'https://blog.grancursosonline.com.br/concursos/nordeste/maranhao/', '^/[a-z0-9-]+/?$'),
  ('Gran · Amazonas',              'https://blog.grancursosonline.com.br/concursos/norte/amazonas/', '^/[a-z0-9-]+/?$'),
  ('Gran · Pará',                  'https://blog.grancursosonline.com.br/concursos/norte/para/', '^/[a-z0-9-]+/?$'),
  ('Gran · Acre',                  'https://blog.grancursosonline.com.br/concursos/norte/acre/', '^/[a-z0-9-]+/?$'),
  ('Gran · Amapá',                 'https://blog.grancursosonline.com.br/concursos/norte/amapa/', '^/[a-z0-9-]+/?$'),
  ('Gran · Rondônia',              'https://blog.grancursosonline.com.br/concursos/norte/rondonia/', '^/[a-z0-9-]+/?$'),
  ('Gran · Roraima',               'https://blog.grancursosonline.com.br/concursos/norte/roraima/', '^/[a-z0-9-]+/?$'),
  ('Gran · Tocantins',             'https://blog.grancursosonline.com.br/concursos/norte/tocantins/', '^/[a-z0-9-]+/?$'),
  ('Gran · Distrito Federal',      'https://blog.grancursosonline.com.br/concursos/centro-oeste/distrito-federal/', '^/[a-z0-9-]+/?$'),
  ('Gran · Goiás',                 'https://blog.grancursosonline.com.br/concursos/centro-oeste/goias/', '^/[a-z0-9-]+/?$'),
  ('Gran · Mato Grosso',           'https://blog.grancursosonline.com.br/concursos/centro-oeste/mato-grosso/', '^/[a-z0-9-]+/?$'),
  ('Gran · Mato Grosso do Sul',    'https://blog.grancursosonline.com.br/concursos/centro-oeste/mato-grosso-do-sul/', '^/[a-z0-9-]+/?$'),
  ('Gran · São Paulo',             'https://blog.grancursosonline.com.br/concursos/sudeste/sao-paulo/', '^/[a-z0-9-]+/?$'),
  ('Gran · Rio de Janeiro',        'https://blog.grancursosonline.com.br/concursos/sudeste/rio-de-janeiro/', '^/[a-z0-9-]+/?$'),
  ('Gran · Minas Gerais',          'https://blog.grancursosonline.com.br/concursos/sudeste/minas-gerais/', '^/[a-z0-9-]+/?$'),
  ('Gran · Espírito Santo',        'https://blog.grancursosonline.com.br/concursos/sudeste/espirito-santo/', '^/[a-z0-9-]+/?$'),
  ('Gran · Paraná',                'https://blog.grancursosonline.com.br/concursos/sul/parana/', '^/[a-z0-9-]+/?$'),
  ('Gran · Santa Catarina',        'https://blog.grancursosonline.com.br/concursos/sul/santa-catarina/', '^/[a-z0-9-]+/?$'),
  ('Gran · Rio Grande do Sul',     'https://blog.grancursosonline.com.br/concursos/sul/rio-grande-do-sul/', '^/[a-z0-9-]+/?$')
on conflict (endereco) do nothing;

-- Concurso encerrado sai da sincronização do app pela data da mudança: índice para o ?desde=.
create index if not exists concursos_mudou_em_idx on concursos (mudou_em);
