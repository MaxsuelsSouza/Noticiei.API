import { isApp, json, unauthorized } from "../src/http.js";
import { createBorracha } from "../src/checkin/borracha.js";
import { runCheckin, type Source } from "../src/checkin/run.js";
import { dbStore, listAttempts } from "../src/checkin/store.js";
import { env } from "../src/env.js";

const SOURCES: Source[] = ["app", "widget", "auto"];

/**
 * Pede o check-in na academia. Corpo: { source?: "app" | "widget" | "auto", dryRun?: boolean }.
 * Escolhe a aula pelo horário e registra a tentativa. 502 só quando deu erro de verdade (o app pode tentar de novo);
 * "ignorado" (sem aula, fora da regra, já feito) responde 200.
 */
export async function POST(request: Request) {
  if (!isApp(request)) return unauthorized();

  const body = (await request.json().catch(() => null)) as { source?: unknown; dryRun?: unknown } | null;
  const source = SOURCES.find((s) => s === body?.source) ?? "app";
  const dryRun = body?.dryRun === true || body?.dryRun === "1";

  const result = await runCheckin({ source, dryRun }, { site: createBorracha(), store: dbStore, unidade: env.borrachaUnidade });
  return json(result, result.status === "error" ? 502 : 200);
}

/** Histórico das tentativas, da mais nova para a mais antiga. ?limit= (padrão 50, máximo 200). */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 50, 1), 200);
  return json({ attempts: await listAttempts(limit) });
}
