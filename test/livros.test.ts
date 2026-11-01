/**
 * Livros de ponta a ponta, pelas rotas da função da trilha, contra um Postgres em memória (PGlite):
 * LivreQ publica o catálogo → celular escreve (salvamento automático) e lança ideia → LivreQ busca os novos,
 * marca "já usei" e importa as ideias → celular continua o texto e ele volta a ser novo.
 * Precisa de --experimental-test-module-mocks.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { criarBanco } from "./support/pglite-sql.js";
import { contarPalavras, lerCatalogo, lerIdeia, lerTexto } from "../src/livros/parse.js";

process.env.APP_API_KEY = "chave-app";
process.env.LIVREQ_API_KEY = "chave-livreq";
const { sql } = await criarBanco();
mock.module(new URL("../src/db.ts", import.meta.url).href, { namedExports: { sql: () => sql } });
mock.module(new URL("../src/migrate.ts", import.meta.url).href, { namedExports: { migrate: async () => [] } });

const trilha = await import("../api/trilha.js");
const { rotaLivros } = await import("../src/livros/rotas.js");

async function chamar(metodo: "GET" | "PUT" | "POST" | "DELETE", rota: string, body?: unknown, chave = "chave-app") {
  // Metade como a Vercel entrega depois do rewrite (?livros=), metade pelo caminho original.
  const [caminho, query] = rota.split("?");
  const url = rota.length % 2
    ? `https://x.app/api/trilha?livros=${encodeURIComponent(caminho!)}${query ? `&${query}` : ""}`
    : `https://x.app/api/livros/${rota}`;
  const r = await trilha[metodo](new Request(url, {
    method: metodo, headers: { "x-api-key": chave, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: r.status, body: (await r.json()) as any };
}

const GRUPO = "grp-aren-0001";
const LIVRO1 = "lvr-portao-0001";
const LIVRO2 = "lvr-mare-000002";
const AVULSO = "lvr-contos-0003";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const I1 = "33333333-3333-4333-8333-333333333333";
const I2 = "44444444-4444-4444-8444-444444444444";

const catalogo = (livros = [LIVRO1, LIVRO2, AVULSO]) => ({
  grupos: [{ id: GRUPO, nome: "Crônicas de Aren" }],
  livros: [
    { id: LIVRO1, grupoId: GRUPO, titulo: "O Portão de Sal", volume: 1, palavras: 42310, capitulos: 18, ultimaEscritaEm: "2026-11-01T21:00:00Z" },
    { id: LIVRO2, grupoId: GRUPO, titulo: "A Maré Vermelha", volume: 2, palavras: 6902, capitulos: 3 },
    { id: AVULSO, titulo: "Contos de Olinda", palavras: 11480, capitulos: 7 },
  ].filter((l) => livros.includes(l.id)),
});

test("validação: catálogo, texto e ideia", () => {
  assert.throws(() => lerCatalogo({ grupos: [], livros: [{ id: "curto", titulo: "x" }] }), /id inválido/);
  assert.throws(() => lerCatalogo({ grupos: [], livros: [{ id: LIVRO1, grupoId: GRUPO, titulo: "x" }] }), /não está nos grupos/);
  assert.throws(() => lerCatalogo({ grupos: [], livros: [{ id: LIVRO1, titulo: "" }] }), /titulo é obrigatório/);
  assert.throws(() => lerTexto({ livroId: LIVRO1, texto: "x".repeat(200_001) }), /passa de/);
  assert.throws(() => lerIdeia({ texto: "  " }), /precisa de texto/);
  assert.deepEqual(lerIdeia({ titulo: "Só título" }), { grupoId: null, titulo: null, texto: "Só título" });
  assert.equal(contarPalavras("  Ninguém ouviu\nquando   Iara — soltou "), 5);
});

test("roteamento: rewrite e caminho direto; a trilha continua a mesma", () => {
  assert.deepEqual(rotaLivros(new URL("https://x/api/trilha?livros=textos/abc/usado")), ["textos", "abc", "usado"]);
  assert.deepEqual(rotaLivros(new URL("https://x/api/livros/catalogo")), ["catalogo"]);
  assert.equal(rotaLivros(new URL("https://x/api/trilha")), null);
});

test("sem chave: 401; a chave do LivreQ não abre a trilha", async () => {
  assert.equal((await chamar("GET", "catalogo", undefined, "errada")).status, 401);
  const r = await trilha.GET(new Request("https://x.app/api/trilha", { headers: { "x-api-key": "chave-livreq" } }));
  assert.equal(r.status, 401);
});

test("LivreQ publica o catálogo e o celular lê os livros", async () => {
  const vazio = await chamar("GET", "catalogo");
  assert.deepEqual([vazio.body.livros, vazio.body.catalogoEm], [[], null]);

  const r = await chamar("PUT", "catalogo", catalogo(), "chave-livreq");
  assert.deepEqual([r.status, r.body], [200, { grupos: 1, livros: 3 }]);

  const l = await chamar("GET", "catalogo");
  assert.equal(l.body.grupos[0].nome, "Crônicas de Aren");
  assert.deepEqual(l.body.livros.map((x: any) => [x.titulo, x.grupoId, x.novos]), [
    ["O Portão de Sal", GRUPO, 0], ["A Maré Vermelha", GRUPO, 0], ["Contos de Olinda", null, 0],
  ]);
  assert.ok(l.body.catalogoEm);
});

test("celular: salvamento automático não duplica e só conta como mudança quando muda", async () => {
  const a = await chamar("PUT", `textos/${T1}`, { livroId: LIVRO1, titulo: "A fuga pelo cais", texto: "Ninguém ouviu" });
  assert.deepEqual([a.status, a.body.palavras, a.body.novo], [200, 2, true]);
  const b = await chamar("PUT", `textos/${T1}`, { livroId: LIVRO1, titulo: "A fuga pelo cais", texto: "Ninguém ouviu quando Iara soltou as amarras." });
  assert.equal(b.body.palavras, 7);
  assert.equal(b.body.criadoEm, a.body.criadoEm);
  // Reenvio igual (ex.: fila depois de ficar sem rede) não mexe em atualizado_em.
  const c = await chamar("PUT", `textos/${T1}`, { livroId: LIVRO1, titulo: "A fuga pelo cais", texto: "Ninguém ouviu quando Iara soltou as amarras." });
  assert.equal(c.body.atualizadoEm, b.body.atualizadoEm);

  await chamar("PUT", `textos/${T2}`, { livroId: LIVRO1, texto: "— Você acha que o portão abre?" });
  assert.equal((await chamar("PUT", `textos/${I1}`, { livroId: "lvr-nao-existe", texto: "x" })).status, 404);
  assert.equal((await chamar("PUT", "textos/nao-e-uuid", { livroId: LIVRO1, texto: "x" })).status, 404);

  const livro = await chamar("GET", "catalogo");
  assert.deepEqual(livro.body.livros.find((x: any) => x.id === LIVRO1)!.novos, 2);
  const textos = await chamar("GET", `textos?livro=${LIVRO1}`);
  assert.equal(textos.body.textos.length, 2);
});

test("apagar no celular com Desfazer; apagado some do LivreQ", async () => {
  const d = await chamar("DELETE", `textos/${T2}`);
  assert.ok(d.body.apagadoEm);
  let pend = await chamar("GET", "textos?pendentes=1", undefined, "chave-livreq");
  assert.deepEqual(pend.body.textos.map((t: any) => t.id), [T1]);
  // Salvar um texto apagado não o ressuscita.
  await chamar("PUT", `textos/${T2}`, { livroId: LIVRO1, texto: "— Você acha que o portão abre? Mudou." });
  pend = await chamar("GET", "textos?pendentes=1", undefined, "chave-livreq");
  assert.equal(pend.body.textos.length, 1);
  await chamar("DELETE", `textos/${T2}?desfazer=1`);
  pend = await chamar("GET", "textos?pendentes=1", undefined, "chave-livreq");
  assert.equal(pend.body.textos.length, 2);
});

test("LivreQ marca \"já usei\"; continuar no celular faz o texto voltar como \"continuou\"", async () => {
  const u = await chamar("POST", `textos/${T1}/usado`, { usado: true }, "chave-livreq");
  assert.deepEqual([u.body.novo, u.body.continuou], [false, false]);
  let pend = await chamar("GET", "textos?pendentes=1", undefined, "chave-livreq");
  assert.deepEqual(pend.body.textos.map((t: any) => t.id), [T2]);
  // Usado continua na lista do livro (seção "Já usados").
  const doLivro = await chamar("GET", `textos?livro=${LIVRO1}`);
  assert.equal(doLivro.body.textos.length, 2);

  await new Promise((r) => setTimeout(r, 15));
  const cont = await chamar("PUT", `textos/${T1}`, { livroId: LIVRO1, titulo: "A fuga pelo cais", texto: "Ninguém ouviu quando Iara soltou as amarras. Ela correu." });
  assert.deepEqual([cont.body.novo, cont.body.continuou], [true, true]);
  pend = await chamar("GET", "textos?pendentes=1", undefined, "chave-livreq");
  assert.equal(pend.body.textos.length, 2);

  const volta = await chamar("POST", `textos/${T1}/usado`, { usado: false }, "chave-livreq");
  assert.deepEqual([volta.body.usadoEm, volta.body.novo, volta.body.continuou], [null, true, false]);
  assert.equal((await chamar("POST", `textos/${T1}/usado`, {}, "chave-livreq")).status, 400);
});

test("ideias: lança no celular, LivreQ importa uma vez, depois não muda mais pelo celular", async () => {
  assert.equal((await chamar("PUT", `ideias/${I1}`, { titulo: "Mercado de memórias", texto: "Lembranças por comida em 2090." })).status, 200);
  assert.equal((await chamar("PUT", `ideias/${I2}`, { grupoId: GRUPO, texto: "Irmão gêmeo do outro lado do portão." })).status, 200);
  assert.equal((await chamar("PUT", `ideias/${I2}`, { grupoId: "grp-nao-existe", texto: "x" })).status, 404);

  let novas = await chamar("GET", "ideias?novas=1", undefined, "chave-livreq");
  assert.deepEqual(novas.body.ideias.map((i: any) => [i.id, i.grupoId]), [[I1, null], [I2, GRUPO]]);

  const imp = await chamar("POST", "ideias/importadas", { ids: [I1, I2] }, "chave-livreq");
  assert.equal(imp.body.importadas, 2);
  novas = await chamar("GET", "ideias?novas=1", undefined, "chave-livreq");
  assert.equal(novas.body.ideias.length, 0);
  // Importar de novo (aviso repetido) não quebra.
  assert.equal((await chamar("POST", "ideias/importadas", { ids: [I1] }, "chave-livreq")).body.importadas, 1);

  const todas = await chamar("GET", "ideias");
  assert.ok(todas.body.ideias.every((i: any) => i.importadaEm));
  assert.equal((await chamar("PUT", `ideias/${I1}`, { texto: "mudei" })).status, 409);
  assert.equal((await chamar("POST", "ideias/importadas", { ids: ["x"] }, "chave-livreq")).status, 400);
});

test("catálogo sem um livro: some da lista, os textos ficam guardados e voltam com ele", async () => {
  await chamar("PUT", "catalogo", catalogo([LIVRO2, AVULSO]), "chave-livreq");
  let l = await chamar("GET", "catalogo");
  assert.deepEqual(l.body.livros.map((x: any) => x.id), [LIVRO2, AVULSO]);
  assert.equal((await chamar("GET", `textos?livro=${LIVRO1}`)).body.textos.length, 2);

  await chamar("PUT", "catalogo", catalogo(), "chave-livreq");
  l = await chamar("GET", "catalogo");
  assert.equal(l.body.livros.length, 3);
  assert.equal(l.body.livros.find((x: any) => x.id === LIVRO1)!.textos, 2);
});
