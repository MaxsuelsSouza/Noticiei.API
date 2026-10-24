import assert from "node:assert/strict";
import { test } from "node:test";
import { nextMonth, parseConta, proxima } from "../src/contas/parse.js";

const base = { nome: "Conta de luz", valorCentavos: 18743, vencimento: "2026-10-25" };

test("parseConta aplica os padrões: uma vez, lembretes ligados, sem código", () => {
  assert.deepEqual(parseConta({ ...base, nome: "  Conta de luz ", codigo: " " }), {
    ...base,
    valorVariavel: false,
    repeticao: "uma_vez",
    diaVencimento: null,
    parcelaAtual: null,
    parcelasTotal: null,
    codigo: null,
    lembreteVespera: true,
    lembreteDia: true,
    lembreteInsistir: true,
  });
});

test("parseConta exige parcelas coerentes e ignora parcelas fora do modo parcelas", () => {
  assert.equal(parseConta({ ...base, repeticao: "parcelas", parcelasTotal: 12, parcelaAtual: 4 }).parcelaAtual, 4);
  assert.equal(parseConta({ ...base, repeticao: "parcelas", parcelasTotal: 3 }).parcelaAtual, 1);
  assert.throws(() => parseConta({ ...base, repeticao: "parcelas", parcelasTotal: 3, parcelaAtual: 4 }), /parcelaAtual/);
  assert.throws(() => parseConta({ ...base, repeticao: "parcelas" }), /parcelasTotal/);
  assert.equal(parseConta({ ...base, repeticao: "mensal", parcelasTotal: 3 }).parcelasTotal, null);
});

test("parseConta: valor é opcional; repetição guarda o dia fixo do mês", () => {
  assert.equal(parseConta({ nome: "Energia", vencimento: "2026-11-16" }).valorCentavos, null);
  const energia = parseConta({ nome: "Energia", vencimento: "2026-11-16", repeticao: "mensal", valorVariavel: true });
  assert.equal(energia.diaVencimento, 16);
  assert.equal(energia.valorVariavel, true);
  assert.equal(parseConta({ ...base, repeticao: "mensal", diaVencimento: 31 }).diaVencimento, 31);
  assert.equal(parseConta({ ...base, valorVariavel: true }).valorVariavel, false);
  assert.throws(() => parseConta({ ...base, repeticao: "mensal", diaVencimento: 32 }), /diaVencimento/);
});

test("parseConta recusa valor, data e repetição inválidos", () => {
  assert.throws(() => parseConta({ ...base, valorCentavos: 0 }), /valorCentavos/);
  assert.throws(() => parseConta({ ...base, valorCentavos: 18.5 }), /valorCentavos/);
  assert.throws(() => parseConta({ ...base, vencimento: "2026-02-30" }), /vencimento/);
  assert.throws(() => parseConta({ ...base, repeticao: "anual" }), /repeticao/);
  assert.throws(() => parseConta({ ...base, nome: "" }), /nome/);
  assert.throws(() => parseConta({ ...base, lembreteDia: "sim" }), /lembreteDia/);
});

test("nextMonth mantém o dia e encurta no fim de mês", () => {
  assert.equal(nextMonth("2026-10-25"), "2026-11-25");
  assert.equal(nextMonth("2026-01-31"), "2026-02-28");
  assert.equal(nextMonth("2028-01-31"), "2028-02-29");
  assert.equal(nextMonth("2026-12-10"), "2027-01-10");
  // "Todo dia 31": encurta em fevereiro e volta ao 31 em março.
  assert.equal(nextMonth("2026-02-28", 31), "2026-03-31");
});

test("proxima: mensal sempre, parcelas até a última, uma vez nunca", () => {
  const mensal = parseConta({ ...base, repeticao: "mensal" });
  assert.equal(proxima(mensal)?.vencimento, "2026-11-25");
  const parcela = parseConta({ ...base, repeticao: "parcelas", parcelasTotal: 3, parcelaAtual: 2 });
  assert.equal(proxima(parcela)?.parcelaAtual, 3);
  assert.equal(proxima({ ...parcela, parcelaAtual: 3 }), null);
  assert.equal(proxima(parseConta(base)), null);
  const energia = parseConta({ ...base, repeticao: "mensal", valorVariavel: true });
  assert.equal(proxima(energia)?.valorCentavos, null);
  assert.equal(proxima(mensal)?.valorCentavos, 18743);
});
