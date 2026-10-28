-- Check-in em mais de uma conta: a segunda (BORRACHA_EMAIL_2) acompanha a principal na mesma aula.
-- Cada tentativa guarda de qual conta é; "um sucesso por dia" passa a valer por conta.

alter table checkin_attempts add column conta text not null default 'principal' check (conta in ('principal', 'segunda'));

drop index checkin_attempts_dia;
create index checkin_attempts_dia on checkin_attempts (conta, data_aula) where status in ('ok', 'duplicate');
