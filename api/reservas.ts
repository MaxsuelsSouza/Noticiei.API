import { isApp, json, unauthorized } from "../src/http.js";
import { isDia, isMes, parseDados, type DadosReserva } from "../src/reservas/parse.js";
import { deleteReserva, listReservas, saveReserva } from "../src/reservas/store.js";

/**
 * Todas as rotas /api/reservas* numa função só (limite de 12 funções do plano Hobby).
 * O vercel.json reescreve /api/reservas/<dia> para cá com ?dia=<dia>:
 *
 *   GET    /api/reservas?mes=YYYY-MM   reservas do mês (agenda e widgets)
 *   PUT    /api/reservas/{YYYY-MM-DD}  cria ou edita a reserva do dia: { nome, telefone, observacao?, pago? }
 *   DELETE /api/reservas/{YYYY-MM-DD}  libera o dia
 */
function diaDe(request: Request): string {
  const url = new URL(request.url);
  return decodeURIComponent(url.searchParams.get("dia") ?? url.pathname.replace(/^\/api\/reservas\/?/, ""));
}

export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();

  const mes = new URL(request.url).searchParams.get("mes") ?? "";
  if (!isMes(mes)) return json({ error: "mes deve ser YYYY-MM" }, 400);

  return json({ mes, reservas: await listReservas(mes) });
}

export async function PUT(request: Request) {
  if (!isApp(request)) return unauthorized();

  const dia = diaDe(request);
  if (!isDia(dia)) return json({ error: "dia deve ser YYYY-MM-DD" }, 400);

  let dados: DadosReserva;
  try {
    dados = parseDados(await request.json().catch(() => null));
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
  return json(await saveReserva(dia, dados));
}

export async function DELETE(request: Request) {
  if (!isApp(request)) return unauthorized();

  const dia = diaDe(request);
  if (!isDia(dia)) return json({ error: "dia deve ser YYYY-MM-DD" }, 400);

  return (await deleteReserva(dia)) ? json({ dia }) : json({ error: "reserva não encontrada" }, 404);
}
