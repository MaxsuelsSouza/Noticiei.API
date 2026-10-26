import assert from "node:assert/strict";
import { test } from "node:test";
import { pickFollowed, selectDigest, type Candidate, type Weights } from "../src/digest/select.js";

const noWeights: Weights = { topic: new Map(), format: new Map() };
let nextId = 1;
const make = (category: Candidate["category"], topics: string[], engagement = 0, format = "geral"): Candidate => ({
  id: nextId++, category, topics, format, engagement, sourceType: "rss",
});

test("preenche as cotas 4/4/3/4/4 e um item por blog acompanhado, sem repetir item", () => {
  const follow = (key: string, sourceType = "rss") => ({ ...make("acompanhar", []), followKey: key, sourceType });
  const candidates = [
    ...Array.from({ length: 10 }, (_, i) => make("tecnologia", [`t${i}`])),
    ...Array.from({ length: 6 }, (_, i) => make("hackernews", [`h${i}`])),
    ...Array.from({ length: 6 }, (_, i) => make("curiosidades", [`c${i}`])),
    ...Array.from({ length: 6 }, (_, i) => make("mundo", [`m${i}`])),
    ...Array.from({ length: 6 }, () => make("aleatorio", [])),
    follow("netflix"), follow("netflix", "popular"), follow("slack", "popular"),
  ];
  const picks = selectDigest(candidates, noWeights, undefined, () => 0);
  assert.equal(new Set(picks.map((p) => p.id)).size, picks.length);
  const count = (slot: string) => picks.filter((p) => p.slot === slot).length;
  assert.deepEqual(
    ["tecnologia", "hackernews", "curiosidades", "mundo", "acompanhar", "aleatorio"].map(count),
    [4, 4, 3, 4, 2, 4],
  );
  assert.equal(picks.filter((p) => p.isExploration).length, 1);
});

test("Para acompanhar: o post novo mais recente do blog; sem novidade, o mais popular", () => {
  const at = (key: string, sourceType: string, publishedAt: number, engagement = 0) => ({
    ...make("acompanhar", [], engagement), followKey: key, sourceType, publishedAt,
  });
  const novoAntigo = at("netflix", "rss", 1);
  const novoRecente = at("netflix", "rss", 2);
  const popularNetflix = at("netflix", "popular", 0, 900);
  const poucoPopular = at("stripe", "popular", 0, 30);
  const maisPopular = at("stripe", "popular", 0, 800);
  const chosen = pickFollowed([novoAntigo, novoRecente, popularNetflix, poucoPopular, maisPopular, make("tecnologia", [])]);
  assert.deepEqual(chosen.map((c) => c.id), [novoRecente.id, maisPopular.id]);
});

test("no máximo 2 itens da mesma fonte por seção", () => {
  const sameSource = Array.from({ length: 6 }, (_, i) => ({ ...make("hackernews", [`s${i}`], 100), sourceId: 1 }));
  const other = Array.from({ length: 3 }, (_, i) => ({ ...make("hackernews", [`o${i}`]), sourceId: 2 }));
  const picks = selectDigest([...sameSource, ...other], noWeights, undefined, () => 0);
  const hn = picks.filter((p) => p.slot === "hackernews").slice(0, 4).map((p) => p.id);
  assert.equal(hn.filter((id) => sameSource.some((c) => c.id === id)).length, 2);
});

test("aleatório só usa as fontes de aleatório, e não completa as outras seções", () => {
  const tech = Array.from({ length: 10 }, (_, i) => make("tecnologia", [`t${i}`], 1000));
  const odd = make("aleatorio", []);
  const picks = selectDigest([...tech, odd], noWeights, undefined, () => 0);
  assert.deepEqual(picks.filter((p) => p.slot === "aleatorio").map((p) => p.id), [odd.id]);
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

test("assuntos com peso alto ganham dentro da categoria (\"como funciona\" antes de ciência)", () => {
  const ciencia = Array.from({ length: 4 }, () => make("curiosidades", ["ciencia"], 100));
  const comoFunciona = [make("curiosidades", ["como-funciona"]), make("curiosidades", ["como-funciona"])];
  const weights: Weights = { topic: new Map([["ciencia", 0.35], ["como-funciona", 0.95]]), format: new Map() };
  const picks = selectDigest([...ciencia, ...comoFunciona], weights, undefined, () => 0);
  // as 2 primeiras vagas da cota de 3; depois disso a sobra de outras categorias é completada com o que houver
  const curiosidades = picks.filter((p) => p.slot === "curiosidades").slice(0, 2).map((p) => p.id);
  assert.deepEqual(new Set(curiosidades), new Set(comoFunciona.map((c) => c.id)));
});
