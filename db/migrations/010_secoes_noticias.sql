-- Seções novas do Noticias (ordem no resumo: tecnologia, hackernews, curiosidades, mundo, acompanhar, aleatorio):
--   tecnologia   → ferramentas, linguagens, formas de codar, estruturas de dados e arquiteturas novas;
--   hackernews   → CVEs, vulnerabilidades, ataques (DDoS, ransomware), pentest e correções;
--   curiosidades → "como funciona" e ciência (vulnerabilidades saem daqui);
--   acompanhar   → um artigo de cada blog da Trilha ("Para acompanhar"): o mais recente ainda não lido ou,
--                  sem novidade, o mais popular do blog no Hacker News (fonte do tipo 'popular');
--   aleatorio    → curiosidades engraçadas do mundo, sem tecnologia.
-- As cotas ficam em src/digest/select.ts.

-- 1) Categorias e tipo de fonte novos.
alter table sources drop constraint sources_default_category_check;
alter table sources add constraint sources_default_category_check
  check (default_category in ('tecnologia', 'hackernews', 'curiosidades', 'mundo', 'acompanhar', 'aleatorio'));
alter table contents drop constraint contents_category_check;
alter table contents add constraint contents_category_check
  check (category in ('tecnologia', 'hackernews', 'curiosidades', 'mundo', 'acompanhar', 'aleatorio'));
alter table digest_items drop constraint digest_items_slot_check;
alter table digest_items add constraint digest_items_slot_check
  check (slot in ('tecnologia', 'hackernews', 'curiosidades', 'mundo', 'acompanhar', 'aleatorio'));
alter table topics drop constraint topics_category_check;
alter table topics add constraint topics_category_check
  check (category in ('tecnologia', 'hackernews', 'curiosidades', 'mundo'));
alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check
  check (type in ('rss', 'reddit', 'devto', 'hackernews', 'popular'));

-- Blog acompanhado: o feed e a lista de populares do mesmo blog têm a mesma chave (um artigo por chave no resumo).
alter table sources add column follow_key text;

-- 2) Para acompanhar: os blogs da Trilha (Uber e LinkedIn ficam de fora; no lugar do Microsoft Learn, o .NET Blog).
--    O Netflix TechBlog (Medium) hoje recusa a extração do texto (HTTP 403), então só aparece se isso mudar.
update sources set default_category = 'acompanhar', lock_category = true, follow_key = 'netflix'    where address = 'https://netflixtechblog.com/feed';
update sources set default_category = 'acompanhar', lock_category = true, follow_key = 'cloudflare' where address = 'https://blog.cloudflare.com/rss/';
update sources set default_category = 'acompanhar', lock_category = true, follow_key = 'dotnet'     where address = 'https://devblogs.microsoft.com/dotnet/feed/';

insert into sources (name, type, address, default_category, language, is_official, lock_category, follow_key, collect_interval_hours) values
  ('Stripe Engineering',       'rss', 'https://stripe.com/blog/feed.rss',                                    'acompanhar', 'en', false, true, 'stripe',       24),
  ('Google Cloud · Developers', 'rss', 'https://cloudblog.withgoogle.com/topics/developers-practitioners/rss/', 'acompanhar', 'en', false, true, 'google-cloud', 24),
  ('Slack Engineering',        'rss', 'https://slack.engineering/feed/',                                     'acompanhar', 'en', false, true, 'slack',        24),
  -- Mais populares de cada blog (pontos no Hacker News, pela API pública do Algolia), atualizados uma vez por semana.
  ('Netflix TechBlog (populares)',  'popular', 'netflixtechblog.com',                  'acompanhar', 'en', false, true, 'netflix',      168),
  ('Cloudflare Blog (populares)',   'popular', 'blog.cloudflare.com',                  'acompanhar', 'en', false, true, 'cloudflare',   168),
  ('.NET Blog (populares)',         'popular', 'devblogs.microsoft.com/dotnet',        'acompanhar', 'en', false, true, 'dotnet',       168),
  ('Stripe (populares)',            'popular', 'stripe.com/blog',                      'acompanhar', 'en', false, true, 'stripe',       168),
  ('Google Cloud Blog (populares)', 'popular', 'cloud.google.com/blog',                'acompanhar', 'en', false, true, 'google-cloud', 168),
  ('Slack Engineering (populares)', 'popular', 'slack.engineering',                    'acompanhar', 'en', false, true, 'slack',        168)
on conflict (address) do nothing;

-- 3) HackerNews: segurança.
update sources set default_category = 'hackernews', lock_category = true
where address in ('https://feeds.feedburner.com/TheHackersNews', 'https://www.bleepingcomputer.com/feed/');

insert into sources (name, type, address, default_category, language, is_official, lock_category) values
  ('Krebs on Security',     'rss', 'https://krebsonsecurity.com/feed/',                    'hackernews', 'en', false, true),
  ('PortSwigger Research',  'rss', 'https://portswigger.net/research/rss',                 'hackernews', 'en', false, true),
  ('Cloudflare Blog · DDoS', 'rss', 'https://blog.cloudflare.com/tag/ddos/rss/',            'hackernews', 'en', false, true),
  -- 4) Aleatório: notícias inusitadas (itens de tecnologia são descartados na coleta).
  --    UPI Odd News, NPR Strange News e Bored Panda bloqueiam a extração do texto; Oddity Central quase não publica;
  --    os "weird news" de tabloide (Mirror, Daily Star) são fofoca e crime.
  ('Mental Floss',              'rss', 'https://www.mentalfloss.com/rss.xml',              'aleatorio', 'en', false, true),
  ('Smithsonian · Smart News',  'rss', 'https://www.smithsonianmag.com/rss/smart-news/',   'aleatorio', 'en', false, true)
on conflict (address) do nothing;

-- 5) Assuntos de segurança passam de curiosidades para hackernews.
update topics set category = 'hackernews', name = 'Vulnerabilidades e CVEs',
  keywords = array['vulnerability', 'vulnerabilities', 'vulnerabilidade', 'vulnerabilidades', 'cve', 're:cve-\d{4}-\d+',
                   'zero-day', 'zero day', '0-day', 'exploit', 'exploited', 'exploits', 'exploitation', 'rce',
                   'remote code execution', 'privilege escalation', 'flaw', 'flaws', 'falha de segurança',
                   'kev', 'known exploited', 'cvss', 'advisory']
where slug = 'vulnerabilidades';

insert into topics (slug, name, category, keywords) values
  ('ataques',  'Ataques e ameaças', 'hackernews', array['ddos', 'denial of service', 'botnet', 'botnets', 'ransomware', 'malware', 'spyware',
                                                        'infostealer', 'info-stealer', 'trojan', 'backdoor', 'phishing', 'supply chain attack',
                                                        'data breach', 'breach', 'vazamento', 'hacked', 'hackers', 'threat actor', 'threat actors',
                                                        'apt']),
  ('pentest',  'Pentest e pesquisa', 'hackernews', array['pentest', 'pentesting', 'penetration testing', 'penetration test', 'red team', 'red teaming',
                                                        'bug bounty', 'write-up', 'writeup', 'ctf', 'burp', 'xss', 'cross-site scripting',
                                                        'sql injection', 'sqli', 'ssrf', 'csrf', 'request smuggling', 'deserialization',
                                                        'prototype pollution', 'fuzzing', 'reverse engineering', 'web security research']),
  ('correcoes', 'Correções e mitigação', 'hackernews', array['patch', 'patches', 'patched', 'patch tuesday', 'security update', 'security updates',
                                                        'security fix', 'security fixes', 'mitigation', 'mitigate', 'mitigations', 'workaround',
                                                        'update now', 'hotfix', 'correção', 'atualização de segurança']),
  -- 6) Tecnologia: o que é novo para quem programa.
  ('ferramentas', 'Ferramentas novas', 'tecnologia', array['introducing', 'announcing', 'launches', 'launched', 'new tool', 'new library',
                                                        'framework', 'frameworks', 'sdk', 'runtime', 'toolchain', 'open sourcing', 'open-sourcing', 'now available',
                                                        'general availability', 'new release', 'first release']),
  ('formas-de-codar', 'Formas de codar', 'tecnologia', array['programming paradigm', 'functional programming', 'reactive programming',
                                                        'type system', 'type safety', 'immutability', 'pattern matching', 'metaprogramming',
                                                        'code generation', 'codegen', 'ai coding', 'coding agent', 'coding agents', 'vibe coding',
                                                        'copilot', 'pair programming', 'developer experience', 'best practices',
                                                        'monorepo', 'trunk-based', 'feature flags', 'property-based testing']),
  ('estruturas-dados', 'Estruturas de dados e algoritmos', 'tecnologia', array['data structure', 'data structures', 'estrutura de dados',
                                                        'estruturas de dados', 'algorithm', 'algorithms', 'algoritmo', 'algoritmos',
                                                        'b-tree', 'b+ tree', 'lsm tree', 'lsm-tree', 'bloom filter', 'skip list', 'hash table',
                                                        'hash map', 'hashmap', 'trie', 'heap', 'priority queue', 'graph algorithm', 'crdt', 'crdts',
                                                        'merkle tree', 'hyperloglog', 'vector index', 'hnsw', 'ring buffer', 'big o', 'complexity'])
on conflict (slug) do nothing;

-- O 'fundamentos' de 005 levava algoritmos/estruturas; agora eles têm assunto próprio.
update topics set keywords = array(
  select k from unnest(keywords) as k
  where k not in ('algorithm', 'algorithms', 'algoritmos', 'data structure', 'data structures', 'estruturas de dados'))
where slug = 'fundamentos';

insert into topic_links (topic_a, topic_b, manual, manual_strength) values
  ('ataques',          'vulnerabilidades', true, 0.8),
  ('correcoes',        'vulnerabilidades', true, 0.8),
  ('pentest',          'vulnerabilidades', true, 0.7),
  ('estruturas-dados', 'fundamentos',      true, 0.7),
  ('banco-de-dados',   'estruturas-dados', true, 0.6),
  ('ferramentas',      'linguagens',       true, 0.5),
  ('formas-de-codar',  'testes',           true, 0.5)
on conflict do nothing;

-- 7) Pesos (só onde ainda não houve interação).
insert into interest_weights (kind, key, weight) values
  ('topic', 'ferramentas', 0.9), ('topic', 'formas-de-codar', 0.9), ('topic', 'estruturas-dados', 0.9),
  ('topic', 'linguagens', 0.85), ('topic', 'arquitetura', 0.9), ('topic', 'system-design', 0.9),
  ('topic', 'carreira', 0.2), ('topic', 'open-source', 0.65),
  ('topic', 'vulnerabilidades', 0.95), ('topic', 'ataques', 0.9), ('topic', 'pentest', 0.95), ('topic', 'correcoes', 0.85),
  -- curiosidades sem segurança: "como funciona" na frente e ciência logo atrás
  ('topic', 'como-funciona', 0.95), ('topic', 'ciencia', 0.6), ('topic', 'espaco', 0.6), ('topic', 'historia', 0.55),
  ('topic', 'natureza', 0.55),
  ('format', 'novidade', 0.7)
on conflict (kind, key) do update
  set weight = excluded.weight
  where interest_weights.last_interaction_at is null;
