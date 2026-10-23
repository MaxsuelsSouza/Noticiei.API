-- Check-ins automáticos na academia (disparados pela notificação de check-in do Wellhub).
-- Uma linha por dia: garante que duas notificações no mesmo dia não gerem dois check-ins.

create table checkins (
  checkin_date date primary key,               -- dia local (America/Sao_Paulo)
  status       text not null check (status in ('em_andamento', 'ok', 'falhou')),
  source       text not null,                  -- quem disparou, ex.: 'wellhub'
  notified_at  timestamptz not null,           -- quando a notificação chegou no celular
  attempts     int not null default 1,
  detail       text,                           -- resposta do site ou mensagem de erro
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
