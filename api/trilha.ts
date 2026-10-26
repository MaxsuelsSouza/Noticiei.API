import { isApp, json, unauthorized } from "../src/http.js";
import { migrate } from "../src/migrate.js";
import { isInvalidExtras, parseExtras } from "../src/trilha/parse.js";
import { getExtras, saveExtras } from "../src/trilha/store.js";

/** As tabelas vêm da migração 011, que roda com a rotina diária; se o app chegar antes, aplica na hora. */
async function withTables<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
    await migrate();
    return run();
  }
}

/** Personalização da trilha (anotações, links, tópicos e cursos criados). `updatedAt: null` = nunca gravada. */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();
  return json(await withTables(getExtras));
}

/** Grava o conjunto inteiro, no formato do app (substitui o que havia). */
export async function PUT(request: Request) {
  if (!isApp(request)) return unauthorized();
  try {
    const extras = parseExtras(await request.json().catch(() => null));
    return json({ extras, updatedAt: await withTables(() => saveExtras(extras)) });
  } catch (error) {
    if (isInvalidExtras(error)) return json({ error: (error as Error).message }, 400);
    throw error;
  }
}
