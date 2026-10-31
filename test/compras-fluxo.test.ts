/**
 * Lista de compras de ponta a ponta, pelas rotas, contra um Postgres em memória (PGlite):
 * abrir a compra → escanear código novo → cadastrar → escanear de novo → anotar → importar a nota → conferir →
 * confirmar par → segunda compra já reconhece. Open Food Facts simulado. Precisa de --experimental-test-module-mocks.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { criarBanco } from "./support/pglite-sql.js";
import { ANOTADO, HTML_SEFAZ, TEXTO_SEFAZ, URL_QR } from "./fixtures/compra-2026-10-31.js";

process.env.APP_API_KEY = "chave-teste";
const { sql } = await criarBanco();
mock.module(new URL("../src/db.ts", import.meta.url).href, { namedExports: { sql: () => sql } });

const offPedidos: string[] = [];
globalThis.fetch = (async (url: string | URL) => {
  const u = String(url);
  offPedidos.push(u);
  if (u.includes("openfoodfacts.org") && u.includes("7891000315507")) {
    return Response.json({ status: 1, product: { product_name_pt: "Arroz Parboilizado Tipo 1", brands: "Urbano", quantity: "1 kg" } });
  }
  if (u.includes("openfoodfacts.org")) return Response.json({ status: 0 });
  throw new Error(`rede bloqueada no teste: ${u}`);
}) as typeof fetch;

const compras = await import("../api/compras.js");
const reservas = await import("../api/reservas.js");

async function chamar(metodo: "GET" | "POST" | "PATCH" | "DELETE", rota: string, body?: unknown, chave = "chave-teste") {
  const handler = compras[metodo];
  // Metade das chamadas vem como a Vercel entrega depois do rewrite (?rota=), metade pelo caminho original.
  const url = rota.length % 2 ? `https://x.app/api/compras?rota=${encodeURIComponent(rota.split("?")[0]!)}${rota.includes("?") ? `&${rota.split("?")[1]}` : ""}` : `https://x.app/api/compras/${rota}`;
  const r = await handler(new Request(url, { method: metodo, headers: { "x-api-key": chave, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: r.status, body: (await r.json()) as any };
}

const EAN_ARROZ = "7891000315507";
const EAN_SUSHI = "7896006716112";

test("sem a chave do app: 401", async () => {
  assert.equal((await chamar("GET", "sessoes", undefined, "errada")).status, 401);
});

let sessaoId = 0;
let arrozId = 0;

test("primeira compra: código novo → sugestão → cadastro → reconhecido na próxima leitura", async () => {
  const s = await chamar("POST", "sessoes", { nome: "Atacadão 31/10", orcamentoCentavos: 85600 });
  assert.equal(s.status, 201);
  sessaoId = s.body.id;

  const novo = await chamar("GET", `codigo/${EAN_ARROZ}`);
  assert.equal(novo.body.status, "novo");
  assert.equal(novo.body.sugestao.nome, "Arroz Parboilizado Tipo 1 Urbano 1 kg");

  // "Esse produto já foi comprado?" → nada no catálogo nem em notas ainda.
  const busca = await chamar("GET", "produtos?busca=arroz");
  assert.deepEqual(busca.body, { produtos: [], daNota: [] });

  const criado = await chamar("POST", "produtos", { nome: "Arroz Urbano parboilizado 1kg", codigo: EAN_ARROZ });
  assert.equal(criado.status, 201);
  arrozId = criado.body.id;
  assert.deepEqual(criado.body.codigos, [{ tipo: "ean", codigo: EAN_ARROZ, cnpj: null }]);

  const conhecido = await chamar("GET", `codigo/${EAN_ARROZ}`);
  assert.equal(conhecido.body.status, "conhecido");
  assert.equal(conhecido.body.produto.id, arrozId);

  assert.equal((await chamar("GET", "codigo/123")).status, 400);
});

test("anotar: pelo código, pelo texto ditado e pelos campos; total e saldo a cada item", async () => {
  const arroz = await chamar("POST", `sessoes/${sessaoId}/itens`, { codigo: EAN_ARROZ, quantidade: 2, precoUnitario: 4.13 });
  assert.equal(arroz.status, 201);
  assert.equal(arroz.body.item.produtoId, arrozId);
  assert.equal(arroz.body.item.descricao, "Arroz Urbano parboilizado 1kg");
  assert.equal(arroz.body.sessao.totalCentavos, 826);
  assert.equal(arroz.body.sessao.saldoCentavos, 85600 - 826);

  const texto = await chamar("POST", `sessoes/${sessaoId}/itens`, { texto: "Macaxeira 2,178kg o ela esta 4,00 por kg" });
  assert.equal(texto.body.item.valorCentavos, 871);
  assert.equal(texto.body.item.unidade, "KG");

  for (const [descricao, quantidade, unidade, precoUnitario] of ANOTADO.slice(1)) {
    if (descricao === "Macaxeira") continue;
    const r = await chamar("POST", `sessoes/${sessaoId}/itens`, { descricao, quantidade, unidade, precoUnitario, emPromocao: descricao === "Saco de lixo" });
    assert.equal(r.status, 201, descricao);
  }
  const sessao = await chamar("GET", `sessoes/${sessaoId}`);
  assert.equal(sessao.body.itens.length, 61);
  assert.equal(sessao.body.totalCentavos, 85600);
  assert.equal(sessao.body.saldoCentavos, 0);

  assert.equal((await chamar("POST", `sessoes/${sessaoId}/itens`, { texto: "arroz" })).status, 400);
});

test("nota: HTML baixado pelo celular → conferência com alertas e conta fechada", async () => {
  const r = await chamar("POST", `sessoes/${sessaoId}/nota`, { conteudo: HTML_SEFAZ, url: URL_QR });
  assert.equal(r.status, 201);
  assert.equal(r.body.nova, true);
  assert.equal(r.body.nota.origem, "html");
  assert.equal(r.body.resumo.totalAnotadoCentavos, 85600);
  assert.equal(r.body.resumo.subtotalNotaCentavos, 96860);
  assert.equal(r.body.resumo.descontosCentavos, 1687);
  assert.equal(r.body.resumo.totalPagoCentavos, 95173);
  assert.equal(r.body.resumo.fechaConta, true);
  assert.equal(r.body.alertas[0].tipo, "PROMOCAO_NAO_APLICADA");

  // Mandar de novo (ex.: o app repetiu) não duplica.
  const de_novo = await chamar("POST", `sessoes/${sessaoId}/nota`, { conteudo: TEXTO_SEFAZ });
  assert.equal(de_novo.status, 200);
  assert.equal(de_novo.body.nova, false);

  const rel = await chamar("GET", `sessoes/${sessaoId}/relatorio?limite=500`);
  assert.ok(rel.body.alertas.every((a: { tipo: string; impactoCentavos: number }) => a.tipo === "CONFIRMAR" || a.tipo === "PROMOCAO_NAO_APLICADA" || a.impactoCentavos >= 500));
});

test("nota: conteúdo ilegível dá 422; link fora da Sefaz ou servidor sem acesso pede o conteúdo", async () => {
  const s = (await chamar("POST", "sessoes", {})).body.id;
  assert.equal((await chamar("POST", `sessoes/${s}/nota`, { conteudo: "qualquer coisa", url: URL_QR })).status, 422);
  assert.equal((await chamar("POST", `sessoes/${s}/nota`, { url: "https://exemplo.com/nota" })).status, 502);
  const bloqueado = await chamar("POST", `sessoes/${s}/nota`, { url: URL_QR });
  assert.equal(bloqueado.status, 502);
  assert.equal(bloqueado.body.precisaConteudo, true);
  // A mesma nota em outra compra é recusada.
  assert.equal((await chamar("POST", `sessoes/${s}/nota`, { conteudo: TEXTO_SEFAZ })).status, 409);
  await chamar("DELETE", `sessoes/${s}`);
});

test("confirmar par: código da loja fica vinculado e na próxima nota o par sai pelo código", async () => {
  const rel = (await chamar("GET", `sessoes/${sessaoId}/relatorio`)).body;
  const karina = rel.pares.find((p: any) => p.anotados[0].descricao === "Karina karaoke");
  assert.equal(karina.confianca, "provavel");
  const r = await chamar("POST", `sessoes/${sessaoId}/pareamentos`, { itemIds: karina.anotados.map((a: any) => a.id), itemNotaIds: karina.linhas.map((l: any) => l.id), nome: "Kani kama Costa Sul" });
  assert.equal(r.status, 200);
  assert.equal(r.body.pares.find((p: any) => p.anotados[0].descricao === "Karina karaoke").confianca, "codigo");

  const arroz = r.body.pares.find((p: any) => p.anotados[0].produtoId === arrozId);
  await chamar("POST", `sessoes/${sessaoId}/pareamentos`, { itemIds: arroz.anotados.map((a: any) => a.id), itemNotaIds: arroz.linhas.map((l: any) => l.id) });
  const produto = (await chamar("GET", `produtos/${arrozId}`)).body;
  assert.deepEqual(produto.codigos.map((c: any) => c.tipo).sort(), ["ean", "loja"]);
  // O último preço passa a ser o da nota (4,59), não o anotado (4,13).
  assert.deepEqual([produto.ultimoPreco.precoUnitario, produto.ultimoPreco.origem], [4.59, "nota"]);

  assert.equal((await chamar("POST", `sessoes/${sessaoId}/pareamentos`, { itemIds: [999999], itemNotaIds: [1] })).status, 400);
});

test("segunda compra: código conhecido entra com um toque; código novo vincula a produto de nota antiga", async () => {
  const s2 = (await chamar("POST", "sessoes", { orcamentoCentavos: 20000 })).body.id;
  const arroz = await chamar("POST", `sessoes/${s2}/itens`, { codigo: EAN_ARROZ });
  assert.equal(arroz.body.item.produtoId, arrozId);
  assert.equal(arroz.body.item.precoUnitario, 4.59);
  assert.equal(arroz.body.item.valorCentavos, 459);

  // Código novo do arroz de sushi: "já foi comprado?" → aparece a linha da nota antiga, que ainda não é produto.
  assert.equal((await chamar("GET", `codigo/${EAN_SUSHI}`)).body.status, "novo");
  const busca = (await chamar("GET", "produtos?busca=arroz sushi")).body;
  assert.ok(busca.produtos.some((p: any) => p.id === arrozId), "o arroz já cadastrado aparece no catálogo");
  const linha = busca.daNota.find((l: any) => l.descricao === "ARROZ URBANO SUSHI");
  assert.ok(linha, "a linha da nota aparece na busca");
  assert.ok(!busca.daNota.some((l: any) => l.descricao === "ARROZ URBANO PARB.T1"), "o que já é produto não aparece de novo");

  const sushi = await chamar("POST", "produtos", { codigo: EAN_SUSHI, itemNotaId: linha.itemNotaId });
  assert.equal(sushi.body.nome, "ARROZ URBANO SUSHI");
  assert.deepEqual(sushi.body.codigos.map((c: any) => c.tipo).sort(), ["ean", "loja"]);
  const lido = await chamar("GET", `codigo/${EAN_SUSHI}`);
  assert.equal(lido.body.status, "conhecido");
  assert.equal(lido.body.produto.ultimoPreco.precoUnitario, 16.9);

  // Vincular um segundo código de barras ao mesmo produto ("sim, é esse").
  const outro = await chamar("POST", `produtos/${arrozId}/codigos`, { codigo: "7891000315514" });
  assert.equal(outro.body.codigos.filter((c: any) => c.tipo === "ean").length, 2);
});

test("etiqueta de balança: valor vem do código; produto ligado pelo prefixo", async () => {
  const s3 = (await chamar("POST", "sessoes", {})).body.id;
  const lida = await chamar("GET", "codigo/2000360013373");
  assert.equal(lida.body.status, "novo");
  assert.deepEqual(lida.body.balanca, { valorCentavos: 1337 });
  await chamar("POST", "produtos", { nome: "Muçarela fatiada", unidade: "KG", codigo: "2000360013373" });
  // Outro pacote do mesmo queijo, com outro valor: reconhece pelo prefixo.
  const outro = await chamar("POST", `sessoes/${s3}/itens`, { codigo: "2000360025000" });
  assert.equal(outro.status, 201, JSON.stringify(outro.body));
  assert.equal(outro.body.item.descricao, "Muçarela fatiada");
  assert.equal(outro.body.item.valorCentavos, 2500);
});

test("desconto à mão, editar e apagar item", async () => {
  const s = (await chamar("PATCH", `sessoes/${sessaoId}`, { descontoManualCentavos: 500 })).body;
  assert.equal(s.descontoManualCentavos, 500);
  // A nota informou desconto: ele vale mais que o digitado.
  assert.equal((await chamar("GET", `sessoes/${sessaoId}/relatorio`)).body.resumo.descontosFonte, "nota");

  const item = s.itens.at(-1);
  const editado = await chamar("PATCH", `sessoes/${sessaoId}/itens/${item.id}`, { quantidade: 2 });
  assert.equal(editado.body.item.valorCentavos, item.valorCentavos * 2);
  const apagado = await chamar("DELETE", `sessoes/${sessaoId}/itens/${item.id}`);
  assert.equal(apagado.body.itens.length, 60);
  assert.equal((await chamar("GET", "sessoes")).body.sessoes.length, 3);
});

test("reservas numa função só: mesmo comportamento pelo caminho e pelo ?dia= do rewrite", async () => {
  const h = { "x-api-key": "chave-teste", "content-type": "application/json" };
  const put = await reservas.PUT(new Request("https://x.app/api/reservas?dia=2026-11-07", { method: "PUT", headers: h, body: JSON.stringify({ nome: "Ana", telefone: "81 9" }) }));
  assert.equal(put.status, 200);
  const lista = (await (await reservas.GET(new Request("https://x.app/api/reservas?mes=2026-11", { headers: h }))).json()) as any;
  assert.equal(lista.reservas.length, 1);
  assert.equal((await reservas.DELETE(new Request("https://x.app/api/reservas/2026-11-07", { method: "DELETE", headers: h }))).status, 200);
  assert.equal((await reservas.PUT(new Request("https://x.app/api/reservas/31-12", { method: "PUT", headers: h, body: "{}" }))).status, 400);
  assert.equal((await reservas.GET(new Request("https://x.app/api/reservas", { headers: h }))).status, 400);
});
