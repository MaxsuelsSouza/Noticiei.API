-- Compra de 31/10/2026 no Atacadão (NFC-e 000350696, série 510), registrada depois do fato.
-- Fica concluída e sem divergência: o anotado espelha a nota linha por linha.
-- Sem o texto bruto da nota (tinha CPF do consumidor).
-- Idempotente: se a nota já existir, apaga a sessão e a nota antigas e grava de novo.

create temporary table _nota_3110 (
  ordem int, codigo_loja text, ean text, descricao text, nome text,
  quantidade numeric(12, 4), unidade text, preco_unitario numeric(14, 4), valor_centavos int, desconto_centavos int,
  produto_id bigint
) on commit drop;

insert into _nota_3110 (ordem, codigo_loja, ean, descricao, nome, quantidade, unidade, preco_unitario, valor_centavos, desconto_centavos) values
  (1, '88977', null, 'PANO MICROFIBRA', 'Pano microfibra', 1, 'UN', 8.9, 890, 0),
  (2, '66552', null, 'ESPONJA SCOTCH-BRITE', 'Esponja scotch-brite', 1, 'UN', 8.49, 849, 0),
  (3, '77668', null, 'ABS.SYM NOITE/DIA', 'Absorvente sym noite/dia', 1, 'UN', 19.9, 1990, 0),
  (4, '72393', null, 'ABS.SEMPRE LIVRE', 'Absorvente sempre livre', 1, 'UN', 11.9, 1190, 0),
  (5, '13920', null, 'DES.AXE AERO', 'Desodorante axe aero', 2, 'UN', 8.9, 1780, 0),
  (6, '63828', null, 'RODO PLAST.PRECIOSA', 'Rodo plast.preciosa', 1, 'UN', 8.9, 890, 0),
  (7, '27746', null, 'CR.DENTAL COLGATE', 'Creme dental colgate', 1, 'UN', 10.89, 1089, 0),
  (8, '58281', null, 'ESC.DENTAL COLGATE', 'Escova dental colgate', 1, 'UN', 14.9, 1490, 0),
  (9, '12656', null, 'ESPARADRAPO CREMER', 'Esparadrapo cremer', 1, 'UN', 15.9, 1590, 0),
  (10, '7846', null, 'DET.LIQ.YPE', 'Detergente ype', 1, 'UN', 22.9, 2290, 0),
  (11, '63894', null, 'SACO LIXO EMBALIXO', 'Saco lixo embalixo', 2, 'UN', 12.9, 2580, 0),
  (12, '62684', null, 'SAB.JOHNSONS', 'Sabonete johnsons', 4, 'UN', 1.9, 760, 0),
  (13, '71559', null, 'CREME COND.KOLENE', 'Creme condicionador kolene', 1, 'UN', 12.9, 1290, 0),
  (14, '62679', null, 'SAB.JOHNSONS', 'Sabonete johnsons', 2, 'UN', 1.9, 380, 0),
  (15, '73520', null, 'AP.BARB.BIC SOLEIL N', 'Aparelho de barbear bic soleil n', 1, 'UN', 9.32, 932, 0),
  (16, '97355', null, 'DET.PO BEM TEVI', 'Sabão em pó bem tevi', 1, 'UN', 29.9, 2990, 0),
  (17, '13793', null, 'PAPEL HIG.BULNEZ 30M', 'Papel higiênico bulnez 30m', 1, 'UN', 35, 3500, 0),
  (18, '51583', null, 'SAC INST.BIO 60X70', 'Sacola bio 60x70', 4, 'UN', 0.35, 140, 0),
  (19, '24862', null, 'LEITE BETANIA INTEG.', 'Leite betania integral', 6, 'UN', 6.69, 4014, 0),
  (20, '85982', null, 'MAC.ALIANCA', 'Macarrão alianca', 8, 'UN', 1.79, 1432, 0),
  (21, '62543', null, 'RF.LING.T.CALAB.SEAR', 'Linguiça calabresa sear', 2, 'UN', 12.98, 2596, 0),
  (22, '35326', null, 'BATATA PALHA FREETAZ', 'Batata palha freetaz', 1, 'UN', 17.9, 1790, 0),
  (23, '23416', null, 'ARROZ URBANO PARB.T1', 'Arroz urbano parboilizado t1', 2, 'UN', 4.59, 918, 0),
  (24, '12649', null, 'GOMA TAPIOCA BULNEZ', 'Goma tapioca bulnez', 1, 'UN', 5.49, 549, 0),
  (25, '86042', null, 'FLOCAO FORTEMILHO', 'Flocao fortemilho', 8, 'UN', 1.06, 848, 0),
  (26, '94414', null, 'GELATINA LIGHTSWEET', 'Gelatina lightsweet', 1, 'UN', 2.99, 299, 0),
  (27, '5282', null, 'BEB LAC GUTBOM AMEIX', 'Bebida láctea gutbom ameix', 1, 'UN', 5.89, 589, 0),
  (28, '1559', null, 'ARROZ URBANO SUSHI', 'Arroz urbano sushi', 1, 'UN', 16.9, 1690, 0),
  (29, '86770', null, 'JERKEED B.DIANTEIRO', 'Charque b.dianteiro', 0.868, 'KG', 56.9, 4939, 0),
  (30, '85728', null, 'MORTAD.SEARA DEF.FAT', 'Mortadela seara def.fat', 0.552, 'KG', 25.9, 1430, 0),
  (31, '85579', null, 'MUSS.GIROLANDA FAT', 'Muçarela girolanda fat', 0.268, 'KG', 49.9, 1337, 0),
  (32, '46135', null, 'MARG.QUALY', 'Margarina qualy', 1, 'UN', 19.9, 1990, 0),
  (33, '75629', null, 'POSTA TILAPIA COPACO', 'Posta tilápia copaco', 1, 'UN', 23.99, 2399, 0),
  (34, '15063', null, 'COXA FGO SADIA', 'Coxa frango sadia', 2, 'UN', 14.99, 2998, 0),
  (35, '89441', null, 'BISTECA SUINA FAT.BD', 'Bisteca suína fat.bd', 1.502, 'KG', 17.5, 2628, 0),
  (36, '88086', null, 'BOV.CHAMBARIL DIAN', 'Bovino chambaril dian', 0.404, 'KG', 32.9, 1329, 0),
  (37, '85320', null, 'BOV.FIGADO RESERVA', 'Bovino fígado reserva', 0.958, 'KG', 12.9, 1236, 0),
  (38, '85690', null, 'BOV.MUSCULO RESERVA', 'Bovino musculo reserva', 1.436, 'KG', 36.9, 5299, 0),
  (39, '5688', null, 'KANI KAMA C.SUL', 'Kani kama c.sul', 1, 'UN', 9.98, 998, 0),
  (40, '15089', null, 'IOG NGURT NAT 0 LACT', 'Iogurte ngurt nat 0 lact', 1, 'UN', 8.29, 829, 0),
  (41, '56315', null, 'AVEIA YOKI FLOCOS', 'Aveia yoki flocos', 1, 'UN', 2.39, 239, 0),
  (42, '82590', null, 'ACHOC.PO APTI', 'Achocolatado em pó apti', 1, 'UN', 12.99, 1299, 0),
  (43, '89801', null, 'BISC.PILAR MARIA', 'Biscoito pilar maria', 1, 'UN', 3.99, 399, 0),
  (44, '13894', null, 'BISC.BULNEZ MAIZENA', 'Biscoito bulnez maizena', 1, 'UN', 4.29, 429, 0),
  (45, '17585', null, 'LEITE PO CONFIANCA', 'Leite em pó confianca', 5, 'UN', 5.79, 2895, 0),
  (46, '67007', null, 'SARD.88 RALADA', 'Sardinha 88 ralada', 2, 'UN', 4.99, 998, 0),
  (47, '61316', null, 'MAION.VIGOR SACHET', 'Maionese vigor sachet', 1, 'UN', 12.5, 1250, 0),
  (48, '83501', null, 'MOLHO PIZZA TAMBAU', 'Molho pizza tambau', 1, 'UN', 2.79, 279, 0),
  (49, '1869', null, 'MOLHO QUERO TRAD', 'Molho quero tradicional', 2, 'UN', 1.9, 380, 0),
  (50, '76888', null, 'TEMPERO KODILAR', 'Tempero kodilar', 1, 'UN', 5.49, 549, 0),
  (51, '3106', null, 'TEMP.MEU SEGREDO FRA', 'Tempero meu segredo fra', 1, 'UN', 3.59, 359, 0),
  (52, '42662', null, 'VINAGRE REGINA', 'Vinagre regina', 1, 'UN', 1.58, 158, 0),
  (53, '6259', null, 'MAION.BACON PET', 'Maionese bacon pet', 1, 'UN', 16.9, 1690, 0),
  (54, '14981', null, 'GELATINA ASSUGRIN', 'Gelatina assugrin', 2, 'UN', 2.69, 538, 0),
  (55, '64804', null, 'FEIJAO KALDINHO', 'Feijão kaldinho', 2, 'UN', 7.29, 1458, 0),
  (56, '83073', null, 'CAFE UNIAO TRAD.', 'Café uniao tradicional', 2, 'UN', 13.28, 2656, 0),
  (57, '1816', null, 'MAMAO COMUM', 'Mamão comum', 1.53, 'KG', 6.99, 1069, 0),
  (58, '14691', null, 'BATATA LAVADA', 'Batata lavada', 1.59, 'KG', 6.49, 1032, 0),
  (59, '1908', null, 'BATATA DOCE', 'Batata doce', 1.29, 'KG', 4.39, 566, 0),
  (60, '1923', null, 'CHUCHU', 'Chuchu', 0.395, 'KG', 3.59, 142, 0),
  (61, '14692', null, 'CEBOLA ATACADAO', 'Cebola Atacadão', 0.51, 'KG', 7.99, 407, 0),
  (62, '4177', null, 'MEXIRICA COMUM', 'Mexirica comum', 0.54, 'KG', 9.89, 534, 0),
  (63, '1920', null, 'CENOURA', 'Cenoura', 0.455, 'KG', 5.99, 273, 0),
  (64, '84159', null, 'MACAXEIRA', 'Macaxeira', 2.285, 'KG', 3.99, 912, 0),
  (65, '33159', null, 'TOMATE ITALIANO', 'Tomate italiano', 0.44, 'KG', 9.99, 440, 0),
  (66, '12657', null, 'BANANA PACOVAN', 'Banana pacovan', 1.895, 'KG', 1.89, 358, 0),
  (67, '1078', null, 'ABACAXI', 'Abacaxi', 1, 'UN', 2.69, 269, 0),
  (68, '14250', null, 'BISC.BULNEZ WAFER', 'Biscoito bulnez wafer', 2, 'UN', 1.19, 238, 0),
  (69, '23286', null, 'OVO PVC GDE VERMELHO', 'Ovo pvc gde vermelho', 1, 'UN', 17.99, 1799, 0),
  (70, '13683', null, 'OVO BULNEZ BCO PVC', 'Ovo bulnez bco pvc', 2, 'UN', 16.99, 3398, 0),
  (71, '36877', null, 'HF.UVA THOMPSON BDJ', 'Uva thompson bdj', 1, 'UN', 6.99, 699, 0),
  (72, '4808', null, 'BANANA TERRA', 'Banana terra', 0.56, 'KG', 6.99, 391, 0);

do $$
declare
  v_chave constant text := '26261075315333005097655100003506961048579170';
  v_cnpj constant text := '75315333005097';
  v_emitida constant timestamptz := '2026-10-31T16:25:46-03:00';
  v_mercado bigint;
  v_sessao bigint;
  r record;
begin
  select id into v_mercado from compras_mercados where cnpj = v_cnpj;
  if v_mercado is null then
    select id into v_mercado from compras_mercados where cnpj is null and lower(nome) like 'atacad%' order by id limit 1;
    if v_mercado is not null then
      update compras_mercados set cnpj = v_cnpj where id = v_mercado;
    else
      insert into compras_mercados (nome, cnpj) values ('Atacadão', v_cnpj) returning id into v_mercado;
    end if;
  end if;

  delete from compras_sessoes where chave = v_chave;
  delete from compras_notas where chave = v_chave;

  insert into compras_notas (chave, cnpj, estabelecimento, numero, serie, emitida_em, subtotal_centavos, descontos_centavos, total_centavos, origem, bruto)
  values (v_chave, v_cnpj, 'ATACADAO S.A.', '000350696', '510', v_emitida, 96860, 1687, 95173, 'texto', null);

  insert into compras_itens_nota (chave, ordem, codigo_loja, ean, descricao, quantidade, unidade, preco_unitario, valor_centavos, desconto_centavos)
  select v_chave, ordem, codigo_loja, ean, descricao, quantidade, unidade, preco_unitario, valor_centavos, desconto_centavos from _nota_3110 order by ordem;

  for r in select ordem, codigo_loja, nome, unidade from _nota_3110 order by ordem loop
    update _nota_3110 t set produto_id = c.produto_id
      from compras_codigos c where t.ordem = r.ordem and c.tipo = 'loja' and c.escopo = v_cnpj and c.codigo = r.codigo_loja;
    if not found then
      with novo as (insert into compras_produtos (nome, unidade) values (r.nome, r.unidade) returning id)
      update _nota_3110 t set produto_id = novo.id from novo where t.ordem = r.ordem;
      insert into compras_codigos (tipo, escopo, codigo, produto_id)
      select 'loja', v_cnpj, r.codigo_loja, produto_id from _nota_3110 where ordem = r.ordem
      on conflict (tipo, escopo, codigo) do update set produto_id = excluded.produto_id;
    end if;
  end loop;

  insert into compras_sessoes (nome, mercado_id, chave, created_at, updated_at, concluida_em)
  values (null, v_mercado, v_chave, v_emitida, v_emitida, v_emitida) returning id into v_sessao;

  insert into compras_itens (sessao_id, produto_id, descricao, codigo_lido, quantidade, unidade, preco_unitario, valor_centavos, created_at)
  select v_sessao, produto_id, nome, codigo_loja, quantidade, unidade, preco_unitario, valor_centavos, v_emitida + ordem * interval '1 second'
  from _nota_3110 order by ordem;
end $$;
