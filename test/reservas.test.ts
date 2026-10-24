import assert from "node:assert/strict";
import { test } from "node:test";
import { isDia, isMes, parseDados } from "../src/reservas/parse.js";

test("isDia aceita só datas que existem", () => {
  assert.equal(isDia("2026-10-27"), true);
  assert.equal(isDia("2028-02-29"), true);
  assert.equal(isDia("2026-02-29"), false);
  assert.equal(isDia("2026-13-01"), false);
  assert.equal(isDia("27/10/2026"), false);
});

test("isMes aceita YYYY-MM", () => {
  assert.equal(isMes("2026-10"), true);
  assert.equal(isMes("2026-00"), false);
  assert.equal(isMes("2026-1"), false);
});

test("parseDados apara os textos e trata observação vazia como nula", () => {
  assert.deepEqual(parseDados({ nome: "  Ana ", telefone: "(81) 99999-0000", observacao: "  ", pago: true }), {
    nome: "Ana",
    telefone: "(81) 99999-0000",
    observacao: null,
    pago: true,
  });
});

test("parseDados recusa nome ou telefone faltando e pago que não é booleano", () => {
  assert.throws(() => parseDados({ telefone: "1" }), /nome é obrigatório/);
  assert.throws(() => parseDados({ nome: "Ana", telefone: " " }), /telefone é obrigatório/);
  assert.throws(() => parseDados({ nome: "Ana", telefone: "1", pago: "sim" }), /pago deve ser/);
  assert.throws(() => parseDados(null), /objeto JSON/);
});
