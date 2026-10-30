import { comTabelas, idDoCaminho } from "../../../src/editais/http.js";
import { favoritar } from "../../../src/editais/store.js";
import { isApp, json, unauthorized } from "../../../src/http.js";

async function marcar(request: Request, favorito: boolean) {
  if (!isApp(request)) return unauthorized();
  const id = idDoCaminho(request);
  if (!id) return json({ error: "id inválido" }, 400);
  const r = await comTabelas(() => favoritar(id, favorito));
  return r ? json({ id, favorito, ...r }) : json({ error: "concurso não encontrado" }, 404);
}

/** Favorita (acompanhar o concurso todo dia). Se ainda não tem edital, também pede a busca do edital anterior. */
export const PUT = (request: Request) => marcar(request, true);
/** Deixa de acompanhar. */
export const DELETE = (request: Request) => marcar(request, false);
