-- Digest mais alinhado com a trilha de estudos (Miro "Guia de estudo" › "Estudos"):
--   tecnologia  → assuntos da trilha (fundamentos, clean code/patterns, APIs, DDD, system design…);
--   curiosidades → vulnerabilidades novas e "como funciona" alguma tecnologia;
--   mundo        → tecnologias que estão mudando alguma coisa (IA, chips, energia, biotech, robótica).
-- As cotas (4/4/4/1) ficam em src/digest/select.ts.

-- 1) Trava de categoria por fonte: itens destas fontes nunca mudam de categoria pelo assunto.
alter table sources add column lock_category boolean not null default false;

-- 2) Fontes novas (address é único: rodar de novo não duplica).
insert into sources (name, type, address, default_category, language, is_official, lock_category) values
  -- Tecnologia, no estilo da trilha
  ('ByteByteGo',               'rss',   'https://blog.bytebytego.com/feed',                                'tecnologia',   'en', false, false),
  ('Netflix TechBlog',         'rss',   'https://netflixtechblog.com/feed',                                'tecnologia',   'en', false, false),
  ('dev.to #systemdesign',     'devto', 'https://dev.to/api/articles?tag=systemdesign&top=2&per_page=15',  'tecnologia',   'en', false, false),
  ('dev.to #cleancode',        'devto', 'https://dev.to/api/articles?tag=cleancode&top=2&per_page=15',     'tecnologia',   'en', false, false),
  ('dev.to #designpatterns',   'devto', 'https://dev.to/api/articles?tag=designpatterns&top=2&per_page=15','tecnologia',   'en', false, false),
  -- Curiosidades: vulnerabilidades e "como funciona"
  ('The Hacker News',          'rss',   'https://feeds.feedburner.com/TheHackersNews',                     'curiosidades', 'en', false, true),
  ('BleepingComputer',         'rss',   'https://www.bleepingcomputer.com/feed/',                          'curiosidades', 'en', false, true),
  ('Cloudflare Blog',          'rss',   'https://blog.cloudflare.com/rss/',                                'curiosidades', 'en', false, false),
  -- Mundo: tecnologia mudando o mundo
  ('MIT Technology Review',    'rss',   'https://www.technologyreview.com/feed/',                          'mundo',        'en', false, true),
  ('BBC Technology',           'rss',   'https://feeds.bbci.co.uk/news/technology/rss.xml',                'mundo',        'en', false, true),
  ('g1 Tecnologia',            'rss',   'https://g1.globo.com/rss/g1/tecnologia/',                         'mundo',        'pt', false, true)
on conflict (address) do nothing;

-- 3) Segurança "de engenharia" (auth, criptografia) continua em tecnologia; vulnerabilidade e ataque vão para curiosidades.
update topics
set keywords = array['oauth', 'authentication', 'authorization', 'autenticação', 'autorização', 'encryption', 'criptografia',
                     'jwt', 'cors', 'owasp', 'secure coding', 'zero trust', 'tls', 'https']
where slug = 'seguranca';

-- 4) Assuntos novos.
insert into topics (slug, name, category, keywords) values
  -- Tecnologia (trilha)
  ('clean-code',    'Clean code e design',      'tecnologia', array['clean code', 'cleancode', 'designpatterns', 'meaningful names', 'naming', 'refactoring', 'refactor', 'refatoração', 'code smell', 'code smells',
                                                                     'solid principles', 'princípios solid', 'design pattern', 'design patterns', 'padrões de projeto',
                                                                     'object calisthenics', 'technical debt', 'tech debt', 'débito técnico', 'yagni',
                                                                     'code review', 'legacy code', 'código legado', 'cohesion', 'coupling', 'acoplamento']),
  ('system-design', 'System design',            'tecnologia', array['system design', 'systemdesign', 'distributed system', 'distributed systems', 'sistemas distribuídos',
                                                                     'cap theorem', 'teorema cap', 'eventual consistency', 'consistency', 'replication', 'replicação',
                                                                     'consensus', 'raft', 'idempotency', 'idempotência', 'rate limiting', 'rate limiter',
                                                                     'caching', 'cache', 'sharding', 'partitioning', 'failover', 'redundancy', 'capacity planning']),
  ('fundamentos',   'Fundamentos da computação','tecnologia', array['operating system', 'operating systems', 'sistema operacional', 'linux kernel', 'kernel',
                                                                     'virtual memory', 'memory management', 'scheduler', 'file system', 'filesystem',
                                                                     'cpu', 'tcp', 'tcp/ip', 'udp', 'dns', 'http/2', 'http/3', 'networking', 'redes',
                                                                     'algorithm', 'algorithms', 'algoritmos', 'data structure', 'data structures',
                                                                     'estruturas de dados', 'concurrency', 'concorrência', 'multithreading', 'compiler', 'compilers']),
  ('apis',          'APIs e integrações',       'tecnologia', array['api design', 'rest api', 'rest apis', 'restful', 'graphql', 'grpc', 'webhook', 'webhooks',
                                                                     'openapi', 'swagger', 'api versioning', 'pagination', 'api gateway', 'hateoas']),
  ('ddd',           'Domain-Driven Design',     'tecnologia', array['ddd', 'domain-driven', 'domain driven design', 'bounded context', 'bounded contexts',
                                                                     'aggregate root', 'value object', 'ubiquitous language', 'linguagem ubíqua',
                                                                     'event storming', 'eventstorming', 'context map']),
  -- Curiosidades
  ('vulnerabilidades', 'Vulnerabilidades e ataques', 'curiosidades', array['vulnerability', 'vulnerabilities', 'vulnerabilidade', 'vulnerabilidades', 'cve',
                                                                     're:cve-\d{4}-\d+', 'zero-day', 'zero day', '0-day', 'exploit', 'exploited', 'exploits',
                                                                     'rce', 'remote code execution', 'ransomware', 'malware', 'spyware', 'infostealer',
                                                                     'info-stealer', 'data breach', 'breach', 'vazamento', 'backdoor', 'supply chain attack',
                                                                     'phishing', 'flaw', 'flaws', 'falha de segurança', 'hacked', 'hackers', 'botnet', 'ddos']),
  ('como-funciona', 'Como funciona',            'curiosidades', array['re:how (?:the |a |an )?[\p{L}\p{N} .#+/''-]{2,40}? works?', 'how it works',
                                                                     'how does', 'under the hood', 'explained', 'explainer', 'internals', 'deep dive',
                                                                     'behind the scenes', 'anatomy of', 'teardown', 'reverse engineering', 'reverse-engineering',
                                                                     'como funciona', 'por dentro', 'entenda como']),
  -- Mundo: tecnologias mudando algo
  ('ia-sociedade',  'IA na sociedade',          'mundo', array['ai regulation', 'ai act', 'artificial intelligence', 'inteligência artificial', 'generative ai',
                                                                'ia generativa', 'chatbot', 'chatbots', 'ai agents', 'agentes de ia', 'deepfake', 'deepfakes',
                                                                'openai', 'anthropic', 'deepmind', 'ai models', 'ai model']),
  ('chips-hardware','Chips e computação',       'mundo', array['chip', 'chips', 'semiconductor', 'semiconductors', 'semicondutores', 'tsmc', 'nvidia', 'gpu', 'gpus',
                                                                'quantum computer', 'quantum computing', 'computação quântica', 'quantum', 'data center',
                                                                'data centers', 'datacenter', 'datacenters', 'supercomputer']),
  ('energia-tech',  'Energia e clima (tecnologia)', 'mundo', array['battery', 'batteries', 'bateria', 'baterias', 'electric vehicle', 'electric vehicles',
                                                                'carro elétrico', 'carros elétricos', 'solar', 'fusion', 'fusão nuclear', 'nuclear', 'hydrogen',
                                                                'hidrogênio', 'power grid', 'renewable', 'renewables', 'renováveis', 'carbon capture']),
  ('biotech',       'Biotecnologia',            'mundo', array['crispr', 'gene therapy', 'gene editing', 'terapia gênica', 'biotech', 'biotechnology',
                                                                'biotecnologia', 'mrna', 'brain implant', 'brain-computer interface', 'neuralink',
                                                                'drug discovery', 'longevity']),
  ('robotica',      'Robótica e autônomos',     'mundo', array['robot', 'robots', 'robô', 'robôs', 'humanoid', 'humanoids', 'humanoide', 'self-driving',
                                                                'autonomous vehicle', 'autonomous vehicles', 'robotaxi', 'robotaxis', 'carro autônomo',
                                                                'drone', 'drones', 'robotics', 'robótica'])
on conflict (slug) do nothing;

-- 5) Ligações do grafo entre os assuntos novos e os que já existiam.
insert into topic_links (topic_a, topic_b, manual, manual_strength) values
  ('arquitetura',   'clean-code',      true, 0.7),
  ('arquitetura',   'ddd',             true, 0.8),
  ('arquitetura',   'system-design',   true, 0.7),
  ('escalabilidade','system-design',   true, 0.8),
  ('microsservicos','system-design',   true, 0.6),
  ('clean-code',    'testes',          true, 0.6),
  ('apis',          'microsservicos',  true, 0.5),
  ('banco-de-dados','system-design',   true, 0.6),
  ('fundamentos',   'performance',     true, 0.5),
  ('como-funciona', 'vulnerabilidades',true, 0.4),
  ('chips-hardware','ia-sociedade',    true, 0.6),
  ('energia-tech',  'robotica',        true, 0.4)
on conflict do nothing;

-- 6) Pesos de interesse: a pontuação do digest é 60% peso do assunto + 30% peso do formato + 10% engajamento.
--    Só preenche/atualiza o que ainda não teve interação registrada (last_interaction_at nulo).
insert into interest_weights (kind, key, weight) values
  -- tecnologia: a trilha ganha dos demais (sem linha = 0,5)
  ('topic', 'clean-code', 0.9), ('topic', 'system-design', 0.9), ('topic', 'fundamentos', 0.85), ('topic', 'apis', 0.85),
  ('topic', 'ddd', 0.85), ('topic', 'arquitetura', 0.85), ('topic', 'testes', 0.8), ('topic', 'banco-de-dados', 0.8),
  ('topic', 'escalabilidade', 0.8), ('topic', 'microsservicos', 0.75), ('topic', 'event-driven', 0.75),
  ('topic', 'mensageria', 0.75), ('topic', 'devops', 0.7), ('topic', 'cloud', 0.7), ('topic', 'performance', 0.75),
  ('topic', 'seguranca', 0.7),
  -- curiosidades: vulnerabilidades e "como funciona" antes de ciência geral
  ('topic', 'vulnerabilidades', 0.95), ('topic', 'como-funciona', 0.95),
  ('topic', 'ciencia', 0.35), ('topic', 'espaco', 0.35), ('topic', 'historia', 0.3), ('topic', 'natureza', 0.3),
  -- mundo: tecnologia mudando algo antes de política/economia/guerra
  ('topic', 'ia-sociedade', 0.9), ('topic', 'chips-hardware', 0.9), ('topic', 'energia-tech', 0.9),
  ('topic', 'biotech', 0.85), ('topic', 'robotica', 0.85),
  ('topic', 'politica', 0.25), ('topic', 'economia', 0.3), ('topic', 'conflitos', 0.2),
  -- formatos: explicação e caso real valem mais que anúncio
  ('format', 'como-funciona', 0.9), ('format', 'case-real', 0.8), ('format', 'tutorial', 0.65), ('format', 'opiniao', 0.4)
on conflict (kind, key) do update
  set weight = excluded.weight
  where interest_weights.last_interaction_at is null;
