import assert from "node:assert/strict";
import { test } from "node:test";
import { nextMonth, parseConta, proxima } from "../src/contas/parse.js";

const base = { nome: "Conta de luz", valorCentavos: 18743, vencimento: "2026-10-25" };

test("parseConta aplica os padrões: uma vez, lembretes ligados, sem código", () => {
  assert.deepEqual(parseConta({ ...base, nome: "  Conta de luz ", codigo: " " }), {
    ...base,
    repeticao: "uma_vez",
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
});

test("proxima: mensal sempre, parcelas até a última, uma vez nunca", () => {
  const mensal = parseConta({ ...base, repeticao: "mensal" });
  assert.equal(proxima(mensal)?.vencimento, "2026-11-25");
  const parcela = parseConta({ ...base, repeticao: "parcelas", parcelasTotal: 3, parcelaAtual: 2 });
  assert.equal(proxima(parcela)?.parcelaAtual, 3);
  assert.equal(proxima({ ...parcela, parcelaAtual: 3 }), null);
  assert.equal(proxima(parseConta(base)), null);
});
