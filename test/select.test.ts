import assert from "node:assert/strict";
import { test } from "node:test";
import { selectDigest, type Candidate, type Weights } from "../src/digest/select.js";

const noWeights: Weights = { topic: new Map(), format: new Map() };
let nextId = 1;
const make = (category: Candidate["category"], topics: string[], engagement = 0, format = "geral"): Candidate => ({
  id: nextId++, category, topics, format, engagement, sourceType: "rss",
});

test("preenche as cotas 4/4/4/1 sem repetir item", () => {
  const candidates = [
    ...Array.from({ length: 10 }, (_, i) => make("tecnologia", [`t${i}`])),
    ...Array.from({ length: 6 }, (_, i) => make("curiosidades", [`c${i}`])),
    ...Array.from({ length: 6 }, (_, i) => make("mundo", [`m${i}`])),
  ];
  const picks = selectDigest(candidates, noWeights, undefined, () => 0);
  assert.equal(picks.length, 13);
  assert.equal(new Set(picks.map((p) => p.id)).size, 13);
  const count = (slot: string) => picks.filter((p) => p.slot === slot).length;
  assert.deepEqual([count("tecnologia"), count("curiosidades"), count("mundo"), count("aleatorio")], [4, 4, 4, 1]);
  assert.equal(picks.filter((p) => p.isExploration).length, 1);
});

test("no máximo 2 itens do mesmo assunto", () => {
  const candidates = Array.from({ length: 10 }, () => make("tecnologia", ["dotnet"]));
  const picks = selectDigest(candidates, noWeights, undefined, () => 0);
  assert.ok(picks.length <= 2);
});

test("perfil de interesse ordena por peso e falta de categoria é completada com tecnologia", () => {
  const liked = make("tecnologia", ["mensageria"]);
  const others = Array.from({ length: 8 }, (_, i) => make("tecnologia", [`x${i}`]));
  const weights: Weights = {
    topic: new Map([["mensageria", 1], ...others.map((o) => [o.topics[0]!, 0.5] as [string, number])]),
    format: new Map(),
  };
  const picks = selectDigest([...others, liked], weights, undefined, () => 0);
  assert.equal(picks[0]!.id, liked.id);
  assert.equal(picks.length, 9); // só há 9 candidatos: todos entram, completando as cotas vazias
});

test("assuntos com peso alto ganham dentro da categoria (vulnerabilidade antes de ciência)", () => {
  const ciencia = Array.from({ length: 4 }, () => make("curiosidades", ["ciencia"], 100));
  const vulns = [make("curiosidades", ["vulnerabilidades"]), make("curiosidades", ["vulnerabilidades"])];
  const comoFunciona = [make("curiosidades", ["como-funciona"]), make("curiosidades", ["como-funciona"])];
  const weights: Weights = {
    topic: new Map([["ciencia", 0.35], ["vulnerabilidades", 0.95], ["como-funciona", 0.95]]),
    format: new Map(),
  };
  const picks = selectDigest([...ciencia, ...vulns, ...comoFunciona], weights, undefined, () => 0);
  // as 4 vagas da cota (as primeiras escolhidas); depois disso a sobra de outras categorias é completada com o que houver
  const curiosidades = picks.filter((p) => p.slot === "curiosidades").slice(0, 4).map((p) => p.id);
  assert.deepEqual(new Set(curiosidades), new Set([...vulns, ...comoFunciona].map((c) => c.id)));
});
