import { sql } from "../../src/db.js";
import { extractContent } from "../../src/extract/extract.js";
import { isApp, json, unauthorized } from "../../src/http.js";

interface Row {
  id: string;
  title: string;
  url: string;
  source: string;
  language: string;
  article: { type: string; text: string }[] | null;
  text_status: string;
  text_error: string | null;
  reading_minutes: number | null;
}

async function load(id: number): Promise<Row | undefined> {
  const [row] = (await sql()`
    select c.id, c.title, c.url, s.name as source, c.language, c.article, c.text_status, c.text_error, c.reading_minutes
    from contents c join sources s on s.id = c.source_id
    where c.id = ${id}`) as Row[];
  return row;
}

/** Texto completo de um item, no idioma original. Extrai na hora se ainda não foi tentado. */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();

  const id = Number(new URL(request.url).pathname.split("/").pop());
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "id inválido" }, 400);

  let row = await load(id);
  if (!row) return json({ error: "conteúdo não encontrado" }, 404);
  if (row.text_status === "pendente") {
    await extractContent(id);
    row = (await load(id))!;
  }

  return json({
    id: Number(row.id),
    title: row.title,
    url: row.url,
    source: row.source,
    language: row.language,
    status: row.text_status,
    error: row.text_error,
    readingMinutes: row.reading_minutes,
    blocks: row.article ?? [],
  });
}
