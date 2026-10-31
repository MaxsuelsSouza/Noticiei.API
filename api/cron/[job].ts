import { runAcompanhamento, runEditais } from "../../src/editais/run.js";
import { isCron, json, unauthorized } from "../../src/http.js";
import { runDaily } from "../../src/pipeline.js";

/**
 * Todos os crons numa função só (o plano Hobby da Vercel aceita no máximo 12 funções por deploy).
 * O job vem do caminho: /api/cron/daily, /api/cron/editais-10h, ... — horários (UTC) no vercel.json.
 * No Hobby cada cron roda uma vez por dia, em algum minuto dentro da hora marcada.
 *
 * - daily: notícias (07:00 UTC = 04:00 em Brasília).
 * - editais (03:00) e editais-acompanhar (04:00): tudo pronto às 05:00.
 * - editais-10h, -15h, -20h: coletas extras; editais-acompanhar-11h, -16h, -21h: lê os PDFs e os favoritos
 *   do que essas coletas acharam.
 */
const coleta = (job: string) => () => runEditais({ job });
const acompanhamento = (job: string) => () => runAcompanhamento({ job });

const JOBS: Record<string, () => Promise<unknown>> = {
  daily: () => runDaily(),
  editais: coleta("editais"),
  "editais-acompanhar": acompanhamento("editais-acompanhar"),
  "editais-10h": coleta("editais-10h"),
  "editais-15h": coleta("editais-15h"),
  "editais-20h": coleta("editais-20h"),
  "editais-acompanhar-11h": acompanhamento("editais-acompanhar-11h"),
  "editais-acompanhar-16h": acompanhamento("editais-acompanhar-16h"),
  "editais-acompanhar-21h": acompanhamento("editais-acompanhar-21h"),
};

export async function GET(request: Request) {
  if (!isCron(request)) return unauthorized();
  const job = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const run = JOBS[job];
  if (!run) return json({ error: `job desconhecido: ${job}` }, 404);
  const report = await run();
  console.log(JSON.stringify({ job, report }));
  return json(report);
}
