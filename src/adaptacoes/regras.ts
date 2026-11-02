/**
 * Regras puras do módulo Adaptações: fase a partir do status do TMDB, aba da lista, nota de fama e comparação de
 * títulos e autores. Sem banco e sem rede (testadas em test/adaptacoes.test.ts).
 */

export type Tipo = "filme" | "serie";
export type Fase = "anunciado" | "producao" | "pos" | "com_data" | "lancado" | "cancelado";
export type Aba = "data" | "anunciados";

/**
 * Fase da adaptação. `null` = rumor (fica para a fase 2 do módulo; não entra).
 * Filme em produção com data no TMDB continua "producao": nessa fase a data costuma ser palpite.
 * Série com estreia futura já conta como "com_data" (o TMDB só põe data de série quando ela é anunciada).
 */
export function faseDe(tipo: Tipo, status: string | null, estreia: string | null, hoje: string): Fase | null {
  const futura = !!estreia && estreia >= hoje;
  const s = (status ?? "").toLowerCase();
  if (s === "canceled" || s === "cancelled") return "cancelado";
  if (tipo === "filme") {
    if (s === "rumored") return null;
    if (s === "planned") return "anunciado";
    if (s === "in production") return "producao";
    if (s === "post production") return futura ? "com_data" : "pos";
    if (s === "released") return estreia && estreia > hoje ? "com_data" : "lancado";
    return futura ? "com_data" : "anunciado";
  }
  if (futura) return "com_data";
  if (s === "planned" || s === "pilot") return "anunciado";
  if (s === "in production") return "producao";
  if (s === "returning series" || s === "ended") return "lancado";
  return "anunciado";
}

export function abaDe(fase: Fase): Aba | null {
  if (fase === "com_data") return "data";
  if (fase === "anunciado" || fase === "producao" || fase === "pos") return "anunciados";
  return null;
}

// ---------------------------------------------------------------- nota de fama (0 a 100)

/** Semanas na lista do NYT (70%, teto 52) + melhor posição (30%: #1 vale tudo, #15 quase nada). Até 50. */
export function notaNyt(semanas: number | null, melhor: number | null): number {
  if (!semanas || semanas <= 0) return 0;
  const s = Math.min(semanas, 52) / 52;
  const m = melhor && melhor > 0 ? (16 - Math.min(melhor, 15)) / 15 : 0;
  return Math.round((0.7 * s + 0.3 * m) * 50);
}

/**
 * Leitores na Open Library ("quero ler" + "lendo" + "lido"), em escala logarítmica. Até 30.
 * Os números de lá são pequenos (Duna tem uns 4 mil), por isso 5 mil já vale o máximo.
 */
export const LEITORES_TETO = 5000;
export function notaLeitores(leitores: number | null): number {
  if (!leitores || leitores <= 0) return 0;
  return Math.round(Math.min(1, Math.log10(leitores + 1) / Math.log10(LEITORES_TETO + 1)) * 30);
}

/** Percentil da popularidade do TMDB entre as adaptações da lista. Até 20. */
export function notaPopularidade(popularidade: number, todas: number[]): number {
  if (todas.length <= 1) return todas.length ? 20 : 0;
  const abaixo = todas.filter((p) => p < popularidade).length;
  return Math.round((abaixo / (todas.length - 1)) * 20);
}

export interface Nota {
  total: number;
  nyt: number;
  leitores: number;
  popularidade: number;
}

export function nota(
  livro: { nytSemanas: number | null; nytMelhor: number | null; leitores: number | null } | null,
  popularidade: number,
  todas: number[],
): Nota {
  const nyt = livro ? notaNyt(livro.nytSemanas, livro.nytMelhor) : 0;
  const leitores = livro ? notaLeitores(livro.leitores) : 0;
  const pop = notaPopularidade(popularidade, todas);
  return { total: nyt + leitores + pop, nyt, leitores, popularidade: pop };
}

// ---------------------------------------------------------------- títulos e autores

const ARTIGOS = new Set(["the", "a", "an", "o", "os", "as", "um", "uma", "el", "la", "los", "las", "le", "les"]);

/** minúsculas, sem acento nem pontuação, sem artigo no começo. */
export function normalizar(texto: string): string {
  const palavras = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (palavras.length > 1 && ARTIGOS.has(palavras[0]!)) palavras.shift();
  return palavras.join(" ");
}

/** Mesmo título, ignorando o subtítulo depois de ":" (filme "Duna: Parte Dois" × livro "Duna"). */
export function mesmoTitulo(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const base = (t: string) => normalizar(t.split(/[:(–—-]/)[0] ?? t);
  return base(a) === y || x === base(b) || (base(a) === base(b) && base(a).length >= 4);
}

/** O sobrenome do autor aparece no outro nome ("Andy Weir" × "Weir, Andy"). */
export function mesmoAutor(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const sobrenome = normalizar(a).split(" ").filter((p) => p.length > 1).pop();
  return !!sobrenome && normalizar(b).split(" ").includes(sobrenome);
}
