import { comTabelas, idDoCaminho } from "../../src/editais/http.js";
import { detalhe } from "../../src/editais/store.js";
import { isApp, json, unauthorized } from "../../src/http.js";

/** Tudo sobre um concurso: resumo, etapas, cidades de prova, editais, matérias e histórico. */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();
  const id = idDoCaminho(request);
  if (!id) return json({ error: "id inválido" }, 400);
  const concurso = await comTabelas(() => detalhe(id));
  return concurso ? json(concurso) : json({ error: "concurso não encontrado" }, 404);
}
