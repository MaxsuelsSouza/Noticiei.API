import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, detectFormat, type Topic } from "../src/curation/classify.js";
import { detectLanguage } from "../src/curation/language.js";

const topics: Topic[] = [
  { slug: "csharp", category: "tecnologia", keywords: ["c#", "csharp"] },
  { slug: "mensageria", category: "tecnologia", keywords: ["rabbitmq", "kafka", "queue"] },
  { slug: "cloud", category: "tecnologia", keywords: ["cloud", "azure"] },
  { slug: "espaco", category: "curiosidades", keywords: ["nasa", "mars"] },
];
const tech = { default_category: "tecnologia" as const, is_official: false };
const world = { default_category: "mundo" as const, is_official: false };

test("título pesa mais que o corpo e c# casa com borda correta", () => {
  const result = classify({ title: "What's new in C# 14", summary: "kafka", tags: [] }, tech, topics);
  assert.deepEqual(result.topics, ["csharp"]);
  assert.equal(result.category, "tecnologia");
});

test("tags valem como título", () => {
  const result = classify({ title: "Some post", summary: "", tags: ["rabbitmq"] }, tech, topics);
  assert.deepEqual(result.topics, ["mensageria"]);
});

test("fonte de mundo não vira tecnologia por um sinal fraco", () => {
  const result = classify({ title: "Storm cloud over the city", summary: "", tags: [] }, world, topics);
  assert.equal(result.category, "mundo");
});

test("sem assunto cai na categoria padrão da fonte", () => {
  assert.equal(classify({ title: "Hello", summary: "", tags: [] }, world, topics).category, "mundo");
});

test("formatos", () => {
  const f = (title: string, official = false) => detectFormat({ title, tags: [] }, { is_official: official });
  assert.equal(f("How we migrated to Kafka"), "case-real");
  assert.equal(f("How the GC works under the hood"), "como-funciona");
  assert.equal(f("How to build a queue in C#"), "tutorial");
  assert.equal(f("Why I stopped using ORMs"), "opiniao");
  assert.equal(f("Announcing .NET 11"), "novidade");
  assert.equal(f("EF Core 11.0 preview"), "novidade");
  assert.equal(f("Ideas about code", true), "novidade");
  assert.equal(f("Ideas about code"), "geral");
});

test("idioma por trigramas, com fallback para texto curto", () => {
  assert.equal(detectLanguage("O governo anunciou hoje novas medidas para conter a inflação no país", "en"), "pt");
  assert.equal(detectLanguage("The government announced new measures today to curb inflation in the country", "pt"), "en");
  assert.equal(detectLanguage("Oi", "pt"), "pt");
});
