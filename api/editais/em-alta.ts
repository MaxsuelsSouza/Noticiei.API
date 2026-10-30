import { comTabelas } from "../../src/editais/http.js";
import { emAlta } from "../../src/editais/store.js";
import { isApp, json, unauthorized } from "../../src/http.js";

/**
 * Concursos mais comentados: matérias novas nas listagens dos sites de concurso, quantos sites diferentes e,
 * se o Reddit estiver configurado, posts e comentários no r/concursospublicos. ?uf=PE (padrão) &dias=7
 */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();
  const params = new URL(request.url).searchParams;
  const ufs = (params.get("uf") ?? "PE").split(",").map((u) => u.trim().toUpperCase()).filter((u) => /^[A-Z]{2}$/.test(u));
  const dias = Math.min(30, Math.max(1, Number(params.get("dias") ?? 7) || 7));
  const ranking = await comTabelas(() => emAlta(ufs, dias));
  return json({ ufs, dias, ranking });
}
