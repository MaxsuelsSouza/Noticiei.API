import assert from "node:assert/strict";
import { test } from "node:test";
import { lerAnotacao } from "../src/compras/anotacao.js";
import { gtinValido, lerCodigo } from "../src/compras/codigo.js";
import { conciliar, type Anotado, type LinhaNota } from "../src/compras/conciliar.js";
import { acharChave, chaveValida, dadosDaChave, lerNota, lerXml, urlDeConsulta } from "../src/compras/nota.js";
import { numeroBr, valorLinha } from "../src/compras/numeros.js";
import { ANOTADO, CHAVE, HTML_SEFAZ, NOTA, TEXTO_SEFAZ, URL_QR } from "./fixtures/compra-2026-10-31.js";

test("numeroBr entende vírgula decimal e ponto de milhar", () => {
  assert.equal(numeroBr("36,9"), 36.9);
  assert.equal(numeroBr("1.234,56"), 1234.56);
  assert.equal(numeroBr("14.99"), 14.99);
  assert.equal(numeroBr("R$ 951,73"), 951.73);
  assert.equal(valorLinha(2.178, 4), 871);
  assert.equal(valorLinha(0.523, 6.99), 366);
});

test("chave de acesso: dígito verificador, link do QR code e texto com espaços", () => {
  assert.equal(chaveValida(CHAVE), true);
  assert.equal(chaveValida(CHAVE.slice(0, 43) + "1"), false);
  assert.equal(acharChave(URL_QR), CHAVE);
  assert.equal(acharChave("Chave de acesso:\n2626 1075 3153 3300 5097 6551 0000 3506 9610 4857 9170"), CHAVE);
  assert.deepEqual(dadosDaChave(CHAVE), { chave: CHAVE, uf: "PE", cnpj: "75315333005097", modelo: "65", serie: "510", numero: "000350696" });
});

test("o servidor só busca links .gov.br", () => {
  assert.equal(urlDeConsulta(URL_QR).hostname, "nfce.sefaz.pe.gov.br");
  assert.throws(() => urlDeConsulta("http://169.254.169.254/latest"), /Sefaz/);
  assert.throws(() => urlDeConsulta("https://sefaz.pe.gov.br.evil.com/x"), /Sefaz/);
});

test("texto copiado da Sefaz-PE: 72 linhas, 114 unidades, subtotal e desconto pelo valor a pagar", () => {
  const nota = lerNota(TEXTO_SEFAZ);
  assert.equal(nota.origem, "texto");
  assert.equal(nota.itens.length, 72);
  assert.equal(nota.itens.filter((i) => i.unidade === "UN").reduce((s, i) => s + i.quantidade, 0) + nota.itens.filter((i) => i.unidade === "KG").length, 114);
  assert.equal(nota.subtotalCentavos, 96860);
  assert.equal(nota.totalCentavos, 95173);
  assert.equal(nota.descontosCentavos, 1687);
  assert.equal(nota.emitidaEm, "2026-10-31T16:25:50-03:00");
  assert.equal(nota.estabelecimento, "ATACADAO S.A.");
  assert.deepEqual(nota.itens.find((i) => i.codigoLoja === "85690"), {
    ordem: 53, codigoLoja: "85690", ean: null, descricao: "BOV.MUSCULO RESERVA", quantidade: 1.436, unidade: "KG", precoUnitario: 36.9, valorCentavos: 5299, descontoCentavos: 0,
  });
});

test("HTML da página dá o mesmo resultado que o texto copiado (script com 'Código:' é ignorado)", () => {
  const html = lerNota(HTML_SEFAZ);
  const txt = lerNota(TEXTO_SEFAZ);
  assert.equal(html.origem, "html");
  assert.equal(html.chave, CHAVE);
  assert.deepEqual(html.itens, txt.itens);
  assert.equal(html.totalCentavos, 95173);
});

test("página em latin-1 lida como UTF-8: o Código estragado ainda é reconhecido", () => {
  const estragado = TEXTO_SEFAZ.replace(/Código/g, "C\uFFFDdigo");
  assert.equal(lerNota(estragado).itens.length, 72);
  assert.equal(lerNota(TEXTO_SEFAZ.replace(/Código/g, "CÃ³digo")).itens.length, 72);
});

test("texto sem chave pede o link ou a chave; com a chave informada lê", () => {
  const semChave = TEXTO_SEFAZ.split("Chave de acesso")[0]!;
  assert.throws(() => lerNota(semChave), /chave/);
  assert.equal(lerNota(semChave, CHAVE).itens.length, 72);
});

test("XML da NFC-e traz código de barras e desconto por item", () => {
  const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${CHAVE}"><ide><dhEmi>2026-10-31T16:25:50-03:00</dhEmi></ide>
    <emit><CNPJ>75315333005097</CNPJ><xNome>ATACADAO S.A.</xNome><xFant>ATACADAO</xFant></emit>
    <det nItem="1"><prod><cProd>1059</cProd><cEAN>7891234567895</cEAN><xProd>OVO PVC GDE VERMELHO</xProd><uCom>BDJ</uCom><qCom>1.0000</qCom><vUnCom>17.9900000000</vUnCom><vProd>17.99</vProd><vDesc>2.70</vDesc></prod></det>
    <det nItem="2"><prod><cProd>1039</cProd><cEAN>SEM GTIN</cEAN><xProd>MACAXEIRA</xProd><uCom>KG</uCom><qCom>2.2850</qCom><vUnCom>3.99</vUnCom><vProd>9.12</vProd></prod></det>
    <total><ICMSTot><vProd>27.11</vProd><vDesc>2.70</vDesc><vNF>24.41</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
  const nota = lerXml(xml);
  assert.equal(lerNota(xml).origem, "xml");
  assert.equal(nota.estabelecimento, "ATACADAO");
  assert.equal(nota.itens[0]!.ean, "7891234567895");
  assert.equal(nota.itens[0]!.descontoCentavos, 270);
  assert.equal(nota.itens[1]!.ean, null);
  assert.equal(nota.itens[1]!.unidade, "KG");
  assert.equal(nota.descontosCentavos, 270);
  assert.equal(nota.totalCentavos, 2441);
});

test("anotações ditadas no mercado (exemplos reais da especificação)", () => {
  const casos: [string, string, number, "UN" | "KG", number, number][] = [
    ["2 arroz 4,13", "Arroz", 2, "UN", 4.13, 826],
    ["6 sabonetes 1,90 cada", "Sabonete", 6, "UN", 1.9, 1140],
    ["Escova de dente 14,90", "Escova de dente", 1, "UN", 14.9, 1490],
    ["Macaxeira 2,178kg o ela esta 4,00 por kg", "Macaxeira", 2.178, "KG", 4, 871],
    ["1,526kg batata esta 6,49 por kg", "Batata", 1.526, "KG", 6.49, 990],
    ["523 gramas banana da terra esta 6,99 o kg", "Banana da terra", 0.523, "KG", 6.99, 366],
  ];
  for (const [texto, descricao, quantidade, unidade, precoUnitario, valorCentavos] of casos) {
    assert.deepEqual(lerAnotacao(texto), { descricao, quantidade, unidade, precoUnitario, valorCentavos }, texto);
  }
  assert.throws(() => lerAnotacao("arroz"), /preço/);
  assert.throws(() => lerAnotacao("batata 6,49 o kg"), /peso/);
});

test("código de barras: EAN válido, UPC-A vira EAN-13, etiqueta de balança traz o valor", () => {
  assert.equal(gtinValido("7891000315507"), true);
  assert.deepEqual(lerCodigo("7891000315507"), { tipo: "ean", codigo: "7891000315507" });
  assert.deepEqual(lerCodigo("7891000315500"), { tipo: "invalido", motivo: "código de barras inválido (dígito verificador não confere)" });
  assert.deepEqual(lerCodigo("012345678905"), { tipo: "ean", codigo: "0012345678905" });
  assert.deepEqual(lerCodigo("2000360013373"), { tipo: "balanca", codigo: "2000360013373", prefixo: "200036", valorCentavos: 1337 });
  assert.deepEqual(lerCodigo("7891000315508").tipo, "invalido");
});

const anotados = (): Anotado[] =>
  ANOTADO.map(([descricao, quantidade, unidade, precoUnitario], i) => ({
    id: i + 1, descricao, produtoId: null, quantidade, unidade, precoUnitario, valorCentavos: valorLinha(quantidade, precoUnitario), emPromocao: false,
  }));
const linhas = (): LinhaNota[] => lerNota(TEXTO_SEFAZ).itens.map((l, i) => ({ ...l, id: 1000 + i, produtoId: null }));

test("conferência da compra de 31/10: fecha a conta como na especificação", () => {
  const c = conciliar(anotados(), linhas(), { descontosNotaCentavos: 1687, descontoManualCentavos: null, totalNotaCentavos: 95173 });
  assert.equal(c.resumo.totalAnotadoCentavos, 85600);
  assert.equal(c.resumo.divergenciasCentavos, 1198);
  assert.equal(c.resumo.naoAnotadosCentavos, 10062);
  assert.equal(c.resumo.naoEncontradosCentavos, 0);
  assert.equal(c.resumo.subtotalNotaCentavos, 96860);
  assert.equal(c.resumo.descontosCentavos, 1687);
  assert.equal(c.resumo.totalPagoCentavos, 95173);
  assert.equal(c.resumo.fechaConta, true);
  assert.equal(c.naoAnotados.length, 11);
  assert.deepEqual(
    c.naoAnotados.map((l) => l.descricao).sort(),
    ["BEB LAC GUTBOM AMEIX", "BISC.BULNEZ WAFER", "CEBOLA ATACADAO", "CR.DENTAL COLGATE", "MAMAO COMUM", "MEXIRICA COMUM", "OVO BULNEZ BCO PVC", "OVO PVC GDE VERMELHO", "SAC INST.BIO 60X70", "TEMP.MEU SEGREDO FRA", "TOMATE ITALIANO"],
  );
});

test("conferência: pares certos, agrupamentos e tipos de divergência", () => {
  const c = conciliar(anotados(), linhas(), { descontosNotaCentavos: 1687, descontoManualCentavos: null, totalNotaCentavos: 95173 });
  const par = (nome: string) => c.pares.find((p) => p.anotados[0]!.descricao === nome)!;
  // Cada anotação foi para a linha certa.
  const esperado: Record<string, string> = {
    Arroz: "ARROZ URBANO PARB.T1", "Arroz de sushi": "ARROZ URBANO SUSHI", Absorvente: "ABS.SYM NOITE/DIA", "Absorvente diário": "ABS.SEMPRE LIVRE",
    "Molho de tomate": "MOLHO QUERO TRAD", "Molho de tomate especial": "MOLHO PIZZA TAMBAU", "Biscoito maisena": "BISC.BULNEZ MAIZENA",
    Batata: "BATATA LAVADA", "Batata-doce": "BATATA DOCE", "Batata palha": "BATATA PALHA FREETAZ", Banana: "BANANA PACOVAN",
    "Banana-da-terra": "BANANA TERRA", "Karina karaoke": "KANI KAMA C.SUL", "Carne moída": "BOV.MUSCULO RESERVA", Queijo: "MUSS.GIROLANDA FAT",
    Manteiga: "MARG.QUALY", "Bucha de pratos": "ESPONJA SCOTCH-BRITE", Charque: "JERKEED B.DIANTEIRO", "Leite integral": "LEITE BETANIA INTEG.",
  };
  for (const [anotado, nota] of Object.entries(esperado)) assert.equal(par(anotado).linhas[0]!.descricao, nota, anotado);

  // Duas calabresas anotadas = uma linha com 2 unidades; um sabonete anotado = dois códigos na nota.
  assert.equal(par("Calabresa").anotados.length, 2);
  assert.equal(par("Calabresa").diferencaCentavos, 96);
  assert.equal(par("Sabonete").linhas.length, 2);
  assert.deepEqual(par("Sabonete").tipos, ["OK"]);

  assert.deepEqual(par("Desodorante").tipos, ["QUANTIDADE", "PRECO"]);
  assert.equal(par("Desodorante").diferencaCentavos, -617);
  assert.deepEqual(par("Macaxeira").tipos, ["PESO", "PRECO"]);
  assert.deepEqual(par("Cenoura").tipos, ["PESO"]);
  assert.deepEqual(par("Saco de lixo").tipos, ["PRECO"]);
  assert.deepEqual(par("Coxas (saco)").tipos, ["ARREDONDAMENTO"]);
  assert.equal(par("Manteiga").diferencaCentavos, 690);

  // Pares só por valor ou por nome "parecido" pedem confirmação.
  assert.equal(par("Karina karaoke").confianca, "provavel");
  assert.equal(par("Manteiga").confianca, "provavel");
  assert.equal(par("Feijão").confianca, "nome");

  // Alertas: a maior divergência vem primeiro; manteiga×margarina aparece para confirmar.
  assert.equal(c.alertas[0]!.texto, "Na nota e não anotado: OVO BULNEZ BCO PVC (R$ 33,98)");
  assert.ok(c.alertas.some((a) => a.tipo === "CONFIRMAR" && a.texto.includes("Manteiga")));
});

test("conferência: produto vinculado pareia pelo código, mesmo com nome que não parece", () => {
  const a = anotados();
  const l = linhas();
  a.find((x) => x.descricao === "Karina karaoke")!.produtoId = 7;
  l.find((x) => x.codigoLoja === "5688")!.produtoId = 7;
  const c = conciliar(a, l, { descontosNotaCentavos: null, descontoManualCentavos: null, totalNotaCentavos: null });
  assert.equal(c.pares.find((p) => p.anotados[0]!.descricao === "Karina karaoke")!.confianca, "codigo");
});

test("promoção: preço da nota acima do anotado = promoção não aplicada, e vira o primeiro alerta", () => {
  const a = anotados();
  a.find((x) => x.descricao === "Saco de lixo")!.emPromocao = true;
  a.find((x) => x.descricao === "Feijão")!.emPromocao = true;
  const c = conciliar(a, linhas(), { descontosNotaCentavos: null, descontoManualCentavos: null, totalNotaCentavos: null });
  assert.equal(c.pares.find((p) => p.anotados[0]!.descricao === "Saco de lixo")!.promocao, "nao_aplicada");
  assert.equal(c.pares.find((p) => p.anotados[0]!.descricao === "Feijão")!.promocao, "aplicada");
  assert.equal(c.alertas[0]!.tipo, "PROMOCAO_NAO_APLICADA");
});

test("desconto: o da nota vale; sem ele, o digitado à mão", () => {
  const sem = { descontosNotaCentavos: null, totalNotaCentavos: null } as const;
  const manual = conciliar(anotados(), linhas(), { ...sem, descontoManualCentavos: 1687 });
  assert.equal(manual.resumo.descontosFonte, "manual");
  assert.equal(manual.resumo.totalPagoCentavos, 95173);
  const nenhum = conciliar(anotados(), linhas(), { ...sem, descontoManualCentavos: null });
  assert.equal(nenhum.resumo.descontosFonte, "nenhum");
  assert.equal(nenhum.resumo.totalPagoCentavos, 96860);
});

test("anotação sem par sugere linhas da nota", () => {
  const a = [...anotados(), { id: 999, descricao: "Detergente", produtoId: null, quantidade: 1, unidade: "UN" as const, precoUnitario: 2.5, valorCentavos: 250, emPromocao: false }];
  const c = conciliar(a, linhas(), { descontosNotaCentavos: null, descontoManualCentavos: null, totalNotaCentavos: null });
  const sem = c.naoEncontrados.find((x) => x.id === 999)!;
  assert.ok(sem.sugestoes.length > 0 && sem.sugestoes.length <= 5);
  assert.equal(NOTA.length, 72);
});
