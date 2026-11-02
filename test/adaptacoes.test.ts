/**
 * Adaptações: regras puras e o fluxo inteiro contra um Postgres em memória (PGlite), com as fontes (TMDB, Wikidata,
 * Open Library, NYT) trocadas por respostas gravadas. Dados inventados.
 * Precisa de --experimental-test-module-mocks.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { criarBanco } from "./support/pglite-sql.js";
import { abaDe, faseDe, mesmoAutor, mesmoTitulo, normalizar, nota, notaLeitores, notaNyt, notaPopularidade } from "../src/adaptacoes/regras.js";
import { lerDocOL, lerNyt, lerProducao, lerWikidata, somarMeses } from "../src/adaptacoes/fontes.js";

process.env.APP_API_KEY = "chave-app";
process.env.TMDB_API_KEY = "t".repeat(32);
process.env.NYT_API_KEY = "chave-nyt";
const { sql } = await criarBanco();
mock.module(new URL("../src/db.ts", import.meta.url).href, { namedExports: { sql: () => sql } });
mock.module(new URL("../src/migrate.ts", import.meta.url).href, { namedExports: { migrate: async () => [] } });

const trilha = await import("../api/trilha.js");
const { runAdaptacoes } = await import("../src/adaptacoes/coleta.js");
const { rotaAdaptacoes, lerEscolha } = await import("../src/adaptacoes/rotas.js");

const HOJE = "2026-11-02";

// ---------------------------------------------------------------- regras

test("fase: status do TMDB + data", () => {
  assert.equal(faseDe("filme", "Rumored", null, HOJE), null);
  assert.equal(faseDe("filme", "Planned", "2027-06-01", HOJE), "anunciado");
  assert.equal(faseDe("filme", "In Production", "2027-06-01", HOJE), "producao");
  assert.equal(faseDe("filme", "Post Production", null, HOJE), "pos");
  assert.equal(faseDe("filme", "Post Production", "2027-03-14", HOJE), "com_data");
  assert.equal(faseDe("filme", "Released", "2026-10-01", HOJE), "lancado");
  assert.equal(faseDe("filme", "Canceled", "2027-03-14", HOJE), "cancelado");
  assert.equal(faseDe("serie", "Planned", "2027-01-22", HOJE), "com_data");
  assert.equal(faseDe("serie", "In Production", null, HOJE), "producao");
  assert.equal(faseDe("serie", "Pilot", null, HOJE), "anunciado");
  assert.equal(faseDe("serie", "Returning Series", "2025-01-01", HOJE), "lancado");
  assert.deepEqual(["com_data", "pos", "lancado"].map((f) => abaDe(f as never)), ["data", "anunciados", null]);
});

test("nota: NYT até 50, leitores até 30, popularidade até 20", () => {
  assert.equal(notaNyt(null, null), 0);
  assert.equal(notaNyt(52, 1), 50);
  assert.equal(notaNyt(41, 1), 43);
  assert.equal(notaNyt(1, 15), 2); // 1 semana em #15 quase não pesa
  assert.equal(notaLeitores(0), 0);
  assert.equal(notaLeitores(5000), 30);
  assert.equal(notaLeitores(50_000), 30);
  assert.ok(notaLeitores(100) > 10 && notaLeitores(100) < 20);
  assert.equal(notaPopularidade(80, [80, 40, 10, 60]), 20);
  assert.equal(notaPopularidade(10, [80, 40, 10, 60]), 0);
  // Clássico sem NYT entra pelos leitores
  assert.equal(nota({ nytSemanas: null, nytMelhor: null, leitores: 4000 }, 10, [10, 20]).total, 29);
  assert.deepEqual(nota(null, 20, [10, 20]), { total: 20, nyt: 0, leitores: 0, popularidade: 20 });
});

test("títulos e autores", () => {
  assert.equal(normalizar("The Winter's Lighthouse!"), "winter s lighthouse");
  assert.equal(normalizar("O Farol de Inverno"), "farol de inverno");
  assert.ok(mesmoTitulo("Dune: Part Two", "Dune"));
  assert.ok(mesmoTitulo("THE WINTER LIGHTHOUSE", "The Winter Lighthouse"));
  assert.ok(!mesmoTitulo("Dune", "Dune Messiah"));
  assert.ok(mesmoAutor("Andy Weir", "Weir, Andy"));
  assert.ok(!mesmoAutor("Andy Weir", "Andy Warhol"));
  assert.equal(somarMeses("2026-11-02", 24), "2028-11-02");
});

test("leitura das fontes", () => {
  const p = lerProducao("filme", {
    id: 1, title: "O Farol", original_title: "The Lighthouse", status: "Post Production", release_date: "2027-03-14",
    popularity: 12.5, poster_path: "/x.jpg",
    credits: { crew: [{ job: "Director", name: "A. Moreira" }, { job: "Novel", name: "Helena Mateus" }] },
    release_dates: { results: [{ iso_3166_1: "BR", release_dates: [{ type: 1, release_date: "2027-01-01T00:00:00Z" }, { type: 3, release_date: "2027-04-02T00:00:00.000Z" }] }] },
  });
  assert.deepEqual([p.titulo, p.tituloOriginal, p.estreia, p.estreiaBr, p.direcao, p.autorCreditado, p.capa],
    ["O Farol", "The Lighthouse", "2027-03-14", "2027-04-02", "A. Moreira", "Helena Mateus", "https://image.tmdb.org/t/p/w342/x.jpg"]);
  const s = lerProducao("serie", { id: 2, name: "Cidade", original_name: "Cidade", first_air_date: "", aggregate_credits: { crew: [{ name: "R. Nunes", jobs: [{ job: "Novel" }] }] } });
  assert.deepEqual([s.tituloOriginal, s.estreia, s.autorCreditado], [null, null, "R. Nunes"]);

  const wd = lerWikidata({ results: { bindings: [
    { tmdb: { value: "7" }, livro: { value: "http://www.wikidata.org/entity/Q5" }, livroLabel: { value: "Salt City" }, autorLabel: { value: "Rafael Nunes" }, ano: { value: "2015" } },
    { tmdb: { value: "7" }, livro: { value: "http://www.wikidata.org/entity/Q5" }, livroLabel: { value: "Salt City" }, ol: { value: "OL9W" } },
    { tmdb: { value: "8" }, livro: { value: "http://www.wikidata.org/entity/Q6" }, livroLabel: { value: "Q6" } },
  ] } });
  assert.deepEqual(wd.get(7), { wikidata: "Q5", titulo: "Salt City", autor: "Rafael Nunes", ano: 2015, olKey: "OL9W" });
  assert.equal(wd.has(8), false); // sem rótulo: descarta

  assert.deepEqual(lerDocOL({ key: "/works/OL1W", title: "X", author_name: ["Y"], want_to_read_count: 10, already_read_count: 5 }), { olKey: "OL1W", titulo: "X", autor: "Y", ano: null, leitores: 15 });
  assert.equal(lerDocOL({ key: "/books/OL1M", title: "X" }), null);

  const nyt = lerNyt({ results: [
    { title: "SALT CITY", author: "Rafael Nunes", ranks_history: [{ rank: 4, weeks_on_list: 3 }, { rank: 6, weeks_on_list: 12 }] },
    { title: "SALT CITY", author: "Outra Pessoa", ranks_history: [{ rank: 1, weeks_on_list: 90 }] },
  ] }, "Salt City", "Rafael Nunes");
  assert.deepEqual(nyt, { semanas: 12, melhor: 4 });
});

// ---------------------------------------------------------------- fontes gravadas

interface Mundo {
  filmes: Record<number, any>;
  series: Record<number, any>;
  chamadas: string[];
}

const mundo: Mundo = {
  filmes: {
    101: { id: 101, title: "O Farol de Inverno", original_title: "The Winter Lighthouse", status: "Post Production", release_date: "2027-03-14", popularity: 80,
      poster_path: "/farol.jpg", credits: { crew: [{ job: "Director", name: "A. Moreira" }, { job: "Novel", name: "Helena Mateus" }] } },
    102: { id: 102, title: "Os Relógios de Ana", original_title: "Clockwork Ana", status: "In Production", release_date: "2027-05-01", popularity: 40, credits: { crew: [] } },
    103: { id: 103, title: "Vento Leste", original_title: "East Wind", status: "Planned", release_date: "", popularity: 10, credits: { crew: [{ job: "Novel", name: "Marta Siqueira" }] } },
    104: { id: 104, title: "Boato", original_title: "Rumor", status: "Rumored", release_date: "", popularity: 5, credits: { crew: [] } },
  },
  series: {
    201: { id: 201, name: "Cidade de Sal", original_name: "Salt City", status: "Planned", first_air_date: "2027-01-22", popularity: 60, created_by: [{ name: "R. Lins" }], credits: { crew: [] } },
    202: { id: 202, name: "Cancelada", original_name: "Cancelled Show", status: "Canceled", first_air_date: "", popularity: 30, credits: { crew: [] } },
  },
  chamadas: [],
};

const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const DOCS_OL: Record<string, any[]> = {
  "the winter lighthouse": [{ key: "/works/OL101W", title: "The Winter Lighthouse", author_name: ["Helena Mateus"], first_publish_year: 2019, want_to_read_count: 3000, already_read_count: 900 }],
  "clockwork ana": [{ key: "/works/OL102W", title: "Clockwork Ana", author_name: ["Clara Ventura"], first_publish_year: 1952, want_to_read_count: 2000, already_read_count: 400 }],
  "salt city": [{ key: "/works/OL201W", title: "Salt City", author_name: ["Rafael Nunes"], first_publish_year: 2015, want_to_read_count: 150 }],
  "east wind": [{ key: "/works/OL999W", title: "East Wind Rising", author_name: ["Outra Pessoa"] }],
};

async function buscar(url: string, init?: RequestInit): Promise<Response> {
  const u = new URL(url);
  mundo.chamadas.push(`${u.host}${u.pathname}`);
  if (u.host === "api.themoviedb.org") {
    assert.equal(u.searchParams.get("api_key"), process.env.TMDB_API_KEY);
    if (u.pathname === "/3/discover/movie") {
      assert.equal(u.searchParams.get("with_keywords"), "818");
      return resposta({ results: [101, 102, 103, 104].map((id) => ({ id })), total_pages: 1 });
    }
    if (u.pathname === "/3/discover/tv") return resposta({ results: u.searchParams.get("with_status") ? [{ id: 201 }] : [{ id: 201 }, { id: 202 }], total_pages: 1 });
    const m = u.pathname.match(/^\/3\/(movie|tv)\/(\d+)$/);
    const item = m && (m[1] === "movie" ? mundo.filmes : mundo.series)[Number(m[2])];
    return item ? resposta(item) : resposta({ status_message: "not found" }, 404);
  }
  if (u.host === "query.wikidata.org") {
    const consulta = new URLSearchParams(String(init?.body)).get("query") ?? "";
    if (consulta.includes("P4983") && consulta.includes('"201"')) {
      return resposta({ results: { bindings: [{ tmdb: { value: "201" }, livro: { value: "http://www.wikidata.org/entity/Q77" }, livroLabel: { value: "Salt City" },
        autorLabel: { value: "Rafael Nunes" }, ano: { value: "2015" }, ol: { value: "OL201W" } }] } });
    }
    return resposta({ results: { bindings: [] } });
  }
  if (u.host === "openlibrary.org") {
    const chave = normalizarBusca(u.searchParams.get("title") ?? u.searchParams.get("q") ?? "");
    if (u.searchParams.get("q")) return resposta({ docs: [...DOCS_OL["clockwork ana"]!, ...DOCS_OL["the winter lighthouse"]!] });
    return resposta({ docs: DOCS_OL[chave] ?? [] });
  }
  if (u.host === "api.nytimes.com") {
    if (normalizarBusca(u.searchParams.get("title") ?? "") === "the winter lighthouse") {
      return resposta({ results: [{ title: "THE WINTER LIGHTHOUSE", author: "Helena Mateus", ranks_history: [{ rank: 3, weeks_on_list: 10 }, { rank: 1, weeks_on_list: 41 }] }] });
    }
    return resposta({ results: [] });
  }
  throw new Error(`rede inesperada: ${url}`);
}
const normalizarBusca = (t: string) => t.toLowerCase().trim();

async function chamar(metodo: "GET" | "PUT" | "POST", rota: string, body?: unknown, chave = "chave-app") {
  // Metade como a Vercel entrega depois do rewrite (?adaptacoes=), metade pelo caminho original.
  const [caminho, query] = rota.split("?");
  const url = rota.length % 2
    ? `https://x.app/api/trilha?adaptacoes=${encodeURIComponent(caminho!)}${query ? `&${query}` : ""}`
    : `https://x.app/api/adaptacoes${caminho ? `/${caminho}` : ""}${query ? `?${query}` : ""}`;
  const r = await trilha[metodo](new Request(url, {
    method: metodo, headers: { "x-api-key": chave, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: r.status, body: (await r.json()) as any };
}

const rodar = () => runAdaptacoes({ buscar, hoje: HOJE, esperar: async () => {}, paginas: 1 });

// ---------------------------------------------------------------- fluxo

test("roteamento e chave", async () => {
  assert.deepEqual(rotaAdaptacoes(new URL("https://x/api/trilha?adaptacoes=m1/livro")), ["m1", "livro"]);
  assert.deepEqual(rotaAdaptacoes(new URL("https://x/api/adaptacoes")), []);
  assert.equal(rotaAdaptacoes(new URL("https://x/api/trilha")), null);
  assert.equal((await chamar("GET", "", undefined, "errada")).status, 401);
  assert.throws(() => lerEscolha({ olKey: "OL1M", titulo: "x" }), /obra da Open Library/);
  assert.deepEqual(lerEscolha({ naoLivro: true }), { naoLivro: true });
});

test("sem chave do TMDB a rotina não roda", async () => {
  const chave = process.env.TMDB_API_KEY;
  delete process.env.TMDB_API_KEY;
  try {
    const r = await runAdaptacoes({ buscar, hoje: HOJE });
    assert.equal((r as { ignorado?: string }).ignorado, "sem TMDB_API_KEY");
  } finally {
    process.env.TMDB_API_KEY = chave;
  }
});

test("primeira rotina: coleta, liga aos livros, busca os sinais e monta as abas", async () => {
  const vazio = await chamar("GET", "");
  assert.deepEqual([vazio.body.data, vazio.body.anunciados, vazio.body.atualizadoEm], [[], [], null]);

  const r = (await rodar()) as any;
  assert.equal(r.coletadas, 6);
  assert.equal(r.rumoresIgnorados, 1);
  assert.equal(r.novas, 5);
  assert.deepEqual(r.ligacao, { manual: 0, wikidata: 1, titulo_autor: 1, titulo: 1, nenhum: 1 });
  assert.deepEqual([r.nyt.consultas, r.nyt.achados, r.nyt.parou], [3, 1, null]);
  assert.deepEqual(r.erros, []);

  const l = await chamar("GET", "");
  assert.equal(l.status, 200);
  assert.deepEqual(l.body.data.map((i: any) => i.id), ["m101", "t201"]);
  assert.deepEqual(l.body.anunciados.map((i: any) => i.id), ["m102", "m103"]);

  const farol = l.body.data[0];
  assert.deepEqual(farol.nota, { total: 92, nyt: 43, leitores: 29, popularidade: 20 });
  assert.deepEqual([farol.livro.titulo, farol.livro.autor, farol.livro.nytSemanas, farol.livro.nytMelhor, farol.livro.origem],
    ["The Winter Lighthouse", "Helena Mateus", 41, 1, "titulo_autor"]);
  assert.equal(farol.tmdbUrl, "https://www.themoviedb.org/movie/101");

  const cidade = l.body.data[1];
  assert.deepEqual([cidade.tipo, cidade.estreia, cidade.livro.origem, cidade.livro.id, cidade.livro.leitores], ["serie", "2027-01-22", "wikidata", "OL201W", 150]);

  const [relogios, vento] = l.body.anunciados;
  assert.deepEqual([relogios.fase, relogios.livro.origem, relogios.livro.ano], ["producao", "titulo", 1952]);
  assert.deepEqual([vento.fase, vento.livro], ["anunciado", null]); // "East Wind Rising" não é "East Wind"
});

test("segunda rotina: mudança de fase vira histórico; NYT e ligações não repetem", async () => {
  mundo.filmes[102] = { ...mundo.filmes[102], status: "Post Production" };
  mundo.chamadas.length = 0;
  const r = (await rodar()) as any;
  assert.equal(r.mudaramDeFase, 1);
  assert.equal(r.novas, 0);
  assert.equal(r.nyt.consultas, 0);
  assert.deepEqual(r.ligacao, { manual: 0, wikidata: 0, titulo_autor: 0, titulo: 0, nenhum: 0 });
  assert.equal(mundo.chamadas.filter((c) => c.startsWith("query.wikidata.org")).length, 0);

  const d = await chamar("GET", "m102");
  assert.equal(d.status, 200);
  assert.deepEqual(d.body.fases.map((f: any) => [f.fase, f.estreia]), [["producao", "2027-05-01"], ["com_data", "2027-05-01"]]);
  assert.equal((await chamar("GET", "")).body.data.some((i: any) => i.id === "m102"), true);
  assert.equal((await chamar("GET", "m999")).status, 404);
  assert.equal((await chamar("GET", "xyz")).status, 404);
});

test("Não é esse livro: escolha manual vale acima da rotina", async () => {
  const escolha = { olKey: "OL555W", titulo: "Ana's Clocks", autor: "Clara Ventura", ano: 1950, leitores: 4000 };
  const r = await chamar("PUT", "m102/livro", escolha);
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.livro.id, r.body.livro.origem, r.body.livro.leitores], ["OL555W", "manual", 4000]);

  await rodar();
  const d = await chamar("GET", "m102");
  assert.deepEqual([d.body.livro.id, d.body.livro.origem], ["OL555W", "manual"]);
  assert.equal((await chamar("PUT", "m102/livro", { olKey: "x", titulo: "y" })).status, 400);
  assert.equal((await chamar("PUT", "m999/livro", escolha)).status, 404);
});

test("tirar da lista e Desfazer; Seguindo pelos ids", async () => {
  assert.equal((await chamar("PUT", "m103/livro", { naoLivro: true })).body.oculta, true);
  assert.equal((await chamar("GET", "")).body.anunciados.some((i: any) => i.id === "m103"), false);

  const s = await chamar("GET", "?ids=m103,m101,t202");
  assert.deepEqual(s.body.itens.map((i: any) => [i.id, i.oculta]).sort(), [["m101", false], ["m103", true], ["t202", false]]);
  assert.equal(s.body.itens.find((i: any) => i.id === "t202").fase, "cancelado");
  assert.equal((await chamar("GET", "?ids=m1,DROP")).status, 400);

  await chamar("PUT", "m103/livro", { naoLivro: false });
  assert.equal((await chamar("GET", "")).body.anunciados.some((i: any) => i.id === "m103"), true);
});

test("busca de livro passa pela Open Library", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => buscar(String(url), init)) as typeof fetch;
  try {
    const r = await chamar("GET", "livros?q=ana");
    assert.deepEqual(r.body.livros.map((l: any) => l.olKey), ["OL102W", "OL101W"]);
    assert.equal((await chamar("GET", "livros?q=a")).status, 400);
  } finally {
    globalThis.fetch = original;
  }
});
