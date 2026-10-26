import { RobotsChecker, USER_AGENT } from "../collect/robots.js";
import { detectLanguage } from "../curation/language.js";
import { sql } from "../db.js";
import { extractArticle } from "./article.js";

const MAX_HTML_BYTES = 3_000_000;
const CONCURRENCY = 4;
/** Prazo de guarda do texto extraído; título e link continuam. */
export const TEXT_RETENTION_DAYS = 30;

type Outcome =
  | { status: "ok"; article: NonNullable<ReturnType<typeof extractArticle>> }
  | { status: "falhou" | "bloqueado"; error: string };

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!/html/i.test(type)) throw new Error(`não é HTML (${type || "sem content-type"})`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_HTML_BYTES) throw new Error("página grande demais");
  const html = await response.text();
  if (html.length > MAX_HTML_BYTES) throw new Error("página grande demais");
  return html;
}

export async function extractFromUrl(url: string, robots: RobotsChecker): Promise<Outcome> {
  try {
    if (!(await robots.allows(url))) return { status: "bloqueado", error: "bloqueado pelo robots.txt" };
    const article = extractArticle(await fetchHtml(url), url);
    if (!article) return { status: "falhou", error: "texto principal não encontrado (paywall ou página sem artigo)" };
    return { status: "ok", article };
  } catch (error) {
    return { status: "falhou", error: error instanceof Error ? error.message : String(error) };
  }
}

export interface Pending {
  id: string;
  url: string;
  language: string;
}

async function extractOne(item: Pending, robots: RobotsChecker) {
  const outcome = await extractFromUrl(item.url, robots);
  const db = sql();
  if (outcome.status === "ok") {
    const prose = outcome.article.blocks.filter((b) => b.type !== "code").map((b) => b.text).join(" ");
    const language = detectLanguage(prose.slice(0, 3000), item.language);
    await db`
      update contents
      set article = ${JSON.stringify(outcome.article.blocks)}::jsonb, text_status = 'ok', text_error = null,
          text_extracted_at = now(), reading_minutes = ${outcome.article.readingMinutes}, language = ${language}
      where id = ${item.id}`;
  } else {
    await db`
      update contents set text_status = ${outcome.status}, text_error = ${outcome.error}, text_extracted_at = now()
      where id = ${item.id}`;
  }
  return { id: Number(item.id), status: outcome.status };
}

/**
 * Extrai vários itens com `concurrency` em paralelo (fila contínua: uma página lenta não segura as outras)
 * e grava o resultado de cada um. Passado o `deadline`, não começa item novo.
 */
export async function extractMany(pending: Pending[], { concurrency = CONCURRENCY, robots = new RobotsChecker(), deadline = Infinity } = {}) {
  const results: { id: number; status: string }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < pending.length && Date.now() < deadline) results.push(await extractOne(pending[next++]!, robots));
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  return results;
}

/** Extrai o texto dos itens que já estão em algum digest e ainda não foram tentados. */
export async function extractPendingDigestItems(limit = 16) {
  const pending = (await sql()`
    select c.id, c.url, c.language
    from contents c join digest_items di on di.content_id = c.id
    where c.text_status = 'pendente'
    order by c.id desc
    limit ${limit}`) as Pending[];
  return extractMany(pending);
}

/** Extração sob demanda (quando o app pede um item que ainda não foi processado). */
export async function extractContent(id: number) {
  const [item] = (await sql()`select id, url, language from contents where id = ${id}`) as Pending[];
  return item ? extractOne(item, new RobotsChecker()) : null;
}

/** Apaga o texto extraído depois do prazo de guarda. */
export async function expireOldTexts(): Promise<number> {
  const rows = (await sql()`
    update contents set article = null, text_status = 'expirado'
    where text_status = 'ok' and text_extracted_at < now() - make_interval(days => ${TEXT_RETENTION_DAYS})
    returning id`) as unknown[];
  return rows.length;
}
