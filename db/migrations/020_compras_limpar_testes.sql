-- Limpeza única dos dados de teste das compras (01/11/2026): os valores anotados e as notas não eram reais.
-- Apaga compras (itens anotados e listas vão junto) e notas (linhas vão junto).
-- Ficam os produtos, os códigos que apontam para eles (código de barras, código da loja, balança) e os mercados.
delete from compras_planejados;
delete from compras_itens;
delete from compras_sessoes;
delete from compras_itens_nota;
delete from compras_notas;
