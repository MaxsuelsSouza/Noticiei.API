import { isApp, json, unauthorized } from "../src/http.js";
import { migrate } from "../src/migrate.js";
import { isInvalidExtras, parseExtras } from "../src/trilha/parse.js";
import { getExtras, saveExtras } from "../src/trilha/store.js";
import { rotaLivros, tratarLivros } from "../src/livros/rotas.js";
import { rotaAdaptacoes, tratarAdaptacoes } from "../src/adaptacoes/rotas.js";

// Esta função também atende os módulos Livros (/api/livros/*, rewrite para ?livros=) e Adaptações
// (/api/adaptacoes/*, rewrite para ?adaptacoes=): limite de 12 funções do Hobby.
const livros = (request: Request) => rotaLivros(new URL(request.url));
const adaptacoes = (request: Request) => rotaAdaptacoes(new URL(request.url));

/** Livros ou Adaptações, se for o caso; senão null (é a trilha). */
function outroModulo(request: Request): Promise<Response> | null {
  const l = livros(request);
  if (l) return tratarLivros(request, l);
  const a = adaptacoes(request);
  return a ? tratarAdaptacoes(request, a) : null;
}

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
  const outro = outroModulo(request);
  if (outro) return outro;
  if (!isApp(request)) return unauthorized();
  return json(await withTables(getExtras));
}

/** Grava o conjunto inteiro, no formato do app (substitui o que havia). */
export async function PUT(request: Request) {
  const outro = outroModulo(request);
  if (outro) return outro;
  if (!isApp(request)) return unauthorized();
  try {
    const extras = parseExtras(await request.json().catch(() => null));
    return json({ extras, updatedAt: await withTables(() => saveExtras(extras)) });
  } catch (error) {
    if (isInvalidExtras(error)) return json({ error: (error as Error).message }, 400);
    throw error;
  }
}

export async function POST(request: Request) {
  return outroModulo(request) ?? json({ error: "método não permitido" }, 405);
}

export async function DELETE(request: Request) {
  return outroModulo(request) ?? json({ error: "método não permitido" }, 405);
}
