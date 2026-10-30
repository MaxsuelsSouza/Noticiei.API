/**
 * Leitura do PDF do edital: baixa, tira o texto (unpdf, JS puro, roda na Vercel) e aplica regras para achar
 * cronograma, cargos de TI (requisito, salário) e o conteúdo programático (matérias e assuntos).
 * PDF escaneado (só imagem) não tem texto: fica marcado como "sem_texto".
 */
import { USER_AGENT } from "../collect/robots.js";
import { datasNoTrecho, extrair, extrairSalarios, normalizar, posicoesTi, type Extracao, type Salario } from "./extract.js";

const MAX_BYTES = 15_000_000;
const MAX_CHARS = 400_000;

export interface CargoEdital {
  nome: string;
  requisito: string | null;
  aceitaTecnologo: boolean | null;
  exigeBacharelado: boolean;
  nivelMedio: boolean;
  salarios: Salario[];
}

export interface Materia {
  nome: string;
  assuntos: string[];
}

export interface Programatico {
  /** Nome do cargo/área de TI, ou "Conhecimentos gerais" (comum a todos). */
  grupo: string;
  materias: Materia[];
}

export interface EditalExtraido extends Extracao {
  cargosTi: CargoEdital[];
  programatico: Programatico[];
  paginas: number;
}

export class PdfSemTexto extends Error {}

export async function baixarPdf(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const tamanho = Number(response.headers.get("content-length") ?? 0);
  if (tamanho > MAX_BYTES) throw new Error("PDF grande demais");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("PDF grande demais");
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") throw new Error("não é PDF");
  return bytes;
}

export async function textoDoPdf(bytes: Uint8Array): Promise<{ texto: string; paginas: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(doc, { mergePages: false });
  const texto = (text as string[]).join("\n").slice(0, MAX_CHARS);
  if (texto.replace(/\s/g, "").length < 500) throw new PdfSemTexto("PDF sem texto (provavelmente escaneado)");
  return { texto, paginas: totalPages };
}

// ───────────────────────── cronograma ─────────────────────────

/** No edital a inscrição aparece em todo canto ("inscrições homologadas"...): vale a do período de inscrição. */
const PERIODO_INSCRICAO = /periodo (de |das |para )?(solicitacao de )?inscric|inscricoes:?\s*(de|no periodo|a partir)|inscricoes (serao|poderao ser) (realizadas|efetuadas|feitas)|(realizacao|abertura) das inscricoes/g;
const PERIODO_ISENCAO = /(pedidos?|solicitacao|requerimento)( de| da)? isencao|isencao (da taxa|do pagamento)/g;
const APLICACAO_PROVA = /(aplicacao|realizacao|data) (das |da )?provas?( objetivas?)?|provas? objetivas? (sera|serao) (aplicadas?|realizadas?)/g;

function datasPerto(n: string, chave: RegExp, referencia: Date, tamanho = 120): string[] {
  // Não atravessa o fim da frase ("isenção: 20/10 a 25/10. A aplicação das provas será em 09/12").
  return [...n.matchAll(chave)].flatMap((m) =>
    datasNoTrecho(n.slice(m.index!, m.index! + m[0].length + tamanho).split(/\.\s/)[0]!, referencia));
}
const ultimaData = (d: string[]) => (d.length ? [...d].sort().at(-1)! : null);

// ───────────────────────── blocos por cargo ─────────────────────────

/** "CARGO 1:", "CARGO 12 –", "ESPECIALIDADE:", "PERFIL 3:". Sem isso o edital não separa cargos de forma confiável. */
const CABECALHO_CARGO = /\bcargo\s*\d+\b|\bcargo\s*:|\bespecialidade\s*:|\bperfil\s*\d+\b/g;

interface Bloco {
  inicio: number;
  fim: number;
  /** Texto do cabeçalho (até a quebra de linha, "requisito"/"remuneração" ou o primeiro assunto). */
  cabecalho: string;
  ti: boolean;
}

function blocosDeCargo(texto: string, n: string, de: number, ate: number): Bloco[] {
  const posicoes = [...n.slice(de, ate).matchAll(CABECALHO_CARGO)].map((m) => de + m.index!);
  return posicoes.map((inicio, i) => {
    const fim = posicoes[i + 1] ?? ate;
    const corpoN = n.slice(inicio, Math.min(fim, inicio + 250));
    const corte = [corpoN.indexOf("\n"), corpoN.search(/requisito|remunera|vencimento|escolaridade|vagas|\s1\.?\s+\S/)]
      .filter((p) => p > 0);
    const tamanho = corte.length ? Math.min(...corte) : Math.min(corpoN.length, 160);
    const cabecalho = texto.slice(inicio, inicio + tamanho).replace(/\s+/g, " ").replace(/[\s:–-]+$/, "").trim();
    return { inicio, fim, cabecalho, ti: posicoesTi(normalizar(cabecalho)).length > 0 };
  });
}

// ───────────────────────── conteúdo programático ─────────────────────────

const INICIO_PROGRAMATICO = /conteudos? programaticos?|objetos? de avaliacao|conhecimentos especificos/g;
const CABECALHO_MATERIA = /([A-ZÀ-Ý][A-ZÀ-Ý0-9 ,/()\-–]{2,80}?):\s/g;
const MAX_MATERIAS = 40;
const MAX_ASSUNTOS = 60;

/** Onde começa o conteúdo programático: a ocorrência seguida de mais cabeçalhos de matéria ("LÍNGUA PORTUGUESA:"). */
export function inicioProgramatico(texto: string, n: string): number | null {
  let melhor: { pos: number; pontos: number } | null = null;
  for (const m of n.matchAll(INICIO_PROGRAMATICO)) {
    const pontos = [...texto.slice(m.index!, m.index! + 4000).matchAll(CABECALHO_MATERIA)].length;
    if (pontos >= 2 && (!melhor || pontos > melhor.pontos || (pontos === melhor.pontos && m.index! > melhor.pos))) melhor = { pos: m.index!, pontos };
  }
  return melhor?.pos ?? null;
}

function limparAssunto(a: string): string {
  return a.replace(/\s+/g, " ").replace(/^[\s.;:–-]+|[\s.;:–-]+$/g, "").slice(0, 300);
}

export function materiasDoTrecho(trecho: string): Materia[] {
  const cabecalhos = [...trecho.matchAll(CABECALHO_MATERIA)]
    .filter((m) => /[A-ZÀ-Ý]{3,}/.test(m[1]!) && !/^(CARGO|ANEXO|ITEM|OBS|NOTA)\b/.test(m[1]!.trim()));
  const materias: Materia[] = [];
  cabecalhos.forEach((m, i) => {
    const corpo = trecho.slice(m.index! + m[0].length, cabecalhos[i + 1]?.index ?? trecho.length);
    const numerados = corpo.split(/(?:^|\s)\d{1,2}(?:\.\d{1,2})*\.?\s+(?=\p{Lu})/u).map(limparAssunto).filter((a) => a.length > 2);
    const assuntos = (numerados.length > 1 ? numerados : corpo.split(/[.;]\s+/).map(limparAssunto).filter((a) => a.length > 2)).slice(0, MAX_ASSUNTOS);
    // Pedaço de cabeçalho ("ANALISTA – ÁREA: DESENVOLVIMENTO") não é matéria.
    if (assuntos.length === 1 && assuntos[0] === assuntos[0]!.toUpperCase()) return;
    if (assuntos.length) materias.push({ nome: m[1]!.replace(/\s+/g, " ").trim(), assuntos });
  });
  return materias.slice(0, MAX_MATERIAS);
}

export function programaticoDeTi(texto: string, n: string): Programatico[] {
  const inicio = inicioProgramatico(texto, n);
  if (inicio === null) return [];
  const blocos = blocosDeCargo(texto, n, inicio, n.length);
  const grupos: Programatico[] = [];
  const primeiro = blocos[0]?.inicio ?? n.length;
  // Antes do primeiro cargo costuma vir o que é comum a todos (português, raciocínio lógico...).
  const gerais = materiasDoTrecho(texto.slice(inicio, primeiro));
  if (gerais.length) grupos.push({ grupo: "Conhecimentos gerais", materias: gerais });
  for (const b of blocos.filter((b) => b.ti)) {
    const materias = materiasDoTrecho(texto.slice(b.inicio + b.cabecalho.length, Math.min(b.fim, b.inicio + 25_000)));
    if (materias.length && !grupos.some((g) => g.grupo === b.cabecalho)) grupos.push({ grupo: b.cabecalho, materias });
  }
  return grupos;
}

// ───────────────────────── cargos de TI ─────────────────────────

const TECNOLOGO = /tecnologo|cursos? superior(es)? de tecnologia|graduacao tecnologica|qualquer (area|curso|graduacao)/;

export function cargosDeTi(texto: string, n: string, ate: number): CargoEdital[] {
  return blocosDeCargo(texto, n, 0, ate).filter((b) => b.ti).slice(0, 10).map((b) => {
    const corpo = n.slice(b.inicio, Math.min(b.fim, b.inicio + 2500));
    const m = /(requisitos?|escolaridade|formacao exigida|pre-requisito)[^]{0,400}/.exec(corpo);
    const req = m?.[0] ?? null;
    const tecnologo = req ? TECNOLOGO.test(req) : false;
    const bacharel = req ? /bacharel/.test(req) : false;
    return {
      nome: b.cabecalho.replace(/^cargo\s*\d*\s*[:–-]?\s*/i, "").slice(0, 140),
      requisito: m ? texto.slice(b.inicio + m.index, b.inicio + m.index + m[0].length).replace(/\s+/g, " ").trim() : null,
      aceitaTecnologo: tecnologo ? true : bacharel ? false : null,
      exigeBacharelado: bacharel && !tecnologo,
      nivelMedio: req ? /nivel medio|ensino medio|nivel tecnico|curso tecnico/.test(req) : false,
      salarios: extrairSalarios(corpo, true),
    };
  });
}

// ───────────────────────── tudo junto ─────────────────────────

export function lerEdital(texto: string, paginas: number, referencia: Date): EditalExtraido {
  const n = normalizar(texto);
  const base = extrair({ titulo: "", texto, publicadoEm: referencia });
  const inicioProg = inicioProgramatico(texto, n) ?? n.length;
  const cargosTi = cargosDeTi(texto, n, inicioProg);
  const aceita = cargosTi.some((c) => c.aceitaTecnologo === true) ? true : cargosTi.some((c) => c.aceitaTecnologo === false) ? false : base.aceitaTecnologo;
  return {
    ...base,
    orgao: null,
    fase: "edital",
    inscricoesAte: ultimaData(datasPerto(n, PERIODO_INSCRICAO, referencia)) ?? base.inscricoesAte,
    isencaoAte: ultimaData(datasPerto(n, PERIODO_ISENCAO, referencia)) ?? base.isencaoAte,
    provaEm: datasPerto(n, APLICACAO_PROVA, referencia)[0] ?? base.provaEm,
    salarios: cargosTi.length ? cargosTi.flatMap((c) => c.salarios) : base.salarios,
    temTi: cargosTi.length > 0 || base.temTi,
    aceitaTecnologo: aceita,
    exigeBacharelado: cargosTi.length > 0 ? cargosTi.every((c) => c.exigeBacharelado) : base.exigeBacharelado,
    nivelMedio: cargosTi.some((c) => c.nivelMedio) || base.nivelMedio,
    editais: [],
    cargosTi,
    programatico: programaticoDeTi(texto, n),
    paginas,
  };
}
