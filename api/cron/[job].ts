import { runAcompanhamento, runEditais } from "../../src/editais/run.js";
import { isCron, json, unauthorized } from "../../src/http.js";
import { runDaily } from "../../src/pipeline.js";
import { localDate } from "../../src/time.js";

/**
 * Todos os crons numa função só (o plano Hobby da Vercel aceita no máximo 12 funções por deploy).
 * O job vem do caminho: /api/cron/daily, /api/cron/editais, ... — horários no vercel.json.
 *
 * - daily: notícias (07:00 UTC = 04:00 em Brasília).
 * - editais: coleta dos editais (06:00 UTC = 03:00) e editais-acompanhar: favoritos, PDFs, edital anterior,
 *   lembretes (07:00 UTC = 04:00), para tudo estar pronto às 05:00.
 * - *-hoje: rodadas extras só no dia em PRIMEIRA_CARGA (primeira carga do módulo de editais). Depois não fazem nada
 *   e podem ser removidas junto com as linhas do vercel.json.
 */
const PRIMEIRA_CARGA = "2026-10-30";

const JOBS: Record<string, () => Promise<unknown>> = {
  daily: () => runDaily(),
  editais: () => runEditais(),
  "editais-acompanhar": () => runAcompanhamento(),
  "editais-hoje": () => soHoje(() => runEditais({ job: "editais-hoje" })),
  "editais-hoje-2": () => soHoje(() => runEditais({ job: "editais-hoje-2" })),
  "editais-acompanhar-hoje": () => soHoje(() => runAcompanhamento({ job: "editais-acompanhar-hoje" })),
};

async function soHoje(run: () => Promise<unknown>) {
  if (localDate() !== PRIMEIRA_CARGA) return { skipped: true, reason: `só roda em ${PRIMEIRA_CARGA}` };
  return run();
}

export async function GET(request: Request) {
  if (!isCron(request)) return unauthorized();
  const job = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const run = JOBS[job];
  if (!run) return json({ error: `job desconhecido: ${job}` }, 404);
  const report = await run();
  console.log(JSON.stringify({ job, report }));
  return json(report);
}
