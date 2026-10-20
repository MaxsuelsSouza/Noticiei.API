import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export type BlockType = "heading" | "paragraph" | "code";

export interface Block {
  type: BlockType;
  text: string;
}

export interface Article {
  blocks: Block[];
  words: number;
  readingMinutes: number;
}

/** Abaixo disso quase sempre é paywall, página de consentimento ou erro, não o artigo. */
export const MIN_ARTICLE_CHARS = 400;
const MAX_ARTICLE_CHARS = 60_000;
const WORDS_PER_MINUTE = 200;
const BLOCK_SELECTOR = "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre";

/** Chamadas soltas que o Readability às vezes deixa passar (links de "leia também", anúncios). */
const BOILERPLATE =
  /^(leia (também|mais)|veja (também|mais)|saiba mais|agora no \S+|publicidade|anúncio|read (more|next|also)|related( articles| stories| posts)?|advertisement|sponsored|subscribe( now)?|sign up|share (this|on)|click here)\b/i;

function isBoilerplate(text: string): boolean {
  if (text.length > 80) return false;
  return BOILERPLATE.test(text) || (text === text.toUpperCase() && /\p{L}/u.test(text) && text.split(/\s+/).length <= 4);
}

const normalize = (text: string) => text.replace(/[ \t\r\f\v ]+/g, " ").replace(/\s*\n\s*/g, " ").trim();

function blockType(tag: string): BlockType {
  if (/^H[1-6]$/.test(tag)) return "heading";
  return tag === "PRE" ? "code" : "paragraph";
}

/** Converte o HTML do artigo (já limpo pelo Readability) em blocos de texto puro. */
export function htmlToBlocks(html: string): Block[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const blocks: Block[] = [];

  for (const element of document.querySelectorAll(BLOCK_SELECTOR)) {
    // Um <p> dentro de <li>/<blockquote> já entra pelo contêiner.
    if (element.parentElement?.closest(BLOCK_SELECTOR)) continue;
    const type = blockType(element.tagName);
    const raw = element.textContent ?? "";
    const text = type === "code" ? raw.replace(/\s+$/g, "") : normalize(raw);
    if (text.length < 2 || (type === "paragraph" && isBoilerplate(text))) continue;
    blocks.push({ type, text });
  }

  if (blocks.length > 0) return blocks;
  // Sem marcação de blocos: quebra o texto corrido por linhas em branco.
  return (document.body.textContent ?? "")
    .split(/\n\s*\n/)
    .map(normalize)
    .filter((t) => t.length > 1)
    .map((text) => ({ type: "paragraph" as const, text }));
}

function capLength(blocks: Block[]): Block[] {
  const result: Block[] = [];
  let total = 0;
  for (const block of blocks) {
    if (total + block.text.length > MAX_ARTICLE_CHARS) break;
    result.push(block);
    total += block.text.length;
  }
  return result;
}

/**
 * Extrai o texto principal da página com o algoritmo do Readability (Mozilla): regras e
 * pontuação sobre o HTML, sem IA. O texto fica no idioma original.
 */
export function extractArticle(html: string, url: string): Article | null {
  const { document } = parseHTML(html);
  // O Readability resolve links relativos a partir do documento; o linkedom não sabe a URL.
  const base = document.createElement("base");
  base.setAttribute("href", url);
  document.head?.prepend(base);

  const parsed = new Readability(document as unknown as Document, { charThreshold: MIN_ARTICLE_CHARS }).parse();
  if (!parsed?.content) return null;

  const blocks = capLength(htmlToBlocks(parsed.content));
  const prose = blocks.filter((b) => b.type !== "code").map((b) => b.text).join(" ");
  if (prose.length < MIN_ARTICLE_CHARS) return null;

  const words = prose.split(/\s+/).filter(Boolean).length;
  return { blocks, words, readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}
