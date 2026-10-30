import { buscarAnterior } from "../src/editais/acompanhar.js";
import { comTabelas } from "../src/editais/http.js";
import { detalhe, emAlta, favoritar, listar, marcarInteresse, novidades, TIPOS, type Tipo } from "../src/editais/store.js";
import { isApp, json, unauthorized } from "../src/http.js";

/**
 * Todas as rotas /api/editais/* numa função só (o plano Hobby da Vercel aceita no máximo 12 funções por deploy).
 * O vercel.json reescreve /api/editais/<rota> para cá com ?rota=<rota>:
 *
 *   GET    /api/editais[?tipo=&uf=&ocultos=1]   lista por peso
 *   GET    /api/editais/hoje[?desde=ISO]        o que mudou (padrão: 24 h)
 *   GET    /api/editais/em-alta[?uf=PE&dias=7]  mais citados
 *   GET    /api/editais/{id}                    detalhe
 *   PUT    /api/editais/{id}/favorito           acompanhar (num rumor, também pede o edital anterior)
 *   DELETE /api/editais/{id}/favorito           deixar de acompanhar
 *   POST   /api/editais/{id}/interesse          procura o edital anterior (até ~50 s) e devolve o detalhe
 */
const PRAZO_INTERESSE_MS = 50_000;

const ufsDe = (valor: string | null, padrao = "") =>
  (valor ?? padrao).split(",").map((u) => u.trim().toUpperCase()).filter((u) => /^[A-Z]{2}$/.test(u));

/** Rota depois de /api/editais/: vem no ?rota= do rewrite ou, se a Vercel mantiver o caminho original, dele. */
export function rotaDe(url: URL): string[] {
  const rota = url.searchParams.get("rota") ?? url.pathname.replace(/^\/api\/editais\/?/, "");
  return rota.split("/").filter(Boolean);
}

async function handle(request: Request): Promise<Response> {
  if (!isApp(request)) return unauthorized();
  const url = new URL(request.url);
  const params = url.searchParams;
  const [primeiro, acao, ...resto] = rotaDe(url);
  if (resto.length) return json({ error: "rota não encontrada" }, 404);
  const metodo = request.method;

  if (!primeiro) {
    if (metodo !== "GET") return json({ error: "método não permitido" }, 405);
    const tipo = (params.get("tipo") ?? "ativos") as Tipo;
    if (!TIPOS.includes(tipo)) return json({ error: `tipo deve ser um de: ${TIPOS.join(", ")}` }, 400);
    const concursos = await comTabelas(() => listar({ tipo, ufs: ufsDe(params.get("uf")), ocultos: params.get("ocultos") === "1" }));
    return json({ tipo, total: concursos.length, concursos });
  }

  if (primeiro === "hoje" && !acao && metodo === "GET") {
    const desde = params.get("desde") ? new Date(params.get("desde")!) : new Date(Date.now() - 24 * 3_600_000);
    if (Number.isNaN(desde.getTime())) return json({ error: "desde inválido (use ISO 8601)" }, 400);
    const concursos = await comTabelas(() => novidades(desde));
    return json({ desde: desde.toISOString(), total: concursos.length, concursos });
  }

  if (primeiro === "em-alta" && !acao && metodo === "GET") {
    const ufs = ufsDe(params.get("uf"), "PE");
    const dias = Math.min(30, Math.max(1, Number(params.get("dias") ?? 7) || 7));
    return json({ ufs, dias, ranking: await comTabelas(() => emAlta(ufs, dias)) });
  }

  const id = Number(primeiro);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "rota não encontrada" }, 404);

  if (!acao && metodo === "GET") {
    const concurso = await comTabelas(() => detalhe(id));
    return concurso ? json(concurso) : json({ error: "concurso não encontrado" }, 404);
  }

  if (acao === "favorito" && (metodo === "PUT" || metodo === "DELETE")) {
    const favorito = metodo === "PUT";
    const r = await comTabelas(() => favoritar(id, favorito));
    return r ? json({ id, favorito, ...r }) : json({ error: "concurso não encontrado" }, 404);
  }

  if (acao === "interesse" && metodo === "POST") {
    const status = await comTabelas(() => marcarInteresse(id));
    if (!status) return json({ error: "concurso não encontrado" }, 404);
    if (status === "pendente") await buscarAnterior(String(id), Date.now() + PRAZO_INTERESSE_MS).catch((e) => console.error("busca do anterior", e));
    return json(await detalhe(id));
  }

  return json({ error: "rota não encontrada" }, 404);
}

export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
export const POST = handle;
