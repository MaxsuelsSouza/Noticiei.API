/**
 * Compra de 31/10/2026 no Atacadão (Recife): a especificação do comparador usa esta compra como caso de referência.
 * Anotado: os 60 lançamentos feitos no mercado. Nota: as linhas da NFC-e no formato do texto copiado da página
 * da Sefaz-PE. Os códigos da loja são os reais quando conhecidos (15063, 85690, 5688); os demais são fictícios.
 * Resultado esperado: anotado R$ 856,00; subtotal da nota R$ 968,60; descontos R$ 16,87; pago R$ 951,73.
 *
 * A tabela item a item da especificação soma R$ 833,10 anotados e tem 71 linhas de nota, mas a nota tem 72 produtos
 * e o fechamento usa R$ 856,00 / R$ 968,60: falta na tabela um produto de R$ 22,90 que bateu certo. Ele entra
 * aqui como "Produto 72" para os totais conferirem com o cupom.
 */

export const CHAVE = "26261075315333005097655100003506961048579170";
export const URL_QR = `https://nfce.sefaz.pe.gov.br:444/nfce-web/consultarNFCe?p=${CHAVE}|2|1|1|5DD0BE16052557839712350C218A125657CB1415`;

/** [descrição, quantidade, unidade, preço unitário] na ordem em que foi anotado. */
export const ANOTADO: [string, number, "UN" | "KG", number][] = [
  ["Arroz", 2, "UN", 4.13],
  ["Arroz de sushi", 1, "UN", 16.91],
  ["Feijão", 2, "UN", 7.29],
  ["Sabonete", 6, "UN", 1.9],
  ["Escova de dente", 1, "UN", 14.9],
  ["Desodorante", 3, "UN", 7.99],
  ["Esparadrapo", 1, "UN", 15.9],
  ["Barbeador", 1, "UN", 9.33],
  ["Creme de cabelo", 1, "UN", 13],
  ["Absorvente", 1, "UN", 20],
  ["Absorvente diário", 1, "UN", 11],
  ["Sabão em pó", 1, "UN", 29.9],
  ["Papel higiênico", 1, "UN", 35],
  ["Saco de lixo", 2, "UN", 10.96],
  ["Pano de balcão", 1, "UN", 8.9],
  ["Rodo", 1, "UN", 8.9],
  ["Bucha de pratos", 1, "UN", 8.49],
  ["Maionese", 1, "UN", 12.5],
  ["Maionese temperada", 1, "UN", 16.99],
  ["Cuscuz (flocão)", 8, "UN", 1.06],
  ["Tempero lemon pepper", 1, "UN", 5.49],
  ["Vinagre", 1, "UN", 1.58],
  ["Sardinha", 2, "UN", 5],
  ["Macarrão", 8, "UN", 1.79],
  ["Molho de tomate", 2, "UN", 1.71],
  ["Molho de tomate especial", 1, "UN", 2.79],
  ["Achocolatado", 1, "UN", 12.99],
  ["Café", 2, "UN", 13.28],
  ["Leite em pó", 5, "UN", 5.79],
  ["Aveia", 1, "UN", 2.39],
  ["Biscoito maria", 1, "UN", 3.99],
  ["Biscoito maisena", 1, "UN", 4.4],
  ["Gelatina", 1, "UN", 2.99],
  ["Gelatina diet", 2, "UN", 2.69],
  ["Batata palha", 1, "UN", 17.9],
  ["Leite integral", 6, "UN", 6.69],
  ["Abacaxi", 1, "UN", 2.69],
  ["Macaxeira", 2.178, "KG", 4],
  ["Batata-doce", 1.246, "KG", 4.39],
  ["Batata", 1.526, "KG", 6.49],
  ["Goma de tapioca", 1, "UN", 5.49],
  ["Charque", 1, "UN", 49.39],
  ["Peixe tilápia", 1, "UN", 23.99],
  ["Karina karaoke", 1, "UN", 9.98],
  ["Coxas (saco)", 2, "UN", 15],
  ["Manteiga", 1, "UN", 13],
  ["Iogurte natural", 1, "UN", 8.29],
  ["Queijo", 1, "UN", 13.37],
  ["Calabresa", 1, "UN", 12],
  ["Mortadela", 1, "UN", 10.43],
  ["Bisteca suína", 1, "UN", 26.28],
  ["Carne moída", 1, "UN", 52.99],
  ["Chambaril", 1, "UN", 13.29],
  ["Fígado", 1, "UN", 12.3],
  ["Banana-da-terra", 0.523, "KG", 6.99],
  ["Chuchu", 0.318, "KG", 3.6],
  ["Cenoura", 0.386, "KG", 5.99],
  ["Banana", 1.818, "KG", 1.89],
  ["Calabresa", 1, "UN", 13],
  ["Uva verde", 1, "UN", 8.36],
  ["Produto 72", 1, "UN", 22.9],
];

/** [descrição, código da loja, quantidade, unidade da nota, preço unitário, total]. */
export const NOTA: [string, string, number, string, number, number][] = [
  ["ARROZ URBANO PARB.T1", "1001", 2, "UND9", 4.59, 9.18],
  ["ARROZ URBANO SUSHI", "1002", 1, "UND9", 16.9, 16.9],
  ["FEIJAO KALDINHO", "1003", 2, "UND9", 7.29, 14.58],
  ["SAB.JOHNSONS", "1004", 4, "UND9", 1.9, 7.6],
  ["SAB.JOHNSONS", "1005", 2, "UND9", 1.9, 3.8],
  ["ESC.DENTAL COLGATE", "1006", 1, "UND9", 14.9, 14.9],
  ["DES.AXE AERO", "1007", 2, "UND9", 8.9, 17.8],
  ["ESPARADRAPO CREMER", "1008", 1, "UND9", 15.9, 15.9],
  ["AP.BARB.BIC SOLEIL N", "1009", 1, "UND9", 9.32, 9.32],
  ["CREME COND.KOLENE", "1010", 1, "UND9", 12.9, 12.9],
  ["ABS.SYM NOITE/DIA", "1011", 1, "UND9", 19.9, 19.9],
  ["ABS.SEMPRE LIVRE", "1012", 1, "UND9", 11.9, 11.9],
  ["DET.PO BEM TEVI", "1013", 1, "UND9", 29.9, 29.9],
  ["PAPEL HIG.BULNEZ 30M", "1014", 1, "PCT9", 35, 35],
  ["SACO LIXO EMBALIXO", "1015", 2, "PCT9", 12.9, 25.8],
  ["PANO MICROFIBRA", "1016", 1, "UND9", 8.9, 8.9],
  ["RODO PLAST.PRECIOSA", "1017", 1, "UND9", 8.9, 8.9],
  ["ESPONJA SCOTCH-BRITE", "1018", 1, "UND9", 8.49, 8.49],
  ["MAION.VIGOR SACHET", "1019", 1, "UND9", 12.5, 12.5],
  ["MAION.BACON PET", "1020", 1, "UND9", 16.9, 16.9],
  ["FLOCAO FORTEMILHO", "1021", 8, "UND9", 1.06, 8.48],
  ["TEMPERO KODILAR", "1022", 1, "UND9", 5.49, 5.49],
  ["VINAGRE REGINA", "1023", 1, "UND9", 1.58, 1.58],
  ["SARD.88 RALADA", "1024", 2, "UND9", 4.99, 9.98],
  ["MAC.ALIANCA", "1025", 8, "UND9", 1.79, 14.32],
  ["MOLHO QUERO TRAD", "1026", 2, "UND9", 1.9, 3.8],
  ["MOLHO PIZZA TAMBAU", "1027", 1, "UND9", 2.79, 2.79],
  ["ACHOC.PO APTI", "1028", 1, "UND9", 12.99, 12.99],
  ["CAFE UNIAO TRAD.", "1029", 2, "UND9", 13.28, 26.56],
  ["LEITE PO CONFIANCA", "1030", 5, "UND9", 5.79, 28.95],
  ["AVEIA YOKI FLOCOS", "1031", 1, "UND9", 2.39, 2.39],
  ["BISC.PILAR MARIA", "1032", 1, "UND9", 3.99, 3.99],
  ["BISC.BULNEZ MAIZENA", "1033", 1, "UND9", 4.29, 4.29],
  ["GELATINA LIGHTSWEET", "1034", 1, "UND9", 2.99, 2.99],
  ["GELATINA ASSUGRIN", "1035", 2, "UND9", 2.69, 5.38],
  ["BATATA PALHA FREETAZ", "1036", 1, "UND9", 17.9, 17.9],
  ["LEITE BETANIA INTEG.", "1037", 6, "UND9", 6.69, 40.14],
  ["ABACAXI", "1038", 1, "UND9", 2.69, 2.69],
  ["MACAXEIRA", "1039", 2.285, "KG9", 3.99, 9.12],
  ["BATATA DOCE", "1040", 1.29, "KG9", 4.39, 5.66],
  ["BATATA LAVADA", "1041", 1.59, "KG9", 6.49, 10.32],
  ["GOMA TAPIOCA BULNEZ", "1042", 1, "UND9", 5.49, 5.49],
  ["JERKEED B.DIANTEIRO", "1043", 0.868, "KG9", 56.9, 49.39],
  ["POSTA TILAPIA COPACO", "1044", 1, "UND9", 23.99, 23.99],
  ["KANI KAMA C.SUL", "5688", 1, "PCT9", 9.98, 9.98],
  ["COXA FGO SADIA", "15063", 2, "UND9", 14.99, 29.98],
  ["MARG.QUALY", "1045", 1, "UND9", 19.9, 19.9],
  ["IOG NGURT NAT 0 LACT", "1046", 1, "UND9", 8.29, 8.29],
  ["MUSS.GIROLANDA FAT", "1047", 0.268, "KG9", 49.9, 13.37],
  ["RF.LING.T.CALAB.SEAR", "1048", 2, "UND9", 12.98, 25.96],
  ["MORTAD.SEARA DEF.FAT", "1049", 0.552, "KG9", 25.9, 14.3],
  ["BISTECA SUINA FAT.BD", "1050", 1.502, "KG9", 17.5, 26.28],
  ["BOV.MUSCULO RESERVA", "85690", 1.436, "KG9", 36.9, 52.99],
  ["BOV.CHAMBARIL DIAN", "1051", 0.404, "KG9", 32.9, 13.29],
  ["BOV.FIGADO RESERVA", "1052", 0.958, "KG9", 12.9, 12.36],
  ["BANANA TERRA", "1053", 0.56, "KG9", 6.99, 3.91],
  ["CHUCHU", "1054", 0.395, "KG9", 3.59, 1.42],
  ["CENOURA", "1055", 0.455, "KG9", 5.99, 2.73],
  ["BANANA PACOVAN", "1056", 1.895, "KG9", 1.89, 3.58],
  ["HF.UVA THOMPSON BDJ", "1057", 1, "BDJ5", 6.99, 6.99],
  ["PRODUTO 72 FALTOU NA TABELA", "1069", 1, "UND9", 22.9, 22.9],
  // não anotados
  ["OVO BULNEZ BCO PVC", "1058", 2, "BDJ5", 16.99, 33.98],
  ["OVO PVC GDE VERMELHO", "1059", 1, "BDJ5", 17.99, 17.99],
  ["CR.DENTAL COLGATE", "1060", 1, "UND9", 10.89, 10.89],
  ["MAMAO COMUM", "1061", 1.53, "KG9", 6.99, 10.69],
  ["BEB LAC GUTBOM AMEIX", "1062", 1, "UND9", 5.89, 5.89],
  ["MEXIRICA COMUM", "1063", 0.54, "KG9", 9.89, 5.34],
  ["TOMATE ITALIANO", "1064", 0.44, "KG9", 9.99, 4.4],
  ["CEBOLA ATACADAO", "1065", 0.51, "KG9", 7.99, 4.07],
  ["TEMP.MEU SEGREDO FRA", "1066", 1, "UND9", 3.59, 3.59],
  ["BISC.BULNEZ WAFER", "1067", 2, "UND9", 1.19, 2.38],
  ["SAC INST.BIO 60X70", "1068", 4, "UND9", 0.35, 1.4],
];

const br = (n: number) => String(n).replace(".", ",");

/** Como sai o "selecionar tudo + copiar" da página de consulta da Sefaz-PE. */
export const TEXTO_SEFAZ = [
  "ATACADAO S.A.",
  "CNPJ: 75.315.333/0050-97 , AV. EXEMPLO, 1000, RECIFE, PE",
  "Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica",
  "",
  ...NOTA.flatMap(([d, c, q, u, p, t]) => [`${d}(Código: ${c})`, `Qtde.: ${br(q)}  UN: ${u}  Vl. Unit.: ${br(p)}`, "Vl. Total", br(t), ""]),
  "Qtd. total de itens: 72",
  "Valor a pagar R$: 951,73",
  "Forma de pagamento: Valor pago R$:",
  "Cartão de Alimentação 951,73",
  "Número: 000350696 Série: 510 Emissão: 31/10/2026 16:25:50 - Via Consumidor",
  "Chave de acesso:",
  "2626 1075 3153 3300 5097 6551 0000 3506 9610 4857 9170",
].join("\n");

/** O mesmo, no HTML que a página serve (layout usado por vários portais de NFC-e). */
export const HTML_SEFAZ = `<!DOCTYPE html><html><head><title>NFC-e</title><script>var x = "Código: 999";</script></head><body>
<div id="u20" class="txtTopo">ATACADAO S.A.</div><div class="text">CNPJ: 75.315.333/0050-97</div>
<table id="tabResult">${NOTA.map(([d, c, q, u, p, t], i) =>
  `<tr id="Item + ${i + 1}"><td valign="top"><span class="txtTit">${d.replace("&", "&amp;")}</span><span class="RCod">(Código: ${c} )</span><br/><span class="Rqtd"><strong>Qtde.:</strong>${br(q)}</span><span class="RUN"><strong>UN: </strong>${u}</span><span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;${br(p)}</span></td><td align="right" valign="top" class="txtTit noWrap">Vl. Total<br/><span class="valor">${br(t)}</span></td></tr>`).join("\n")}
</table><div id="totalNota"><div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">72</span></div>
<div id="linhaTotal" class="linhaShade"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">951,73</span></div></div>
<ul><li><strong>Número: </strong>000350696<strong> Série: </strong>510<strong> Emissão: </strong>31/10/2026 16:25:50</li></ul>
<span class="chave">2626 1075 3153 3300 5097 6551 0000 3506 9610 4857 9170</span></body></html>`;
