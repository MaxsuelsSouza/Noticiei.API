import { mesmoAutor, mesmoTitulo, type Tipo } from "./regras.js";

/**
 * Clientes das fontes do módulo Adaptações. Cada função recebe `buscar` (o fetch), para os testes trocarem a rede
 * por respostas gravadas. Sem IA: só filtros das APIs e comparação de títulos e autores.
 *
 * - TMDB (chave TMDB_API_KEY): filmes e séries com a palavra-chave 818 ("based on novel or book").
 * - Wikidata (sem chave): "baseado em" (P144) da obra → livro, com autor, ano e chave da Open Library.
 * - Open Library (sem chave): obra, autor, ano e contagem de leitores.
 * - NYT Books (chave NYT_API_KEY, opcional): histórico do livro na lista de mais vendidos.
 */
export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

const USER_AGENT = "Noticiei/1.0 (app pessoal; modulo Adaptacoes)";
const TMDB = "https://api.themoviedb.org/3";
const IMAGEM = "https://image.tmdb.org/t/p/w342";
export const KEYWORD_LIVRO = 818;

export class ErroFonte extends Error {
  constructor(public fonte: string, public status: number, mensagem: string) {
    super(`${fonte}: ${mensagem}`);
  }
}

async function pegarJson(buscar: Buscar, fonte: string, url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<any> {
  const r = await buscar(url, {
    ...init,
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new ErroFonte(fonte, r.status, `HTTP ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------- TMDB

/** Chave v3 (32 caracteres) vai na URL; o token de leitura v4 (longo) vai no header. */
function tmdb(chave: string, caminho: string, params: Record<string, string | number | boolean>) {
  const url = new URL(TMDB + caminho);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const init: RequestInit = {};
  if (chave.length > 40) init.headers = { authorization: `Bearer ${chave}` };
  else url.searchParams.set("api_key", chave);
  return { url: url.toString(), init };
}

export interface Achado {
  tipo: Tipo;
  tmdbId: number;
}

/** Soma `meses` a uma data YYYY-MM-DD. */
export function somarMeses(data: string, meses: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

/**
 * Adaptações de livro que ainda não estrearam:
 * - filmes com estreia de hoje a 24 meses (filme sem data quase nunca aparece no "discover" do TMDB);
 * - séries planejadas, em produção ou piloto (com ou sem data) e séries com primeira exibição de hoje a 24 meses.
 * As mais populares primeiro; `paginas` limita o total (20 por página).
 */
export async function descobrir(buscar: Buscar, chave: string, hoje: string, paginas = 3): Promise<Achado[]> {
  const ate = somarMeses(hoje, 24);
  const base = { with_keywords: KEYWORD_LIVRO, sort_by: "popularity.desc", include_adult: false, language: "pt-BR" };
  const consultas: { tipo: Tipo; caminho: string; params: Record<string, string | number | boolean>; paginas: number }[] = [
    { tipo: "filme", caminho: "/discover/movie", params: { ...base, "primary_release_date.gte": hoje, "primary_release_date.lte": ate }, paginas },
    { tipo: "serie", caminho: "/discover/tv", params: { ...base, with_status: "1|2|5", include_null_first_air_dates: true }, paginas: Math.max(1, paginas - 1) },
    { tipo: "serie", caminho: "/discover/tv", params: { ...base, "first_air_date.gte": hoje, "first_air_date.lte": ate }, paginas: Math.max(1, paginas - 1) },
  ];
  const vistos = new Set<string>();
  const achados: Achado[] = [];
  for (const c of consultas) {
    for (let page = 1; page <= c.paginas; page++) {
      const { url, init } = tmdb(chave, c.caminho, { ...c.params, page });
      const r = await pegarJson(buscar, "TMDB", url, init);
      for (const item of (r.results ?? []) as { id: number }[]) {
        const chaveItem = `${c.tipo}:${item.id}`;
        if (!Number.isSafeInteger(item.id) || vistos.has(chaveItem)) continue;
        vistos.add(chaveItem);
        achados.push({ tipo: c.tipo, tmdbId: item.id });
      }
      if (page >= (r.total_pages ?? 1)) break;
    }
  }
  return achados;
}

export interface Producao {
  tipo: Tipo;
  tmdbId: number;
  titulo: string;
  tituloOriginal: string | null;
  status: string | null;
  estreia: string | null;
  estreiaBr: string | null;
  popularidade: number;
  capa: string | null;
  direcao: string | null;
  autorCreditado: string | null;
}

/** Funções da equipe que indicam o autor do livro de origem. */
const FUNCOES_AUTOR = new Set(["novel", "book", "author", "short story", "graphic novel", "novelist"]);

const data = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

function autorDaEquipe(...equipes: unknown[]): string | null {
  for (const equipe of equipes) {
    for (const p of (Array.isArray(equipe) ? equipe : []) as { name?: string; job?: string; jobs?: { job?: string }[] }[]) {
      const funcoes = [p.job, ...(p.jobs ?? []).map((j) => j.job)].filter(Boolean).map((j) => j!.toLowerCase());
      if (p.name && funcoes.some((f) => FUNCOES_AUTOR.has(f))) return p.name;
    }
  }
  return null;
}

/** Estreia no Brasil: a primeira data de cinema (2, 3) ou digital (4) com país BR. */
function estreiaBrasil(releaseDates: unknown): string | null {
  const paises = ((releaseDates as { results?: unknown[] } | undefined)?.results ?? []) as { iso_3166_1?: string; release_dates?: { release_date?: string; type?: number }[] }[];
  const br = paises.find((p) => p.iso_3166_1 === "BR");
  const datas = (br?.release_dates ?? []).filter((d) => d.type === 2 || d.type === 3 || d.type === 4).map((d) => data(d.release_date)).filter(Boolean) as string[];
  return datas.sort()[0] ?? null;
}

export function lerProducao(tipo: Tipo, j: any): Producao {
  const filme = tipo === "filme";
  const titulo = String((filme ? j.title : j.name) || (filme ? j.original_title : j.original_name) || "").trim();
  const original = String((filme ? j.original_title : j.original_name) ?? "").trim();
  const diretor = filme
    ? ((j.credits?.crew ?? []) as { job?: string; name?: string }[]).find((p) => p.job === "Director")?.name ?? null
    : ((j.created_by ?? []) as { name?: string }[]).map((p) => p.name).filter(Boolean).slice(0, 2).join(", ") || null;
  return {
    tipo,
    tmdbId: Number(j.id),
    titulo: titulo.slice(0, 300),
    tituloOriginal: original && original !== titulo ? original.slice(0, 300) : null,
    status: typeof j.status === "string" ? j.status : null,
    estreia: data(filme ? j.release_date : j.first_air_date),
    estreiaBr: filme ? estreiaBrasil(j.release_dates) : null,
    popularidade: Number(j.popularity) || 0,
    capa: typeof j.poster_path === "string" && j.poster_path ? IMAGEM + j.poster_path : null,
    direcao: diretor,
    autorCreditado: autorDaEquipe(j.credits?.crew, j.aggregate_credits?.crew),
  };
}

export async function detalhar(buscar: Buscar, chave: string, a: Achado): Promise<Producao> {
  const caminho = a.tipo === "filme" ? `/movie/${a.tmdbId}` : `/tv/${a.tmdbId}`;
  const extra = a.tipo === "filme" ? "credits,release_dates" : "credits,aggregate_credits";
  const { url, init } = tmdb(chave, caminho, { language: "pt-BR", append_to_response: extra });
  return lerProducao(a.tipo, await pegarJson(buscar, "TMDB", url, init));
}

// ---------------------------------------------------------------- Wikidata

export interface LivroWikidata {
  wikidata: string;
  titulo: string;
  autor: string | null;
  ano: number | null;
  olKey: string | null;
}

/** Tipos aceitos como livro: obra literária, obra escrita, romance, livro, séries de livros/romances, novela, conto, HQ. */
const TIPOS_LIVRO = ["Q7725634", "Q47461344", "Q8261", "Q571", "Q1667921", "Q277759", "Q149537", "Q49084", "Q725377"];

export function consultaWikidata(tipo: Tipo, ids: number[]): string {
  const prop = tipo === "filme" ? "P4947" : "P4983";
  return `SELECT ?tmdb ?livro ?livroLabel ?autorLabel ?ano ?ol WHERE {
  VALUES ?tmdb { ${ids.map((i) => `"${i}"`).join(" ")} }
  VALUES ?tipo { ${TIPOS_LIVRO.map((q) => `wd:${q}`).join(" ")} }
  ?obra wdt:${prop} ?tmdb ; wdt:P144 ?livro .
  ?livro wdt:P31 ?tipo .
  OPTIONAL { ?livro wdt:P50 ?autor . }
  OPTIONAL { ?livro wdt:P577 ?pub . BIND(YEAR(?pub) AS ?ano) }
  OPTIONAL { ?livro wdt:P648 ?ol . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,pt,mul". }
}`;
}

/** Linhas do SPARQL → um livro por id do TMDB (a primeira linha de cada, que já traz um autor). */
export function lerWikidata(j: any): Map<number, LivroWikidata> {
  const mapa = new Map<number, LivroWikidata>();
  for (const b of (j?.results?.bindings ?? []) as Record<string, { value: string } | undefined>[]) {
    const tmdbId = Number(b.tmdb?.value);
    const q = b.livro?.value.split("/").pop();
    const titulo = b.livroLabel?.value;
    if (!Number.isSafeInteger(tmdbId) || !q || !titulo || /^Q\d+$/.test(titulo)) continue;
    const anterior = mapa.get(tmdbId);
    const ol = b.ol?.value && /^OL\d+W$/.test(b.ol.value) ? b.ol.value : null;
    if (anterior) {
      if (!anterior.olKey && ol && anterior.wikidata === q) anterior.olKey = ol;
      continue;
    }
    const autor = b.autorLabel?.value && !/^Q\d+$/.test(b.autorLabel.value) ? b.autorLabel.value : null;
    const ano = Number(b.ano?.value);
    mapa.set(tmdbId, { wikidata: q, titulo: titulo.slice(0, 300), autor, ano: Number.isInteger(ano) && ano > 0 ? ano : null, olKey: ol });
  }
  return mapa;
}

export async function livrosNoWikidata(buscar: Buscar, tipo: Tipo, ids: number[]): Promise<Map<number, LivroWikidata>> {
  const mapa = new Map<number, LivroWikidata>();
  for (let i = 0; i < ids.length; i += 80) {
    const body = new URLSearchParams({ query: consultaWikidata(tipo, ids.slice(i, i + 80)), format: "json" });
    const j = await pegarJson(buscar, "Wikidata", "https://query.wikidata.org/sparql", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/sparql-results+json" },
      body: body.toString(),
    }, 30_000);
    for (const [k, v] of lerWikidata(j)) mapa.set(k, v);
  }
  return mapa;
}

// ---------------------------------------------------------------- Open Library

export interface LivroOL {
  olKey: string;
  titulo: string;
  autor: string | null;
  ano: number | null;
  leitores: number;
}

const CAMPOS_OL = "key,title,author_name,first_publish_year,want_to_read_count,already_read_count,currently_reading_count,readinglog_count";

export function lerDocOL(d: any): LivroOL | null {
  const olKey = String(d?.key ?? "").replace(/^\/works\//, "");
  if (!/^OL\d+W$/.test(olKey) || !d.title) return null;
  const soma = (Number(d.want_to_read_count) || 0) + (Number(d.already_read_count) || 0) + (Number(d.currently_reading_count) || 0);
  return {
    olKey,
    titulo: String(d.title).slice(0, 300),
    autor: Array.isArray(d.author_name) && d.author_name[0] ? String(d.author_name[0]) : null,
    ano: Number.isInteger(d.first_publish_year) ? d.first_publish_year : null,
    leitores: Math.max(soma, Number(d.readinglog_count) || 0),
  };
}

/** Busca livre (folha "Qual é o livro?" do app). */
export async function buscarNaOpenLibrary(buscar: Buscar, q: string, limite = 8): Promise<LivroOL[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limite}&fields=${CAMPOS_OL}`;
  const j = await pegarJson(buscar, "Open Library", url);
  return ((j.docs ?? []) as unknown[]).map(lerDocOL).filter((d): d is LivroOL => d !== null);
}

/**
 * Procura a obra pelo título (e autor, se houver). Aceita só resultado com o mesmo título (e o mesmo autor, quando
 * informado); com `olKey`, prefere a obra com essa chave.
 */
export async function acharNaOpenLibrary(
  buscar: Buscar, titulo: string, autor: string | null, olKey: string | null = null,
): Promise<LivroOL | null> {
  const p = new URLSearchParams({ title: titulo, limit: "5", fields: CAMPOS_OL });
  if (autor) p.set("author", autor);
  const j = await pegarJson(buscar, "Open Library", `https://openlibrary.org/search.json?${p}`);
  const docs = ((j.docs ?? []) as unknown[]).map(lerDocOL).filter((d): d is LivroOL => d !== null);
  if (olKey) {
    const exato = docs.find((d) => d.olKey === olKey);
    if (exato) return exato;
  }
  return docs.find((d) => mesmoTitulo(d.titulo, titulo) && (!autor || !d.autor || mesmoAutor(autor, d.autor))) ?? null;
}

// ---------------------------------------------------------------- NYT

export interface SinalNyt {
  semanas: number;
  melhor: number | null;
}

/** Junta o histórico de todas as listas em que o livro apareceu: semanas (o maior weeks_on_list) e melhor posição. */
export function lerNyt(j: any, titulo: string, autor: string | null): SinalNyt {
  let semanas = 0;
  let melhor: number | null = null;
  for (const r of (j?.results ?? []) as { title?: string; author?: string; ranks_history?: { rank?: number; weeks_on_list?: number }[] }[]) {
    if (!r.title || !mesmoTitulo(r.title, titulo)) continue;
    if (autor && r.author && !mesmoAutor(autor, r.author)) continue;
    for (const h of r.ranks_history ?? []) {
      if (Number(h.weeks_on_list) > semanas) semanas = Number(h.weeks_on_list);
      if (Number(h.rank) > 0 && (melhor === null || Number(h.rank) < melhor)) melhor = Number(h.rank);
    }
    if (melhor !== null && semanas === 0) semanas = 1;
  }
  return { semanas, melhor };
}

export async function nytDoLivro(buscar: Buscar, chave: string, titulo: string, autor: string | null): Promise<SinalNyt> {
  // Só pelo título: o filtro de autor do NYT quer o nome escrito igual ao deles. O autor é conferido aqui.
  const p = new URLSearchParams({ title: titulo, "api-key": chave });
  const j = await pegarJson(buscar, "NYT", `https://api.nytimes.com/svc/books/v3/lists/best-sellers/history.json?${p}`);
  return lerNyt(j, titulo, autor);
}
