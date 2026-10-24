-- Check-in na academia (professorborracha.com.br): uma linha por tentativa, com o resultado e a mensagem de erro,
-- para o hub mostrar o que deu certo e o que deu errado. Substitui a ideia de uma linha por dia (004, não aplicada).

create table checkin_attempts (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  source      text not null check (source in ('app', 'widget', 'auto')),
  status      text not null check (status in ('ok', 'duplicate', 'skipped', 'error')),
  message     text not null,
  data_aula   date not null,                 -- dia local (America/Sao_Paulo) da tentativa
  aula        text,                          -- ex.: '19:30–21:00 Espinheiro'
  unidade     text not null,
  step        text,                          -- onde falhou: login, aulas ou envio
  http_status int
);

create index checkin_attempts_recentes on checkin_attempts (at desc);
create index checkin_attempts_dia on checkin_attempts (data_aula) where status in ('ok', 'duplicate');
