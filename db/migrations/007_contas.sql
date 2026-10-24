-- Lembrete de contas: cada linha é uma conta a pagar com vencimento.
-- Mensal e parcelada: ao marcar como paga, a próxima é criada com origem_id apontando para esta
-- (desfazer o pagamento apaga a próxima se ela ainda estiver em aberto).

create table contas (
  id                bigserial primary key,
  nome              text not null check (length(nome) between 1 and 80),
  valor_centavos    int not null check (valor_centavos > 0),
  vencimento        date not null,
  repeticao         text not null default 'uma_vez' check (repeticao in ('uma_vez', 'mensal', 'parcelas')),
  parcela_atual     int,
  parcelas_total    int,
  codigo            text check (length(codigo) <= 300),
  lembrete_vespera  boolean not null default true,
  lembrete_dia      boolean not null default true,
  lembrete_insistir boolean not null default true,
  pago_em           timestamptz,
  origem_id         bigint references contas (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (
    (repeticao = 'parcelas' and parcela_atual between 1 and parcelas_total and parcelas_total between 2 and 120)
    or (repeticao <> 'parcelas' and parcela_atual is null and parcelas_total is null)
  )
);

create index contas_abertas on contas (vencimento) where pago_em is null;
