import { buscarAnterior } from "../../../src/editais/acompanhar.js";
import { comTabelas, idDoCaminho } from "../../../src/editais/http.js";
import { detalhe, marcarInteresse } from "../../../src/editais/store.js";
import { isApp, json, unauthorized } from "../../../src/http.js";

/** Tempo para tentar achar e ler o edital anterior na hora; o que não der, o acompanhamento diário continua. */
const PRAZO_MS = 50_000;

/**
 * "Tenho interesse": procura o edital anterior do concurso (ciclos anteriores, PDFs das matérias, página do concurso)
 * e lê as matérias dele. Responde com o detalhe atualizado; `buscaAnterior.status` diz se achou.
 */
export async function POST(request: Request) {
  if (!isApp(request)) return unauthorized();
  const id = idDoCaminho(request);
  if (!id) return json({ error: "id inválido" }, 400);
  const status = await comTabelas(() => marcarInteresse(id));
  if (!status) return json({ error: "concurso não encontrado" }, 404);
  if (status === "pendente") await buscarAnterior(String(id), Date.now() + PRAZO_MS).catch((e) => console.error("busca do anterior", e));
  return json(await detalhe(id));
}
