import { isApp, json, unauthorized } from "../src/http.js";
import { createBorracha } from "../src/checkin/borracha.js";
import { runCheckin, runCompanion, type Source } from "../src/checkin/run.js";
import { dbStore, listAttempts } from "../src/checkin/store.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";

const SOURCES: Source[] = ["app", "widget", "auto"];

/** A coluna `conta` vem da migração 012, que roda com a rotina diária; o check-in pode chegar antes. É idempotente. */
const migrated = migrate().catch((error) => console.error("migração antes do check-in falhou", error));

/**
 * Pede o check-in na academia. Corpo: { source?: "app" | "widget" | "auto", dryRun?: boolean }.
 * Escolhe a aula pelo horário e registra a tentativa. 502 só quando deu erro de verdade (o app pode tentar de novo);
 * "ignorado" (sem aula, fora da regra, já feito) responde 200.
 * Com BORRACHA_EMAIL_2/BORRACHA_PASSWORD_2, a segunda conta faz o check-in logo depois, na mesma aula, só se a
 * principal enviou. O corpo da resposta continua sendo o da principal (é o que o app lê); a segunda vem em `segunda`.
 */
export async function POST(request: Request) {
  if (!isApp(request)) return unauthorized();
  await migrated;

  const body = (await request.json().catch(() => null)) as { source?: unknown; dryRun?: unknown } | null;
  const source = SOURCES.find((s) => s === body?.source) ?? "app";
  const dryRun = body?.dryRun === true || body?.dryRun === "1";

  const req = { source, dryRun };
  const result = await runCheckin(req, { site: createBorracha(), store: dbStore("principal"), unidade: env.borrachaUnidade });

  const second = env.borracha2;
  const segunda = second
    ? await runCompanion(req, result, { site: createBorracha(() => second), store: dbStore("segunda"), unidade: env.borrachaUnidade })
    : undefined;
  return json({ ...result, segunda }, result.status === "error" ? 502 : 200);
}

/**
 * Histórico das tentativas, da mais nova para a mais antiga. ?limit= (padrão 50, máximo 200).
 * ?conta=principal (padrão, é o que o app mostra), segunda ou todas.
 */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();
  await migrated;
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);
  const conta = params.get("conta") === "segunda" ? "segunda" : params.get("conta") === "todas" ? null : "principal";
  return json({ attempts: await listAttempts(limit, conta) });
}
