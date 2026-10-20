-- Fontes, assuntos e ligações iniciais do grafo. Edite à vontade; novas fontes podem ir em migrações seguintes.

insert into sources (name, type, address, default_category, language, is_official) values
  -- Tecnologia
  ('.NET Blog',                 'rss',        'https://devblogs.microsoft.com/dotnet/feed/',                             'tecnologia',   'en', true),
  ('Martin Fowler',             'rss',        'https://martinfowler.com/feed.atom',                                      'tecnologia',   'en', false),
  ('InfoQ',                     'rss',        'https://feed.infoq.com/',                                                 'tecnologia',   'en', false),
  ('Andrew Lock',               'rss',        'https://andrewlock.net/rss.xml',                                          'tecnologia',   'en', false),
  ('The Morning Brew',          'rss',        'https://blog.cwa.me.uk/feed/',                                            'tecnologia',   'en', false),
  ('Hacker News (front page)',  'hackernews', 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30',     'tecnologia',   'en', false),
  ('dev.to #csharp',            'devto',      'https://dev.to/api/articles?tag=csharp&top=2&per_page=15',                'tecnologia',   'en', false),
  ('dev.to #dotnet',            'devto',      'https://dev.to/api/articles?tag=dotnet&top=2&per_page=15',                'tecnologia',   'en', false),
  ('dev.to #architecture',      'devto',      'https://dev.to/api/articles?tag=architecture&top=2&per_page=15',          'tecnologia',   'en', false),
  ('r/dotnet',                  'reddit',     'r/dotnet',                                                                'tecnologia',   'en', false),
  ('r/csharp',                  'reddit',     'r/csharp',                                                                'tecnologia',   'en', false),
  ('r/softwarearchitecture',    'reddit',     'r/softwarearchitecture',                                                  'tecnologia',   'en', false),
  -- Curiosidades
  ('ScienceDaily',              'rss',        'https://www.sciencedaily.com/rss/top/science.xml',                        'curiosidades', 'en', false),
  ('NASA Image of the Day',     'rss',        'https://www.nasa.gov/feeds/iotd-feed/',                                   'curiosidades', 'en', false),
  ('Smithsonian Magazine',      'rss',        'https://www.smithsonianmag.com/rss/latest_articles/',                     'curiosidades', 'en', false),
  ('Open Culture',              'rss',        'https://www.openculture.com/feed',                                        'curiosidades', 'en', false),
  ('r/todayilearned',           'reddit',     'r/todayilearned',                                                         'curiosidades', 'en', false),
  -- Mundo
  ('BBC World',                 'rss',        'https://feeds.bbci.co.uk/news/world/rss.xml',                             'mundo',        'en', false),
  ('g1 Mundo',                  'rss',        'https://g1.globo.com/rss/g1/mundo/',                                      'mundo',        'pt', false);

insert into topics (slug, name, category, keywords) values
  ('csharp',          'C#',                    'tecnologia',   array['c#', 'csharp', 'roslyn', 'linq', 'source generator', 'source generators']),
  ('dotnet',          '.NET',                  'tecnologia',   array['.net', 'dotnet', 'asp.net', 'aspnet', 'blazor', 'ef core', 'entity framework', 'nuget', 'aspire', 'maui']),
  ('mensageria',      'Mensageria',            'tecnologia',   array['message broker', 'rabbitmq', 'kafka', 'queue', 'queues', 'pub/sub', 'pubsub', 'masstransit', 'nats', 'service bus', 'sqs', 'mensageria', 'fila', 'filas']),
  ('event-driven',    'Event-driven',          'tecnologia',   array['event-driven', 'event driven', 'event sourcing', 'cqrs', 'saga', 'outbox', 'domain events', 'eventos']),
  ('microsservicos',  'Microsserviços',        'tecnologia',   array['microservice', 'microservices', 'microsserviço', 'microsserviços', 'service mesh', 'api gateway', 'distributed system', 'distributed systems']),
  ('arquitetura',     'Arquitetura',           'tecnologia',   array['architecture', 'arquitetura', 'ddd', 'domain-driven', 'clean architecture', 'hexagonal', 'modular monolith', 'monolith', 'design pattern', 'design patterns', 'software design']),
  ('escalabilidade',  'Escalabilidade',        'tecnologia',   array['scalability', 'scaling', 'load balancer', 'load balancing', 'sharding', 'high availability', 'escalabilidade', 'throughput']),
  ('performance',     'Performance',           'tecnologia',   array['performance', 'benchmark', 'benchmarks', 'latency', 'allocation', 'allocations', 'garbage collector', 'memory leak', 'span<t>', 'simd']),
  ('banco-de-dados',  'Banco de dados',        'tecnologia',   array['database', 'databases', 'postgres', 'postgresql', 'sql server', 'sqlite', 'mongodb', 'redis', 'banco de dados', 'index', 'query plan']),
  ('cloud',           'Cloud',                 'tecnologia',   array['azure', 'aws', 'gcp', 'kubernetes', 'k8s', 'serverless', 'docker', 'container', 'containers', 'cloud native']),
  ('devops',          'DevOps',                'tecnologia',   array['devops', 'ci/cd', 'github actions', 'observability', 'opentelemetry', 'monitoring', 'terraform', 'deploy', 'deployment']),
  ('seguranca',       'Segurança',             'tecnologia',   array['security', 'vulnerability', 'cve', 'exploit', 'oauth', 'authentication', 'authorization', 'segurança', 'encryption', 'malware']),
  ('testes',          'Testes',                'tecnologia',   array['unit test', 'unit tests', 'unit testing', 'integration test', 'integration tests', 'tdd', 'xunit', 'testcontainers', 'testing']),
  ('ia',              'IA (como assunto)',     'tecnologia',   array['llm', 'llms', 'ai', 'artificial intelligence', 'machine learning', 'gpt', 'neural network', 'inteligência artificial']),
  ('linguagens',      'Linguagens',            'tecnologia',   array['rust', 'golang', 'go 1.', 'typescript', 'javascript', 'python', 'java', 'kotlin', 'compiler', 'programming language']),
  ('carreira',        'Carreira',              'tecnologia',   array['career', 'interview', 'hiring', 'junior', 'senior', 'staff engineer', 'carreira', 'layoffs']),
  ('open-source',     'Open source',           'tecnologia',   array['open source', 'open-source', 'github', 'license', 'maintainer', 'maintainers']),
  ('ciencia',         'Ciência',               'curiosidades', array['study', 'researchers', 'scientists', 'research', 'discovery', 'ciência', 'cientistas', 'pesquisa']),
  ('espaco',          'Espaço',                'curiosidades', array['nasa', 'space', 'mars', 'moon', 'galaxy', 'telescope', 'asteroid', 'planet', 'spacex', 'espaço']),
  ('historia',        'História',              'curiosidades', array['history', 'ancient', 'archaeologists', 'archaeology', 'century', 'história', 'medieval']),
  ('natureza',        'Natureza',              'curiosidades', array['species', 'animals', 'animal', 'ocean', 'forest', 'climate', 'dinosaur', 'natureza']),
  ('politica',        'Política',              'mundo',        array['election', 'elections', 'president', 'government', 'parliament', 'minister', 'eleição', 'presidente', 'governo']),
  ('economia',        'Economia',              'mundo',        array['economy', 'inflation', 'markets', 'tariff', 'tariffs', 'trade', 'economia', 'inflação', 'juros']),
  ('conflitos',       'Conflitos',             'mundo',        array['war', 'military', 'ceasefire', 'attack', 'troops', 'guerra', 'ataque', 'cessar-fogo']);

-- Semente do grafo (ligações manuais nunca são removidas automaticamente).
insert into topic_links (topic_a, topic_b, manual, manual_strength) values
  ('event-driven',   'mensageria',     true, 0.8),
  ('event-driven',   'microsservicos', true, 0.7),
  ('mensageria',     'microsservicos', true, 0.6),
  ('escalabilidade', 'mensageria',     true, 0.5),
  ('escalabilidade', 'microsservicos', true, 0.5),
  ('escalabilidade', 'performance',    true, 0.5),
  ('arquitetura',    'event-driven',   true, 0.6),
  ('arquitetura',    'microsservicos', true, 0.7),
  ('csharp',         'dotnet',         true, 0.9),
  ('dotnet',         'performance',    true, 0.5),
  ('cloud',          'devops',         true, 0.7),
  ('banco-de-dados', 'escalabilidade', true, 0.5),
  ('ciencia',        'espaco',         true, 0.6),
  ('ciencia',        'natureza',       true, 0.6),
  ('economia',       'politica',       true, 0.6);
