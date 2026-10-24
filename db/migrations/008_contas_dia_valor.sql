-- Lembrete de contas: valor opcional (ex.: energia só se sabe perto do vencimento) e o dia fixo do mês
-- das contas mensais/parceladas ("todo dia 16"), para a próxima não escorregar depois de um mês curto.

alter table contas alter column valor_centavos drop not null;
alter table contas drop constraint contas_valor_centavos_check;
alter table contas add constraint contas_valor_centavos_check check (valor_centavos is null or valor_centavos > 0);

-- Quando true, a próxima conta (mensal/parcelada) nasce sem valor, para preencher quando chegar.
alter table contas add column valor_variavel boolean not null default false;

alter table contas add column dia_vencimento int check (dia_vencimento between 1 and 31);
update contas set dia_vencimento = extract(day from vencimento) where repeticao <> 'uma_vez';
