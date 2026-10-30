/**
 * Onde procurar um concurso específico (favorito, edital sumido, edital anterior), além das listagens:
 * a página do concurso no blog do Gran, a matéria já conhecida (que costuma ser atualizada no lugar)
 * e o Diário Oficial do município pelo Querido Diário (API aberta).
 */
import type { RobotsChecker } from "../collect/robots.js";
import { USER_AGENT } from "../collect/robots.js";
import { extractArticle } from "../extract/article.js";
import { fetchHtml } from "../extract/extract.js";
import { normalizar, slug } from "./extract.js";
import { pdfsDaPagina } from "./listagem.js";

export interface PaginaLida {
  url: string;
  titulo: string;
  texto: string;
  pdfs: string[];
  html: string;
}

export async function lerPagina(url: string, robots: RobotsChecker): Promise<PaginaLida | null> {
  if (!(await robots.allows(url))) return null;
  const html = await fetchHtml(url);
  const artigo = extractArticle(html, url);
  if (!artigo) return null;
  const titulo = /<title[^>]*>([^<]{5,300})<\/title>/i.exec(html)?.[1]?.replace(/\s*[|–-]\s*[^|–-]+$/, "").trim() ?? "";
  return { url, titulo, texto: artigo.blocks.map((b) => b.text).join("\n"), pdfs: pdfsDaPagina(html, url), html };
}

/** Endereços prováveis da página do concurso no blog do Gran ("/concurso-tce-sp/"). */
export function paginasProvaveis(chave: string, nome: string): string[] {
  const base = "https://blog.grancursosonline.com.br/";
  const opcoes = new Set<string>([`concurso-${chave}`, `concurso-${slug(nome)}`, `concurso-${chave.replace(/-/g, "")}`]);
  const pref = /^(pref|camara)-(.+?)(?:-(\w\w))?$/.exec(chave);
  if (pref) {
    const tipo = pref[1] === "pref" ? "prefeitura" : "camara";
    opcoes.add(`concurso-${tipo}-${pref[2]}${pref[3] ? `-${pref[3]}` : ""}`);
    opcoes.add(`concurso-${tipo}-de-${pref[2]}`);
  }
  return [...opcoes].slice(0, 4).map((s) => `${base}${s}/`);
}

/** A página existe e é mesmo sobre esse órgão (o título cita o nome ou a sigla). */
export async function paginaDoConcurso(chave: string, nome: string, robots: RobotsChecker): Promise<PaginaLida | null> {
  const sigla = chave.split("-")[0]!;
  for (const url of paginasProvaveis(chave, nome)) {
    try {
      const pagina = await lerPagina(url, robots);
      if (!pagina) continue;
      const t = normalizar(pagina.titulo);
      if (t.includes(normalizar(nome).split(" (")[0]!) || new RegExp(`\\b${sigla}`).test(t)) return pagina;
    } catch {
      // 404 e afins: tenta o próximo endereço
    }
  }
  return null;
}

// ───────────────────────── Querido Diário ─────────────────────────

const QD = "https://queridodiario.ok.org.br/api";

interface Cidade {
  territory_id: string;
  territory_name: string;
  state_code: string;
}

interface Gazette {
  date: string;
  url: string;
  excerpts: string[];
}

async function qd<T>(caminho: string): Promise<T> {
  const response = await fetch(`${QD}${caminho}`, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Querido Diário HTTP ${response.status}`);
  return (await response.json()) as T;
}

export interface MencaoDiario {
  data: string;
  url: string;
  trecho: string;
}

/**
 * Diários oficiais do município que citam concurso público desde `desde`. Só serve para prefeitura/câmara:
 * o Querido Diário cobre diários municipais (e nem todos os municípios).
 */
export async function diarioDoMunicipio(cidade: string, uf: string, desde: string): Promise<MencaoDiario[]> {
  const { cities } = await qd<{ cities: Cidade[] }>(`/cities?city_name=${encodeURIComponent(cidade)}`);
  const alvo = cities.find((c) => c.state_code === uf && normalizar(c.territory_name) === normalizar(cidade));
  if (!alvo) return [];
  const params = new URLSearchParams({
    territory_ids: alvo.territory_id, querystring: '"concurso público"', published_since: desde,
    excerpt_size: "400", number_of_excerpts: "2", size: "10", sort_by: "descending_date",
  });
  const { gazettes } = await qd<{ gazettes: Gazette[] }>(`/gazettes?${params}`);
  return gazettes.flatMap((g) => {
    const trecho = g.excerpts.map((e) => e.replace(/\s+/g, " ")).find((e) => /edital|inscri|abertura|homologa|banca/i.test(e));
    return trecho ? [{ data: g.date, url: g.url, trecho: trecho.slice(0, 400) }] : [];
  });
}
