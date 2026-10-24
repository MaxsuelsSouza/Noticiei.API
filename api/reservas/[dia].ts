import { isApp, json, unauthorized } from "../../src/http.js";
import { isDia, parseDados, type DadosReserva } from "../../src/reservas/parse.js";
import { deleteReserva, saveReserva } from "../../src/reservas/store.js";

function diaDaUrl(request: Request): string {
  return decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
}

/** Cria ou edita a reserva do dia (um por dia). Corpo: { nome, telefone, observacao?, pago? }. */
export async function PUT(request: Request) {
  if (!isApp(request)) return unauthorized();

  const dia = diaDaUrl(request);
  if (!isDia(dia)) return json({ error: "dia deve ser YYYY-MM-DD" }, 400);

  let dados: DadosReserva;
  try {
    dados = parseDados(await request.json().catch(() => null));
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
  return json(await saveReserva(dia, dados));
}

/** Libera o dia. */
export async function DELETE(request: Request) {
  if (!isApp(request)) return unauthorized();

  const dia = diaDaUrl(request);
  if (!isDia(dia)) return json({ error: "dia deve ser YYYY-MM-DD" }, 400);

  return (await deleteReserva(dia)) ? json({ dia }) : json({ error: "reserva não encontrada" }, 404);
}
