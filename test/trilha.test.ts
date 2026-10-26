import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExtras } from "../src/trilha/parse.js";

const valid = {
  topics: { "3:0": { note: "  revisar CAP  ", links: [{ title: null, url: "https://x.dev/cap" }] }, "3:t5": { note: "", links: [] } },
  overrides: { "3:1": { title: "Vídeo melhor", url: "https://youtu.be/abc" } },
  children: { "3:m6": [{ title: "Parte 1", url: "https://curso.dev/1" }] },
  addedTopics: { 3: [{ id: 5, name: "Raft", level: 2 }] },
  addedMaterials: { 3: [{ id: 6, title: "Curso de DDIA", url: "https://curso.dev" }] },
  nextId: 2,
};

test("trilha: aceita o formato do app, apara textos e corrige o próximo id", () => {
  const extras = parseExtras(valid);
  assert.equal(extras.topics["3:0"]!.note, "revisar CAP");
  assert.deepEqual(extras.topics["3:t5"], { note: "", links: [] });
  assert.equal(extras.addedTopics[3]![0]!.level, 2);
  assert.equal(extras.nextId, 7); // maior id usado (6) + 1
});

test("trilha: corpo vazio vira personalização vazia", () => {
  assert.deepEqual(parseExtras({}), { topics: {}, overrides: {}, children: {}, addedTopics: {}, addedMaterials: {}, nextId: 1 });
});

test("trilha: recusa chave, link, nível ou id inválidos", () => {
  assert.throws(() => parseExtras({ topics: { "abc": { note: "x", links: [] } } }), /chave inválida/);
  assert.throws(() => parseExtras({ overrides: { "1:0": { title: "x" } } }), /url é obrigatório/);
  assert.throws(() => parseExtras({ addedTopics: { 1: [{ id: 1, name: "x", level: 3 }] } }), /level/);
  assert.throws(() => parseExtras({ addedTopics: { 1: [{ id: 1, name: "a", level: 1 }] }, addedMaterials: { 1: [{ id: 1, title: "b", url: "https://b.dev" }] } }), /id repetido/);
  assert.throws(() => parseExtras(null), /objeto/);
});
