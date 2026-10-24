import { isApp, json, unauthorized } from "../../src/http.js";
import { parseConta, type DadosConta } from "../../src/contas/parse.js";
import { deleteConta, desfazerPagamento, pagarConta, updateConta } from "../../src/contas/store.js";

function idDaUrl(request: Request): number | null {
  const id = Number(new URL(request.url).pathname.split("/").pop());
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const naoEncontrada = () => json({ error: "conta não encontrada" }, 404);

/** Edita a conta (mesmo corpo do POST). */
export async function PUT(request: Request) {
  if (!isApp(request)) return unauthorized();
  const id = idDaUrl(request);
  if (!id) return json({ error: "id inválido" }, 400);

  let dados: DadosConta;
  try {
    dados = parseConta(await request.json().catch(() => null));
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
  const conta = await updateConta(id, dados);
  return conta ? json(conta) : naoEncontrada();
}

/**
 * { pago: true } marca como paga e devolve { conta, proxima } (a próxima, se mensal/parcelada).
 * { pago: false } desfaz e devolve { conta, proxima: null }.
 */
export async function PATCH(request: Request) {
  if (!isApp(request)) return unauthorized();
  const id = idDaUrl(request);
  if (!id) return json({ error: "id inválido" }, 400);

  const body = (await request.json().catch(() => null)) as { pago?: unknown } | null;
  if (typeof body?.pago !== "boolean") return json({ error: "corpo deve ser { pago: true | false }" }, 400);

  if (body.pago) {
    const result = await pagarConta(id);
    return result ? json(result) : naoEncontrada();
  }
  const conta = await desfazerPagamento(id);
  return conta ? json({ conta, proxima: null }) : naoEncontrada();
}

export async function DELETE(request: Request) {
  if (!isApp(request)) return unauthorized();
  const id = idDaUrl(request);
  if (!id) return json({ error: "id inválido" }, 400);
  return (await deleteConta(id)) ? json({ id }) : naoEncontrada();
}
