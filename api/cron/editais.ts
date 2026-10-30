import { runEditais } from "../../src/editais/run.js";
import { isCron, json, unauthorized } from "../../src/http.js";

/** Disparado pela Vercel às 08:00 UTC (05:00 em Brasília), depois da rotina das notícias. */
export async function GET(request: Request) {
  if (!isCron(request)) return unauthorized();
  const report = await runEditais();
  console.log(JSON.stringify(report));
  return json(report);
}
