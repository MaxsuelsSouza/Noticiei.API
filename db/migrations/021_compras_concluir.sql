-- Compra concluída: depois da conferência, a compra fecha e aparece como "Concluída" nas anteriores.
alter table compras_sessoes add column concluida_em timestamptz;

-- Segunda limpeza dos dados de teste (01/11/2026, 09:00): compras e notas saem; produtos, códigos e mercados ficam.
delete from compras_planejados;
delete from compras_itens;
delete from compras_sessoes;
delete from compras_itens_nota;
delete from compras_notas;
