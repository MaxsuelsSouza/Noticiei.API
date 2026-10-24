import { isApp, json, unauthorized } from "../../src/http.js";
import { parseConta, type DadosConta } from "../../src/contas/parse.js";
import { createConta, listContas } from "../../src/contas/store.js";

/** Contas em aberto e as pagas recentemente. É o que a tela de contas e os widgets leem. */
export async function GET(request: Request) {
  if (!isApp(request)) return unauthorized();
  return json({ contas: await listContas() });
}

/** Nova conta. Corpo: { nome, vencimento, valorCentavos?, valorVariavel?, repeticao?, diaVencimento?, parcelaAtual?, parcelasTotal?, codigo?, lembrete*? }. */
export async function POST(request: Request) {
  if (!isApp(request)) return unauthorized();

  let dados: DadosConta;
  try {
    dados = parseConta(await request.json().catch(() => null));
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
  return json(await createConta(dados), 201);
}
