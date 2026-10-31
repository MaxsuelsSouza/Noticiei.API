-- Abas Todos e Rumores: qualquer área que pague R$ 6 mil ou mais (não só TI e polícia).
-- visivel_geral nulo = ainda não avaliado com a regra nova (a rotina recalcula esses).
alter table concursos
  add column visivel_geral boolean,
  add column peso_geral    real not null default 0;

create index concursos_geral_idx on concursos (visivel_geral, peso_geral desc);
