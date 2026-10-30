import { runAcompanhamento } from "../../src/editais/run.js";
import { isCron, json, unauthorized } from "../../src/http.js";

/** Disparado pela Vercel às 09:00 UTC (06:00 em Brasília), depois da coleta dos editais. */
export async function GET(request: Request) {
  if (!isCron(request)) return unauthorized();
  const report = await runAcompanhamento();
  console.log(JSON.stringify(report));
  return json(report);
}
