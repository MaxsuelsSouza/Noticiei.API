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

const extra: Topic[] = [
  ...topics,
  { slug: "vulnerabilidades", category: "curiosidades", keywords: ["cve", "re:cve-\\d{4}-\\d+", "ransomware", "exploit"] },
  { slug: "como-funciona", category: "curiosidades", keywords: ["re:how (?:the |a |an )?[\\p{L}\\p{N} .#+/'-]{2,40}? works?", "under the hood"] },
  { slug: "ia", category: "tecnologia", keywords: ["ai", "llm", "llms", "artificial intelligence"] },
  { slug: "chips-hardware", category: "mundo", keywords: ["chip", "chips", "tsmc"] },
];

test("palavra-chave com re: casa padrões como 'how X works' e números de CVE", () => {
  const how = classify({ title: "How DNS works", summary: "", tags: [] }, tech, extra);
  assert.deepEqual(how.topics, ["como-funciona"]);
  assert.equal(how.category, "curiosidades");
  const cve = classify({ title: "CVE-2026-41234 in OpenSSH", summary: "", tags: [] }, tech, extra);
  assert.equal(cve.topics[0], "vulnerabilidades");
  assert.equal(cve.category, "curiosidades");
  // não casa no meio de outra palavra
  assert.deepEqual(classify({ title: "Showcase of networks", summary: "", tags: [] }, tech, extra).topics, []);
});

test("fonte com lock_category nunca muda de categoria, mesmo com assunto forte", () => {
  const mitTr = { default_category: "mundo" as const, is_official: false, lock_category: true };
  const title = "AI AI AI: how LLMs and artificial intelligence change everything";
  assert.equal(classify({ title, summary: "", tags: [] }, world, extra).category, "tecnologia"); // sem trava: pula
  assert.equal(classify({ title, summary: "", tags: [] }, mitTr, extra).category, "mundo"); // com trava: fica
});

test("assunto de mundo em fonte de tecnologia leva o item para mundo", () => {
  const r = classify({ title: "TSMC starts new chip production", summary: "", tags: [] }, tech, extra);
  assert.equal(r.category, "mundo");
});
