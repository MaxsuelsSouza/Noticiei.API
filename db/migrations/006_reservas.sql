-- Widget de agendamentos: uma reserva por dia (o calendário marca o dia como livre ou reservado).

create table reservas (
  dia        date primary key,
  nome       text not null check (length(nome) between 1 and 120),
  telefone   text not null check (length(telefone) between 1 and 30),
  observacao text check (length(observacao) <= 1000),
  pago       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
