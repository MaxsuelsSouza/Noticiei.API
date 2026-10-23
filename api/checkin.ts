import { isCheckinClient, json, unauthorized } from "../src/http.js";
import { parseCheckinBody } from "../src/checkin/decide.js";
import { borracha } from "../src/checkin/borracha.js";
import { recentCheckins, runCheckin } from "../src/checkin/run.js";

/**
 * Chamado pelo app quando chega a notificação de check-in confirmado do Wellhub.
 * Corpo: { "source": "wellhub", "notifiedAt": "<ISO 8601>" }
 */
export async function POST(request: Request) {
  if (!isCheckinClient(request)) return unauthorized();

  const body = parseCheckinBody(await request.json().catch(() => null));
  if (!body) return json({ error: "corpo inválido: envie { source, notifiedAt }" }, 400);

  const result = await runCheckin(body, borracha);
  // 502 em falha para o app saber que vale tentar de novo; "ignorado" não é erro.
  return json(result, result.status === "falhou" ? 502 : 200);
}

/** Histórico dos últimos check-ins. */
export async function GET(request: Request) {
  if (!isCheckinClient(request)) return unauthorized();
  return json({ checkins: await recentCheckins() });
}
