/**
 * Lê páginas de listagem dos sites de concurso (os que testamos não têm RSS útil) e de cada matéria
 * tira os links de PDF. Regras sobre o HTML, sem depender do layout de um site específico.
 */
import { parseHTML } from "linkedom";
import { normalizar } from "./extract.js";

export interface ItemListagem {
  url: string;
  titulo: string;
  /** Texto em volta do link na listagem (o PCI põe ali UF, vagas e "até R$"). */
  contexto: string;
}

const PALAVRAS_CONCURSO = /concurso|edital|selecao|inscric|vagas|banca|autoriza|previsto/;
/** A listagem do PCI por região tem centenas de concursos: lê todos (é barato); o que abre é limitado na coleta. */
const MAX_ITENS = 600;

const limpar = (t: string) => t.replace(/\s+/g, " ").trim();

export function itensDaListagem(html: string, base: string, padraoLink?: string | null): ItemListagem[] {
  const { document } = parseHTML(html);
  const origem = new URL(base);
  const filtro = padraoLink ? new RegExp(padraoLink) : null;
  const vistos = new Set<string>();
  const itens: ItemListagem[] = [];

  for (const a of document.querySelectorAll("a[href]")) {
    let url: URL;
    try {
      url = new URL(a.getAttribute("href")!, base);
    } catch {
      continue;
    }
    if (url.hostname !== origem.hostname || !/^https?:$/.test(url.protocol)) continue;
    url.hash = "";
    if (filtro && !filtro.test(url.pathname)) continue;
    const titulo = limpar(a.getAttribute("title") || a.textContent || "");
    if (titulo.length < 25 || !PALAVRAS_CONCURSO.test(normalizar(titulo))) continue;
    if (vistos.has(url.href)) continue;
    vistos.add(url.href);
    // Sobe até achar um bloco com um pouco mais de texto que o próprio link.
    // Sobe no máximo 3 níveis (nunca até o body), senão o contexto mistura o texto de outros concursos da página.
    const proprio = limpar(a.textContent ?? "").length;
    let bloco: Element | null = a.parentElement;
    for (let nivel = 0; bloco && nivel < 3 && limpar(bloco.textContent ?? "").length < proprio + 20; nivel++) {
      const pai: Element | null = bloco.parentElement;
      if (!pai || pai.tagName === "BODY" || pai.tagName === "HTML") break;
      bloco = pai;
    }
    const texto = limpar(bloco?.textContent ?? "");
    const contexto = (texto.length < 1500 ? texto : limpar(a.textContent ?? "")).slice(0, 400);
    itens.push({ url: url.href, titulo, contexto });
    if (itens.length >= MAX_ITENS) break;
  }
  return itens;
}

/**
 * Pré-filtro barato, antes de baixar a matéria. Desde a migração 024 a coleta guarda concurso de qualquer área e
 * salário (quem filtra é o app): só fica de fora o que não é concurso público (estágio, jovem aprendiz, residência).
 */
export function valeAbrir(item: ItemListagem): boolean {
  return !/\bestagi|jovem aprendiz|residencia (medica|multiprofissional)\b/.test(normalizar(item.titulo));
}

/** Links de PDF da página da matéria (edital, retificação). */
export function pdfsDaPagina(html: string, base: string): string[] {
  const { document } = parseHTML(html);
  const pdfs = new Set<string>();
  for (const a of document.querySelectorAll("a[href]")) {
    try {
      const url = new URL(a.getAttribute("href")!, base);
      const texto = normalizar(`${a.textContent ?? ""} ${url.pathname}`);
      if (/\.pdf$/i.test(url.pathname) && /edital|retifica|abertura/.test(texto)) pdfs.add(url.href);
    } catch {
      // link quebrado: ignora
    }
  }
  return [...pdfs];
}
