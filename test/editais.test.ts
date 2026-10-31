import assert from "node:assert/strict";
import { test } from "node:test";
import { agregar, avaliar, eventos, type Agregado } from "../src/editais/avaliar.js";
import { detectarFase, ehPanorama, extrair, extrairDatas, extrairSalarios, identificarOrgao, normalizar } from "../src/editais/extract.js";
import { itensDaListagem, pdfsDaPagina, valeAbrir } from "../src/editais/listagem.js";

const ref = new Date("2026-05-10T12:00:00Z");
const valores = (texto: string) => extrairSalarios(normalizar(texto)).map((s) => [s.centavos, s.final]);

test("salário: inicial e final da faixa com formação", () => {
  assert.deepEqual(valores("Salário: R$ 4.763,73 a R$ 11.914,84 (após formação)"), [[476373, false], [1191484, true]]);
  assert.deepEqual(valores("remuneração inicial de R$ 9.000, podendo chegar a R$ 15.000,00"), [[900000, false], [1500000, true]]);
});

test("salário: ignora auxílio, taxa, valor por plantão e lê 'mil'", () => {
  assert.deepEqual(valores("O salário será de R$ 13.700,00, além de auxílio-alimentação de R$ 1.192"), [[1370000, false]]);
  assert.deepEqual(valores("taxa de inscrição de R$ 130,00"), []);
  assert.deepEqual(valores("20 vagas até R$ 2.300,00 por plantão"), []);
  assert.deepEqual(valores("Concurso Bacen: 170 vagas autorizadas; até R$ 27,2 mil!"), [[2720000, false]]);
});

test("salário: marca o que foi citado perto de cargo de TI", () => {
  const texto = normalizar(
    "Analista de Tecnologia da Informação: remuneração de R$ 8.829,24. " + "x".repeat(300) + " Auxiliar de serviços gerais: salário de R$ 2.100,00.",
  );
  const s = extrairSalarios(texto);
  assert.equal(s.find((v) => v.centavos === 882924)?.ti, true);
  assert.equal(s.find((v) => v.centavos === 210000)?.ti, false);
  // "Noções de informática" não conta como cargo de TI.
  assert.equal(extrairSalarios(normalizar("Prova com noções de informática. Salário de R$ 3.000,00"))[0]?.ti, false);
});

test("fase pelo título", () => {
  assert.equal(detectarFase("Concurso Bacen: 170 vagas autorizadas; até R$ 27,2 mil!", ""), "autorizado");
  assert.equal(detectarFase("Concurso TRT PE: homologado; iniciais de até R$ 16 mil!", ""), "encerrado");
  assert.equal(detectarFase("Concurso Câmara Caruaru PE: banca em definição para 20 vagas!", ""), "comissao");
  assert.equal(detectarFase("Concurso Delegado PE: 45 vagas e até R$ 13,5 mil. Inscreva-se!", ""), "inscricoes");
  assert.equal(detectarFase("Sefaz - AL abre concurso público com vagas para o cargo de Auditor Fiscal", ""), "inscricoes");
  assert.equal(detectarFase("Concurso ATI PE: banca definida é o Cebraspe", ""), "banca");
  assert.equal(detectarFase("Concurso Polícia Civil PE: novo edital previsto para 2027", ""), "rumor");
});

test("órgão: dicionário, sigla + UF, prefeitura e câmara", () => {
  assert.equal(identificarOrgao("Concurso Bacen: 170 vagas autorizadas", "")?.chave, "bacen");
  assert.deepEqual(identificarOrgao("Sefaz - AL abre concurso público para Auditor Fiscal", ""), {
    chave: "sefaz-al", nome: "Sefaz AL", uf: "AL", esfera: "estadual", area: undefined, origem: "padrao",
  });
  assert.equal(identificarOrgao("Concurso TRT PE: homologado", "")?.chave, "trt-pe");
  const pc = identificarOrgao("Polícia Civil de Pernambuco abre 500 vagas", "");
  assert.equal(pc?.chave, "pc-pe");
  assert.equal(pc?.area, "policia");
  assert.equal(identificarOrgao("Concurso PM PE Oficial pode ter edital em 2026", "")?.area, "fora");
  const pref = identificarOrgao("Prefeitura de Chã Preta - AL abre concursos com salários de até R$ 7.256,60", "");
  assert.equal(pref?.chave, "pref-cha-preta-al");
  assert.equal(pref?.nome, "Prefeitura de Chã Preta (AL)");
  assert.equal(identificarOrgao("Prefeitura de Caruaru abre concurso para analista de sistemas", "")?.uf, "PE");
  assert.equal(identificarOrgao("Concurso Câmara Caruaru PE: banca em definição", "")?.uf, "PE");
  assert.equal(identificarOrgao("Dicas para estudar melhor", ""), null);
});

test("panorama: matéria sobre vários concursos não vira concurso", () => {
  assert.equal(ehPanorama("Concursos Segurança PE: como conciliar PM, PC e Bombeiros?"), true);
  assert.equal(ehPanorama("Concursos e seleções em Pernambuco: 757 vagas"), true);
  assert.equal(ehPanorama("Concurso TRT PE: homologado"), false);
});

test("datas: fim da inscrição, isenção e prova", () => {
  const n = normalizar("Pedidos de isenção até 25/05. As inscrições vão de 18/05 até 22/06/2026. A prova objetiva será em 09/08/2026.");
  assert.deepEqual(extrairDatas(n, ref), { inscricoesAte: "2026-06-22", isencaoAte: "2026-05-25", provaEm: "2026-08-09" });
  // Sem ano e já passado há mais de 2 meses: é do ano seguinte.
  assert.equal(extrairDatas(normalizar("inscrições até 10 de janeiro"), ref).inscricoesAte, "2027-01-10");
});

test("extrair: matéria completa de TI", () => {
  const e = extrair({
    titulo: "Concurso ATI PE: edital publicado com 60 vagas",
    texto: "A Agência de Tecnologia da Informação publicou o edital. A banca é o Cebraspe. Há cadastro reserva. "
      + "O cargo de Analista de TI exige curso superior de tecnologia ou bacharelado, com remuneração de R$ 7.200,00. "
      + "Inscrições até 20/06/2026, taxa de inscrição de R$ 120,00. As provas serão aplicadas em Recife e Petrolina em 26/07/2026. "
      + "Haverá prova discursiva e avaliação de títulos.",
    publicadoEm: ref,
    pdfs: ["https://cebraspe.org.br/edital_ati_pe.pdf"],
  });
  assert.equal(e.orgao?.chave, "ati-pe");
  assert.equal(e.fase, "edital");
  assert.equal(e.banca, "Cebraspe");
  assert.equal(e.vagas, 60);
  assert.equal(e.cadastroReserva, true);
  assert.equal(e.taxaCentavos, 12000);
  assert.equal(e.inscricoesAte, "2026-06-20");
  assert.equal(e.provaEm, "2026-07-26");
  assert.equal(e.aceitaTecnologo, true);
  assert.deepEqual(e.cidadesProva.sort(), ["petrolina", "recife"]);
  assert.deepEqual(e.etapas, ["discursiva", "títulos"]);
  assert.deepEqual(e.salarios, [{ centavos: 720000, final: false, ti: true, acessivel: true }]);
});

const base: Agregado = agregar([]);
const ag = (parcial: Partial<Agregado>): Agregado => ({ ...base, ...parcial });

test("avaliar: TI com salário bom em PE aparece com peso alto", () => {
  const a = avaliar({ uf: "PE" }, ag({ temTi: true, fase: "inscricoes", salarios: [{ centavos: 800000, final: false, ti: true }] }));
  assert.equal(a.visivel, true);
  assert.equal(a.situacaoSalario, "ok");
  assert.equal(a.peso, 1);
});

test("avaliar: o que fica de fora", () => {
  assert.equal(avaliar({ uf: "PE", area: "fora" }, ag({ temTi: true })).visivel, false);
  assert.match(avaliar({ uf: "PE" }, ag({})).motivo!, /sem cargo/);
  assert.match(avaliar({ uf: "PE" }, ag({ temTi: true, salarios: [{ centavos: 500000, final: false, ti: true }] })).motivo!, /abaixo/);
  assert.match(avaliar({ uf: "PE" }, ag({ temTi: true, exigeBacharelado: true })).motivo!, /bacharelado/);
  // Sem salário de TI, mas o maior salário do concurso é 3.500: o de TI também não chega a 6 mil.
  assert.equal(avaliar({ uf: "PE" }, ag({ temTi: true, salarios: [{ centavos: 350000, final: false, ti: false }] })).visivel, false);
});

test("avaliar: salário desconhecido aparece; só o final acima de 6 mil aparece com peso baixo", () => {
  const desconhecido = avaliar({ uf: "PE" }, ag({ temTi: true }));
  assert.equal(desconhecido.visivel, true);
  assert.equal(desconhecido.situacaoSalario, "desconhecido");
  const pc = avaliar({ uf: "PE", area: "policia" }, ag({
    fase: "edital", salarios: [{ centavos: 470000, final: false, ti: false }, { centavos: 1093051, final: true, ti: false }],
  }));
  assert.equal(pc.situacaoSalario, "so_final");
  assert.equal(pc.area, "policia");
  const ti = avaliar({ uf: "PE" }, ag({ temTi: true, fase: "edital", salarios: [{ centavos: 800000, final: false, ti: true }] }));
  assert.ok(pc.peso < ti.peso / 2);
});

test("avaliar: região — vizinho abaixo de PE, nacional com prova nas capitais conta como perto", () => {
  const com = (uf: string, extra: Partial<Agregado> = {}) => avaliar({ uf }, ag({ temTi: true, salarios: [{ centavos: 900000, final: false, ti: true }], ...extra })).peso;
  assert.ok(com("PE") > com("PB"));
  assert.ok(com("PB") > com("BA"));
  assert.ok(com("BA") > com("SP"));
  assert.ok(com("BR") < com("BR", { provaNasCapitais: true }));
  assert.equal(com("BR", { provaNasCapitais: true }), com("PE"));
});

test("agregar: fase não volta, prazo mais recente vence, listas se somam", () => {
  const e = (fase: string, inscricoesAte: string | null, etapas: string[]) =>
    ({ ...extrair({ titulo: "x", texto: "", publicadoEm: null }), fase, inscricoesAte, etapas }) as ReturnType<typeof extrair>;
  const a = agregar([
    { publicadoEm: "2026-05-01T00:00:00Z", extracao: e("inscricoes", "2026-06-01", ["discursiva"]) },
    { publicadoEm: "2026-05-20T00:00:00Z", extracao: e("rumor", "2026-06-15", ["TAF"]) },
  ]);
  assert.equal(a.fase, "inscricoes");
  assert.equal(a.inscricoesAte, "2026-06-15");
  assert.deepEqual(a.etapas, ["discursiva", "TAF"]);
});

test("eventos: o que mudou", () => {
  assert.deepEqual(eventos(null, ag({ fase: "rumor" })), [{ tipo: "novo", descricao: "Novo concurso (rumor)" }]);
  const depois = ag({ fase: "edital", banca: "FGV", inscricoesAte: "2026-11-20", editais: ["https://x/edital.pdf"] });
  assert.deepEqual(eventos(ag({ fase: "banca" }), depois).map((e) => e.descricao), [
    "Agora: edital publicado", "Banca: FGV", "Inscrições até 20/11", "Edital (PDF) disponível",
  ]);
  assert.deepEqual(eventos(depois, depois), []);
});

test("listagem: links de matéria com o contexto; pré-filtro por salário e cargo", () => {
  const html = `<html><body><nav><a href="/sobre">Sobre o site e a equipe do portal</a></nav>
    <div class="ca"><a href="/noticias/prefeitura-de-rio-real-ba-retifica-editais" title="Prefeitura de Rio Real - BA retifica editais de concursos">x</a>
      <div>BA</div><div>148 vagas até R$ 4.430,06</div></div>
    <div class="ca"><a href="/noticias/trt-pe-abre-concurso">TRT PE abre concurso para Analista de TI</a><div>PE</div><div>30 vagas até R$ 16.000,00</div></div>
    <div class="ca"><a href="/noticias/salvador-guardas">Prefeitura de Salvador - BA abre concurso para guardas civis municipais</a></div>
    <a href="https://outro.site/noticias/x">Concurso de outro site que não interessa aqui</a>
  </body></html>`;
  const itens = itensDaListagem(html, "https://www.pciconcursos.com.br/concursos/nordeste/", "^/noticias/");
  assert.deepEqual(itens.map((i) => i.url.split("/").pop()), ["prefeitura-de-rio-real-ba-retifica-editais", "trt-pe-abre-concurso", "salvador-guardas"]);
  assert.match(itens[0]!.contexto, /4\.430,06/);
  assert.deepEqual(itens.map((i) => valeAbrir(i, 600_000)), [false, true, false]);
});

test("pdfs da matéria: só edital/retificação", () => {
  const html = `<a href="/arquivos/edital-abertura.pdf">Edital</a><a href="/x/manual.pdf">Manual do candidato</a>
    <a href="https://banca.org/retificacao_1.pdf">Retificação 1</a>`;
  assert.deepEqual(pdfsDaPagina(html, "https://site.com/noticia"), ["https://site.com/arquivos/edital-abertura.pdf", "https://banca.org/retificacao_1.pdf"]);
});

// ───────── PDF do edital ─────────

import { lerEdital } from "../src/editais/pdf.js";

const EDITAL = `EDITAL Nº 1 – ATI PE, DE 10 DE MAIO DE 2026
CARGO 1: ANALISTA EM GESTÃO DE TI – ÁREA: DESENVOLVIMENTO DE SISTEMAS
REQUISITO: diploma de graduação em nível superior na área de Tecnologia da Informação, incluindo cursos superiores de tecnologia. REMUNERAÇÃO: R$ 7.854,32.
CARGO 2: ADMINISTRADOR
REQUISITO: bacharelado em Administração. REMUNERAÇÃO: R$ 7.854,32.
2.1 Período de inscrições: das 10 horas do dia 18 de maio de 2026 às 18 horas do dia 22 de junho de 2026.
2.2 Período de solicitação de isenção da taxa: 18/05/2026 a 25/05/2026. Taxa de inscrição: R$ 120,00.
3.1 A aplicação das provas objetivas e discursiva será em 9 de agosto de 2026, na cidade de Recife.
3.5 As inscrições homologadas serão divulgadas em 10/07/2026.
ANEXO II – OBJETOS DE AVALIAÇÃO (CONTEÚDO PROGRAMÁTICO)
CONHECIMENTOS BÁSICOS: LÍNGUA PORTUGUESA: 1 Compreensão de textos. 2 Ortografia oficial. RACIOCÍNIO LÓGICO: 1 Estruturas lógicas. 2 Lógica de argumentação.
CARGO 1: ANALISTA EM GESTÃO DE TI – ÁREA: DESENVOLVIMENTO DE SISTEMAS
ENGENHARIA DE SOFTWARE: 1 Ciclo de vida de software. 2 Metodologias ágeis: Scrum, Kanban. 3 UML. BANCO DE DADOS: 1 Modelagem entidade-relacionamento. 2 Normalização. 3 SQL.
CARGO 2: ADMINISTRADOR
ADMINISTRAÇÃO GERAL: 1 Planejamento. 2 Organização.`;

test("edital (PDF): cronograma pelo período certo, não por qualquer data perto de 'inscrições'", () => {
  const e = lerEdital(EDITAL, 30, ref);
  assert.equal(e.inscricoesAte, "2026-06-22"); // não 10/07 (inscrições homologadas)
  assert.equal(e.isencaoAte, "2026-05-25");
  assert.equal(e.provaEm, "2026-08-09");
  assert.equal(e.taxaCentavos, 12000);
  assert.deepEqual(e.cidadesProva, ["recife"]);
});

test("edital (PDF): cargo de TI com requisito e salário só dele (o bacharelado do cargo 2 não vaza)", () => {
  const e = lerEdital(EDITAL, 30, ref);
  assert.deepEqual(e.cargosTi.map((c) => [c.nome, c.aceitaTecnologo, c.exigeBacharelado]), [
    ["ANALISTA EM GESTÃO DE TI – ÁREA: DESENVOLVIMENTO DE SISTEMAS", true, false],
  ]);
  assert.equal(e.aceitaTecnologo, true);
  assert.equal(e.exigeBacharelado, false);
  assert.deepEqual(e.salarios, [{ centavos: 785432, final: false, ti: true, acessivel: true }]);
});

test("edital (PDF): conteúdo programático em gerais + TI, sem o cargo que não é de TI", () => {
  const { programatico } = lerEdital(EDITAL, 30, ref);
  assert.deepEqual(programatico.map((g) => [g.grupo, g.materias.map((m) => m.nome)]), [
    ["Conhecimentos gerais", ["LÍNGUA PORTUGUESA", "RACIOCÍNIO LÓGICO"]],
    ["CARGO 1: ANALISTA EM GESTÃO DE TI – ÁREA: DESENVOLVIMENTO DE SISTEMAS", ["ENGENHARIA DE SOFTWARE", "BANCO DE DADOS"]],
  ]);
  assert.deepEqual(programatico[1]!.materias[0]!.assuntos, ["Ciclo de vida de software", "Metodologias ágeis: Scrum, Kanban", "UML"]);
});

test("agregar: PDF do edital manda no requisito; edital anterior não mexe na fase", () => {
  const noticia = extrair({ titulo: "Concurso ATI PE: edital publicado", texto: "Exige bacharelado em Ciência da Computação. Analista de TI.", publicadoEm: ref });
  assert.equal(noticia.exigeBacharelado, true);
  const pdf = lerEdital(EDITAL, 30, ref);
  const a = agregar([
    { publicadoEm: "2026-05-10T00:00:00Z", extracao: noticia },
    { publicadoEm: "2026-05-11T00:00:00Z", extracao: pdf, tipo: "edital" },
    { publicadoEm: "2026-05-12T00:00:00Z", extracao: { ...pdf, fase: "encerrado", inscricoesAte: "2019-01-01" }, tipo: "anterior", url: "https://x/2019.pdf" },
  ]);
  assert.equal(a.aceitaTecnologo, true);
  assert.equal(a.exigeBacharelado, false);
  assert.equal(a.fase, "edital");
  assert.equal(a.inscricoesAte, "2026-06-22");
  assert.equal(a.editalAnterior, "https://x/2019.pdf");
  assert.equal(a.programaticoAnterior.length, 2);
});

test("página provável do concurso no Gran", async () => {
  // fontes-extras importa o extrator, que importa o banco (que lê DATABASE_URL ao carregar).
  process.env.DATABASE_URL ??= "postgres://teste@localhost/teste";
  const { paginasProvaveis } = await import("../src/editais/fontes-extras.js");
  assert.deepEqual(paginasProvaveis("pc-pe", "Polícia Civil PE").slice(0, 3), [
    "https://blog.grancursosonline.com.br/concurso-pc-pe/",
    "https://blog.grancursosonline.com.br/concurso-policia-civil-pe/",
    "https://blog.grancursosonline.com.br/concurso-pcpe/",
  ]);
});

test("rota única /api/editais: lê a rota do rewrite (?rota=) ou do caminho original", async () => {
  process.env.DATABASE_URL ??= "postgres://teste@localhost/teste";
  const { rotaDe } = await import("../api/editais.js");
  assert.deepEqual(rotaDe(new URL("https://x/api/editais?rota=12/favorito")), ["12", "favorito"]);
  assert.deepEqual(rotaDe(new URL("https://x/api/editais/12/interesse")), ["12", "interesse"]);
  assert.deepEqual(rotaDe(new URL("https://x/api/editais/em-alta?uf=PE")), ["em-alta"]);
  assert.deepEqual(rotaDe(new URL("https://x/api/editais?tipo=abertos")), []);
});

test("coleta: abre primeiro o que é de PE, depois vizinhos, BA, nacional e o resto", async () => {
  process.env.DATABASE_URL ??= "postgres://teste@localhost/teste";
  const { prioridade } = await import("../src/editais/collect.js");
  const item = (titulo: string, contexto = "") => ({ url: "https://x", titulo, contexto });
  const ordem = [
    item("Prefeitura de Fortaleza - CE abre concurso para analista", "CE 10 vagas"),
    item("Concurso Banco do Brasil: edital publicado"),
    item("Sefaz - BA abre concurso", "BA"),
    item("Prefeitura de Caruaru - PE abre concurso para analista de sistemas", "PE"),
    item("TJ PB publica edital", "PB"),
  ].sort((a, b) => prioridade(a) - prioridade(b)).map((i) => i.titulo.split(" ")[2]);
  assert.deepEqual(ordem, ["Caruaru", "publica", "BA", "do", "Fortaleza"]);
});

test("temporário: duração do contrato, sem confundir com a validade do concurso", async () => {
  const { duracaoTemporario } = await import("../src/editais/extract.js");
  const d = (t: string) => duracaoTemporario(normalizar(t));
  assert.deepEqual(d("O contrato terá duração de 12 meses, prorrogável por igual período."), { meses: 12, prorrogavel: true, ateMeses: 24 });
  assert.deepEqual(d("Contratação temporária por até 2 anos, podendo ser prorrogada por mais 1 ano."), { meses: 24, prorrogavel: true, ateMeses: 36 });
  assert.deepEqual(d("A seleção tem validade de 2 anos, prorrogável por igual período. O contrato será de 6 (seis) meses."), { meses: 6, prorrogavel: false, ateMeses: null });
  assert.deepEqual(d("Processo seletivo simplificado com vigência de um ano."), { meses: 12, prorrogavel: false, ateMeses: null });
  assert.equal(d("O concurso terá validade de dois anos."), null);
  const e = extrair({ titulo: "Prefeitura abre seleção temporária para analista de TI", texto: "Contratos temporários de 24 meses.", publicadoEm: ref });
  assert.equal(e.regime, "temporario");
  assert.deepEqual(e.duracao, { meses: 24, prorrogavel: false, ateMeses: null });
});

test("avaliar: fora do perfil entra em Todos/Rumores (geral) se pagar 6 mil ou mais", () => {
  const auditor = avaliar({ uf: "AL" }, ag({ fase: "inscricoes", salarios: [{ centavos: 2_527_068, final: false, ti: false }] }));
  assert.equal(auditor.visivel, false);
  assert.equal(auditor.visivelGeral, true);
  assert.equal(auditor.salarioInicialCentavos, 2_527_068);
  const ti = avaliar({ uf: "AL" }, ag({ temTi: true, fase: "inscricoes", salarios: [{ centavos: 800_000, final: false, ti: true }] }));
  assert.equal(ti.visivelGeral, true);
  assert.ok(ti.pesoGeral > auditor.pesoGeral); // TI pesa mais que outra área na mesma região e fase
  assert.equal(avaliar({ uf: "PE", area: "fora" }, ag({ salarios: [{ centavos: 1_200_000, final: false, ti: false }] })).visivelGeral, false);
  assert.equal(avaliar({ uf: "PE" }, ag({ salarios: [{ centavos: 500_000, final: false, ti: false }] })).visivelGeral, false);
  assert.equal(avaliar({ uf: "PE" }, ag({})).visivelGeral, false); // fora do perfil e sem salário: não aparece
});

test("lista geral: só o que você pode fazer (diploma, técnico, sem diploma); concurso só de médico/juiz sai", () => {
  const geral = (titulo: string, texto: string) => {
    const e = extrair({ titulo, texto, publicadoEm: ref });
    return avaliar({ uf: "PE" }, agregar([{ publicadoEm: null, extracao: e }]));
  };
  // Só de médico: sai, mesmo pagando bem.
  const medico = geral("Prefeitura de Caruaru - PE abre concurso para médicos", "Salário de R$ 15.000,00 para médico clínico geral.");
  assert.equal(medico.visivelGeral, false);
  assert.match(medico.motivo!, /formação específica \(medicina\)/);
  // Juiz: sai.
  assert.equal(geral("Concurso TJ PE: edital para juiz substituto", "Subsídio de R$ 35.877,28.").visivelGeral, false);
  // Técnico de enfermagem e segurança do trabalho (curso técnico): fica.
  const tecnico = geral("Hospital das Clínicas abre seleção para técnico em enfermagem e técnico em segurança do trabalho",
    "Técnico em enfermagem: salário de R$ 6.200,00.");
  assert.equal(tecnico.visivelGeral, true);
  // Nível médio: fica.
  assert.equal(geral("Concurso Banco do Brasil: edital publicado", "Escriturário de nível médio com remuneração de R$ 6.500,00.").visivelGeral, true);
  // Qualquer superior: fica.
  assert.equal(geral("Sefaz - AL abre concurso para auditor", "Exige nível superior em qualquer área. Remuneração de R$ 25.270,68.").visivelGeral, true);
  // Médico e técnico juntos: vale o salário do técnico (R$ 2.500), não o "até R$ 15 mil" do médico.
  const misto = geral("Prefeitura de Olinda - PE abre concurso para médico e técnico em enfermagem",
    "Médico: salário de R$ 15.000,00. " + "x".repeat(300) + " Técnico em enfermagem: salário de R$ 2.500,00.");
  assert.equal(misto.visivelGeral, false);
  // Requisito não dito e sem formação específica: aparece, pesando menos.
  const semReq = geral("Sefaz - BA abre concurso", "Remuneração de R$ 20.000,00.");
  const comReq = geral("Sefaz - BA abre concurso", "Nível superior em qualquer área. Remuneração de R$ 20.000,00.");
  assert.equal(semReq.visivelGeral, true);
  assert.ok(semReq.pesoGeral < comReq.pesoGeral);
});

test("regime: temporário só com sinal forte; concurso efetivo vence; seleção vira concurso separado", () => {
  // Concurso do TJPB com uma menção solta a temporário (link de outra seleção): não é temporário.
  const tj = extrair({
    titulo: "Concurso TJ PB: edital publicado com 50 vagas para Analista Judiciário",
    texto: "O Tribunal de Justiça da Paraíba publicou o edital do concurso público para ingresso no quadro de pessoal. "
      + "Veja também: prefeitura abre contratação temporária para professores.",
    publicadoEm: ref,
  });
  assert.equal(tj.regime, "estatutario");
  assert.equal(tj.orgao?.chave, "tj-pb");
  // Seleção de juiz leigo do mesmo tribunal: temporária e em outro "concurso".
  const leigo = extrair({ titulo: "TJ PB abre seleção para juiz leigo", texto: "Processo seletivo simplificado, contrato de 2 anos.", publicadoEm: ref });
  assert.equal(leigo.regime, "temporario");
  assert.equal(leigo.orgao?.chave, "tj-pb-selecao");
  // Texto com contratação temporária repetida e nenhum sinal de efetivo: temporário.
  assert.equal(extrair({ titulo: "Secretaria de Saúde de PE abre vagas", texto: "Contratação temporária por excepcional interesse público. Os contratos temporários duram 12 meses.", publicadoEm: ref }).regime, "temporario");
  // Uma menção só, sem título de seleção: não basta.
  assert.notEqual(extrair({ titulo: "Detran PE abre vagas", texto: "Haverá contratação temporária de apoio na sede.", publicadoEm: ref }).regime, "temporario");
  // No resumo, efetivo vence temporário.
  const a = agregar([
    { publicadoEm: "2026-10-20T00:00:00Z", extracao: { ...tj, regime: "estatutario" } },
    { publicadoEm: "2026-10-21T00:00:00Z", extracao: { ...tj, regime: "temporario" } },
  ]);
  assert.equal(a.regime, "estatutario");
});
