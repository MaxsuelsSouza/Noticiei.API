import { comTabelas } from "../../src/editais/http.js";
import { listar, TIPOS, type Tipo } from "../../src/editais/store.js";
import { isApp, json, unauthorized } from "../../src/http.js";

/**
 * Concursos que passam no filtro (TI ou polícia/inteligência, salário >= R$ 6 mil), por peso.
 * ?tipo=ativos (padrão) | rumores | editais | abertos | favoritos | todos
 * ?uf=PE,PB   ?ocultos=1 (diagnóstico: inclui os escondidos, com o motivo)
 */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();
  const params = new URL(request.url).searchParams;
  const tipo = (params.get("tipo") ?? "ativos") as Tipo;
  if (!TIPOS.includes(tipo)) return json({ error: `tipo deve ser um de: ${TIPOS.join(", ")}` }, 400);
  const ufs = (params.get("uf") ?? "").split(",").map((u) => u.trim().toUpperCase()).filter((u) => /^[A-Z]{2}$/.test(u));
  const concursos = await comTabelas(() => listar({ tipo, ufs, ocultos: params.get("ocultos") === "1" }));
  return json({ tipo, total: concursos.length, concursos });
}
