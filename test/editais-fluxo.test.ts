/**
 * Fluxo inteiro dos editais contra um Postgres em memória (PGlite) e sites simulados:
 * coleta → concurso → fila de PDF → favorito → acompanhamento (PDF, edital anterior, lembrete) → rotas.
 * Precisa de --experimental-test-module-mocks (já no "npm test").
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { criarBanco } from "./support/pglite-sql.js";

const { sql } = await criarBanco();
mock.module(new URL("../src/db.ts", import.meta.url).href, { namedExports: { sql: () => sql } });

const { coletarEditais } = await import("../src/editais/collect.js");
const { acompanhar } = await import("../src/editais/acompanhar.js");
const { listar, detalhe, novidades, favoritar, emAlta } = await import("../src/editais/store.js");

// ───────── sites simulados ─────────

const dia = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

/** PDF mínimo com texto (Helvetica, ASCII), uma linha por item. */
function pdf(linhas: string[]): Buffer {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const conteudo = `BT /F1 8 Tf 20 820 Td 10 TL ${linhas.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${Buffer.byteLength(conteudo)}>>stream\n${conteudo}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  return Buffer.from(`%PDF-1.4\n${objs.map((o, i) => `${i + 1} 0 obj${o}\nendobj`).join("\n")}\ntrailer<</Root 1 0 R>>\n%%EOF`, "latin1");
}

const paragrafos = (...ps: string[]) => ps.map((p) => `<p>${p} ${"Texto de apoio da matéria para o leitor entender o contexto do concurso. ".repeat(2)}</p>`).join("");
const pagina = (titulo: string, corpo: string, extra = "") =>
  `<html><head><title>${titulo} | Site</title><meta property="article:published_time" content="${new Date().toISOString()}"></head>
   <body><nav><a href="/">Início</a></nav><article><h1>${titulo}</h1>${corpo}${extra}</article></body></html>`;

const PCI = "https://www.pciconcursos.com.br";
const GRAN = "https://blog.grancursosonline.com.br";

const SITES: Record<string, { tipo: string; corpo: string | Buffer }> = {
  [`${PCI}/concursos/nordeste/`]: { tipo: "text/html", corpo: `<html><body>
    <div class="ca"><a href="/noticias/trt-pe-abre-concurso-ti">TRT PE abre concurso para Analista Judiciário de TI</a><div>PE</div><div>30 vagas até R$ 16.000,00</div></div>
    <div class="ca"><a href="/noticias/prefeitura-de-rio-real-ba-retifica-editais">Prefeitura de Rio Real - BA retifica editais de concursos</a><div>BA</div><div>148 vagas até R$ 4.430,06</div></div>
    <div class="ca"><a href="/noticias/pm-pe-concurso">Polícia Militar de Pernambuco abre concurso para soldado</a><div>PE</div></div>
    <div class="ca"><a href="/noticias/sefaz-al-auditor">Sefaz - AL abre concurso público com vagas para o cargo de Auditor Fiscal</a><div>AL</div><div>40 vagas até R$ 25.270,68</div></div>
    <div class="ca"><a href="/noticias/emprel-temporario-ti">Emprel abre seleção temporária para Analista de TI no Recife - PE</a><div>PE</div><div>10 vagas até R$ 6.500,00</div></div>
  </body></html>` },
  [`${PCI}/noticias/trt-pe-abre-concurso-ti`]: { tipo: "text/html", corpo: pagina(
    "TRT PE abre concurso para Analista Judiciário de TI",
    paragrafos(
      "O Tribunal Regional do Trabalho da 6ª Região publicou edital com 30 vagas. A banca organizadora é a FCC.",
      "O cargo de Analista Judiciário – Tecnologia da Informação tem remuneração de R$ 16.000,00 e exige curso superior na área de TI, aceitando tecnólogo.",
      `As inscrições vão até ${dia(3)}. A prova objetiva será em ${dia(40)}, em Recife.`,
    ),
    `<a href="${PCI}/arquivos/edital-trt6-ti.pdf">Edital</a>`,
  ) },
  [`${PCI}/noticias/sefaz-al-auditor`]: { tipo: "text/html", corpo: pagina(
    "Sefaz - AL abre concurso público com vagas para o cargo de Auditor Fiscal",
    paragrafos("A Secretaria da Fazenda de Alagoas abriu 40 vagas para Auditor Fiscal, com remuneração de R$ 25.270,68.", `Inscrições até ${dia(10)}.`),
  ) },
  [`${PCI}/noticias/emprel-temporario-ti`]: { tipo: "text/html", corpo: pagina(
    "Emprel abre seleção temporária para Analista de TI no Recife - PE",
    paragrafos(
      "A Emprel, empresa de tecnologia da informação do Recife, abriu processo seletivo simplificado para Analista de Sistemas.",
      "O salário de analista de tecnologia da informação é de R$ 6.500,00. O contrato terá duração de 12 meses, prorrogável por igual período.",
      `Inscrições até ${dia(4)}.`,
    ),
  ) },
  [`${PCI}/arquivos/edital-trt6-ti.pdf`]: { tipo: "application/pdf", corpo: pdf([
    "EDITAL N 1 - TRT DA 6 REGIAO",
    "CARGO 1: ANALISTA JUDICIARIO - AREA: TECNOLOGIA DA INFORMACAO",
    "REQUISITO: diploma de curso superior em Tecnologia da Informacao, incluindo cursos superiores de tecnologia. REMUNERACAO: R$ 16.000,00.",
    "CARGO 2: TECNICO JUDICIARIO - AREA ADMINISTRATIVA",
    "REQUISITO: ensino medio completo. REMUNERACAO: R$ 9.000,00.",
    `Periodo de inscricoes: de ${dia(-10)} a ${dia(7)}.`,
    `Periodo de solicitacao de isencao: ${dia(-10)} a ${dia(-5)}.`,
    `A aplicacao das provas objetivas sera em ${dia(40)}.`,
    "ANEXO II - CONTEUDO PROGRAMATICO",
    "CONHECIMENTOS GERAIS: LINGUA PORTUGUESA: 1 Interpretacao de textos. 2 Ortografia. NOCOES DE DIREITO: 1 Constituicao Federal. 2 Administracao publica.",
    "CARGO 1: ANALISTA JUDICIARIO - AREA: TECNOLOGIA DA INFORMACAO",
    "ENGENHARIA DE SOFTWARE: 1 Scrum e Kanban. 2 UML. 3 Testes automatizados. BANCO DE DADOS: 1 Modelagem relacional. 2 SQL. 3 Normalizacao.",
    "CARGO 2: TECNICO JUDICIARIO - AREA ADMINISTRATIVA",
    "ARQUIVOLOGIA: 1 Gestao de documentos. 2 Protocolo.",
  ]) },
  [`${GRAN}/concursos/nordeste/pernambuco/`]: { tipo: "text/html", corpo: `<html><body>
    <article><h2><a href="${GRAN}/concurso-ati-pe/">Concurso ATI PE: banca em definição para analistas de TI</a></h2></article>
    <article><h2><a href="${GRAN}/concursos-seguranca-pe/">Concursos Segurança PE: como conciliar PM, PC e Bombeiros?</a></h2></article>
  </body></html>` },
  [`${GRAN}/concurso-ati-pe/`]: { tipo: "text/html", corpo: pagina(
    "Concurso ATI PE: banca em definição para analistas de TI",
    paragrafos(
      "A Agência de Tecnologia da Informação de Pernambuco está escolhendo a banca do novo concurso para analista de TI.",
      "No último concurso, a remuneração inicial de analista de tecnologia da informação era de R$ 7.800,00.",
    ),
    `<a href="${GRAN}/wp-content/uploads/edital-ati-pe-2019.pdf">Último edital</a>`,
  ) },
  [`${GRAN}/wp-content/uploads/edital-ati-pe-2019.pdf`]: { tipo: "application/pdf", corpo: pdf([
    "EDITAL ATI PE 2019 - ANALISTA EM GESTAO DE TECNOLOGIA DA INFORMACAO",
    "A Agencia de Tecnologia da Informacao do Estado de Pernambuco torna publica a abertura de concurso publico para provimento de cargos.",
    "As disposicoes deste edital regem o certame, que sera executado pela banca organizadora contratada para esta finalidade especifica.",
    "CARGO 1: ANALISTA EM GESTAO - AREA: TECNOLOGIA DA INFORMACAO",
    "REQUISITO: curso superior em TI, incluindo tecnologo. REMUNERACAO: R$ 7.800,00.",
    "ANEXO I - OBJETOS DE AVALIACAO",
    "LINGUA PORTUGUESA: 1 Leitura. 2 Gramatica. RACIOCINIO LOGICO: 1 Proposicoes. 2 Conjuntos.",
    "CARGO 1: ANALISTA EM GESTAO - AREA: TECNOLOGIA DA INFORMACAO",
    "DESENVOLVIMENTO DE SISTEMAS: 1 Java. 2 APIs REST. 3 Padroes de projeto. INFRAESTRUTURA: 1 Redes TCP/IP. 2 Linux.",
  ]) },
};

const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: string | URL | Request) => {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  const site = SITES[url];
  if (!site) return new Response("não encontrado", { status: 404, headers: { "content-type": "text/html" } });
  return new Response(typeof site.corpo === "string" ? site.corpo : new Uint8Array(site.corpo), { status: 200, headers: { "content-type": site.tipo } });
}) as typeof fetch;
test.after(() => void (globalThis.fetch = fetchOriginal));

// ───────── fluxo ─────────

test("coleta: cria os concursos certos, ignora o que está fora do perfil e enfileira os PDFs", async () => {
  const r = await coletarEditais();
  assert.equal(r.concursosNovos, 4);
  assert.ok(r.ignoradas["listagem já mostra fora do perfil/salário"]! >= 2); // Rio Real (salário) e PM
  assert.equal(r.ignoradas["panorama (vários concursos)"], 1);

  const lista = await listar({ tipo: "ativos", ufs: [], ocultos: false });
  const trt = lista.find((c) => c.orgao === "TRT PE")!;
  assert.equal(trt.fase, "inscricoes");
  assert.equal(trt.salario.inicialCentavos, 1_600_000);
  assert.equal(trt.banca, "FCC");
  assert.equal(trt.diasParaFecharInscricao, 3);
  const ati = lista.find((c) => c.orgao === "ATI Pernambuco")!;
  assert.equal(ati.fase, "comissao");
  assert.ok(trt.peso > ati.peso);

  const fila = (await sql`select tipo, status from concurso_editais order by tipo`) as { tipo: string; status: string }[];
  assert.deepEqual(fila, [{ tipo: "anterior", status: "pendente" }, { tipo: "atual", status: "pendente" }]);
  const abertos = await listar({ tipo: "abertos", ufs: ["PE"], ocultos: false });
  assert.deepEqual(abertos.map((c) => c.orgao).sort(), ["Emprel", "TRT PE"]);

  // Temporário vem com a duração do contrato.
  const emprel = lista.find((c) => c.orgao === "Emprel")!;
  assert.equal(emprel.regime, "temporario");
  assert.deepEqual(emprel.duracao, { meses: 12, prorrogavel: true, ateMeses: 24 });

  // Auditor fiscal (fora de TI): não está no perfil, mas aparece no escopo geral (Todos/Rumores), depois dos de TI de PE.
  assert.equal(lista.some((c) => c.orgao === "Sefaz AL"), false);
  const geral = await listar({ tipo: "ativos", escopo: "geral", ufs: [], ocultos: false });
  const sefaz = geral.find((c) => c.orgao === "Sefaz AL")!;
  assert.equal(sefaz.perfil, false);
  assert.equal(sefaz.salario.inicialCentavos, 2_527_068);
  assert.ok(geral.findIndex((c) => c.orgao === "TRT PE") < geral.indexOf(sefaz));
  assert.ok(geral.every((c) => !/Militar/.test(c.orgao)));
});

test("favoritar rumor pede o edital anterior; acompanhamento lê PDFs e avisa o prazo", async () => {
  const lista = await listar({ tipo: "todos", ufs: [], ocultos: false });
  const trt = lista.find((c) => c.orgao === "TRT PE")!;
  const ati = lista.find((c) => c.orgao === "ATI Pernambuco")!;
  assert.deepEqual(await favoritar(ati.id, true), { buscaAnterior: "pendente" });
  assert.deepEqual(await favoritar(trt.id, true), { buscaAnterior: null });

  const r = await acompanhar();
  const pdfs = await sql`select tipo, status, erro from concurso_editais order by tipo`;
  assert.deepEqual(r.erros, []);
  assert.deepEqual(pdfs, [{ tipo: "anterior", status: "ok", erro: null }, { tipo: "atual", status: "ok", erro: null }]);
  assert.equal(r.anteriores.encontrado, 1);
  assert.match(r.reddit, /ignorado/);

  const d = (await detalhe(trt.id))!;
  // O PDF manda: prazo de inscrição do cronograma, requisito do cargo, matérias de TI.
  assert.equal(d.inscricoesAte?.split("-").reverse().join("/"), dia(7));
  assert.equal(d.isencaoAte?.split("-").reverse().join("/"), dia(-5));
  assert.equal(d.aceitaTecnologo, true);
  assert.deepEqual(d.cargosTi.map((c) => c.nome), ["ANALISTA JUDICIARIO - AREA: TECNOLOGIA DA INFORMACAO"]);
  const grupos = d.programatico.map((g) => g.grupo);
  assert.deepEqual(grupos, ["Conhecimentos gerais", "CARGO 1: ANALISTA JUDICIARIO - AREA: TECNOLOGIA DA INFORMACAO"]);
  assert.deepEqual(d.programatico[1]!.materias.map((m) => m.nome), ["ENGENHARIA DE SOFTWARE", "BANCO DE DADOS"]);
  assert.ok(d.eventos.some((e) => e.descricao.startsWith("Conteúdo programático lido")));

  const a = (await detalhe(ati.id))!;
  assert.equal(a.buscaAnterior?.status, "encontrado");
  assert.match(a.editalAnterior!.url, /edital-ati-pe-2019\.pdf$/);
  assert.deepEqual(a.editalAnterior!.programatico.at(-1)!.materias.map((m) => m.nome), ["DESENVOLVIMENTO DE SISTEMAS", "INFRAESTRUTURA"]);
  assert.equal(a.fase, "comissao"); // edital anterior não mexe na fase nem nas datas

  const hoje = await novidades(new Date(Date.now() - 3_600_000));
  const eventosTrt = hoje.find((c) => c.id === trt.id)!.eventos as { tipo: string; descricao: string }[];
  assert.ok(eventosTrt.some((e) => e.descricao === `Prazo de inscrição mudou para ${dia(7).slice(0, 5)}`));
  assert.ok(eventosTrt.some((e) => e.tipo === "lembrete" && /Faltam 7 dias para fechar a inscrição/.test(e.descricao)));
});

test("em alta: conta as matérias das listagens por órgão, inclusive as fora do perfil", async () => {
  const ranking = await emAlta(["PE"], 7);
  const orgaos = ranking.map((x) => x.orgao);
  assert.ok(orgaos.includes("TRT PE"));
  assert.ok(orgaos.includes("Polícia Militar PE"));
  assert.equal(ranking.find((x) => x.orgao === "Polícia Militar PE")!.perfil, false);
  assert.equal(ranking.find((x) => x.orgao === "TRT PE")!.perfil, true);
});
