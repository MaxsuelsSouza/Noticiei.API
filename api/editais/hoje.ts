import { comTabelas } from "../../src/editais/http.js";
import { novidades } from "../../src/editais/store.js";
import { isApp, json, unauthorized } from "../../src/http.js";

/** O que mudou (concurso novo, fase, banca, prazo, prova, edital). ?desde=ISO; padrão: últimas 24 h. */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();
  const param = new URL(request.url).searchParams.get("desde");
  const desde = param ? new Date(param) : new Date(Date.now() - 24 * 3_600_000);
  if (Number.isNaN(desde.getTime())) return json({ error: "desde inválido (use ISO 8601)" }, 400);
  const concursos = await comTabelas(() => novidades(desde));
  return json({ desde: desde.toISOString(), total: concursos.length, concursos });
}
