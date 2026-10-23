import { isCron, json, unauthorized } from "../../src/http.js";
import { runDaily } from "../../src/pipeline.js";
import { localDate } from "../../src/time.js";

/**
 * Rodada extra, só no dia em RUN_ON: refaz o digest do dia com a curadoria nova (13 itens).
 * Em qualquer outro dia não faz nada; a rotina das 04:00 continua normal. Pode ser removida depois.
 */
const RUN_ON = "2026-10-23";

export async function GET(request: Request) {
  if (!isCron(request)) return unauthorized();
  if (localDate() !== RUN_ON) return json({ skipped: true, reason: `só roda em ${RUN_ON}` });

  const report = await runDaily({ force: true, job: "once" });
  console.log(JSON.stringify(report));
  return json(report);
}
