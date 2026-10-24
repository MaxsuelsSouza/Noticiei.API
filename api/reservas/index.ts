import { isApp, json, unauthorized } from "../../src/http.js";
import { isMes } from "../../src/reservas/parse.js";
import { listReservas } from "../../src/reservas/store.js";

/** Reservas do mês (?mes=YYYY-MM). É o que a agenda do app e os widgets leem. */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();

  const mes = new URL(request.url).searchParams.get("mes") ?? "";
  if (!isMes(mes)) return json({ error: "mes deve ser YYYY-MM" }, 400);

  return json({ mes, reservas: await listReservas(mes) });
}
