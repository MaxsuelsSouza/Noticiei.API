import { isCron, json, unauthorized } from "../../src/http.js";
import { runDaily } from "../../src/pipeline.js";

/**
 * Disparado pela Vercel às 07:00 UTC (04:00 em Brasília). No plano Hobby o horário pode
 * variar dentro da hora, então o digest fica pronto antes das 05:30.
 */
export async function GET(request: Request) {
  if (!isCron(request)) return unauthorized();

  const report = await runDaily();
  console.log(JSON.stringify(report));
  return json(report);
}
