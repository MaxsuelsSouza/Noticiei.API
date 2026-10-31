import { comTabelas } from "../src/editais/http.js";
import { isApp, json, unauthorized } from "../src/http.js";
import { acharChave, baixarNota, lerNota } from "../src/compras/nota.js";
import {
  adicionarItem, apagarItem, apagarSessao, atualizarSessao, buscarProdutos, confirmarPar, criarProduto, criarSessao,
  editarItem, ErroCompras, getProduto, getSessao, lerCodigoDeBarras, listarSessoes, relatorio, renomearProduto,
  salvarNota, vincularCodigo,
} from "../src/compras/store.js";

/**
 * Lista de compras com conferência da NFC-e. Todas as rotas numa função só (limite de 12 funções do plano Hobby);
 * o vercel.json reescreve /api/compras/<rota> para cá com ?rota=<rota>.
 *
 *   GET    /api/compras/codigo/{codigo}[?sugerir=0]      leu um código de barras: produto conhecido ou "novo" + sugestão
 *   GET    /api/compras/produtos?busca=arroz             "já foi comprado?": catálogo + linhas de notas antigas
 *   POST   /api/compras/produtos                         { nome?, unidade?, codigo?, itemNotaId? } cadastra o produto
 *   GET    /api/compras/produtos/{id}                    produto, códigos e último preço
 *   PATCH  /api/compras/produtos/{id}                    { nome?, unidade? }
 *   POST   /api/compras/produtos/{id}/codigos            { codigo?, itemNotaId? } liga um código ao produto
 *   GET    /api/compras/sessoes                          compras recentes
 *   POST   /api/compras/sessoes                          { nome?, orcamentoCentavos? } abre a compra
 *   GET    /api/compras/sessoes/{id}                     itens, total e saldo
 *   PATCH  /api/compras/sessoes/{id}                     { nome?, orcamentoCentavos?, descontoManualCentavos? }
 *   DELETE /api/compras/sessoes/{id}
 *   POST   /api/compras/sessoes/{id}/itens               { texto } ou { codigo | produtoId, quantidade?, precoUnitario?, emPromocao? }
 *   PATCH  /api/compras/sessoes/{id}/itens/{itemId}      mesmo corpo
 *   DELETE /api/compras/sessoes/{id}/itens/{itemId}
 *   POST   /api/compras/sessoes/{id}/nota                { conteudo (HTML, XML ou texto copiado), url?, chave? } ou só { url }
 *   GET    /api/compras/sessoes/{id}/relatorio[?limite=100]   conferência (limite = a partir de quantos centavos é "grande")
 *   POST   /api/compras/sessoes/{id}/pareamentos         { itemIds, itemNotaIds, nome? } confirma ou corrige um par
 */
export function rotaDe(url: URL): string[] {
  const rota = url.searchParams.get("rota") ?? url.pathname.replace(/^\/api\/compras\/?/, "");
  return rota.split("/").filter(Boolean).map(decodeURIComponent);
}

const idDe = (v: string | undefined) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const naoEncontrada = () => json({ error: "rota não encontrada" }, 404);

async function corpo(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ErroCompras("corpo deve ser um objeto JSON");
  return body as Record<string, unknown>;
}

const texto = (v: unknown) => (typeof v === "string" ? v : undefined);
const numero = (v: unknown) => (typeof v === "number" ? v : undefined);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => Number.isSafeInteger(x)) : []);

async function rotear(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const [recurso, idTexto, acao, subId, ...resto] = rotaDe(url);
  if (resto.length) return naoEncontrada();
  const metodo = request.method;

  if (recurso === "codigo" && idTexto && !acao && metodo === "GET") {
    return json(await lerCodigoDeBarras(idTexto, { sugerir: url.searchParams.get("sugerir") !== "0" }));
  }

  if (recurso === "produtos") {
    if (!idTexto) {
      if (metodo === "GET") return json(await buscarProdutos(url.searchParams.get("busca") ?? ""));
      if (metodo === "POST") {
        const b = await corpo(request);
        const produto = await criarProduto({
          nome: texto(b.nome), unidade: texto(b.unidade) as "UN" | "KG" | undefined, codigo: texto(b.codigo), itemNotaId: numero(b.itemNotaId),
        });
        return json(produto, 201);
      }
      return json({ error: "método não permitido" }, 405);
    }
    const id = idDe(idTexto);
    if (!id) return naoEncontrada();
    if (!acao && metodo === "GET") {
      const p = await getProduto(id);
      return p ? json(p) : json({ error: "produto não encontrado" }, 404);
    }
    if (!acao && metodo === "PATCH") {
      const b = await corpo(request);
      return json(await renomearProduto(id, { nome: texto(b.nome), unidade: texto(b.unidade) as "UN" | "KG" | undefined }));
    }
    if (acao === "codigos" && !subId && metodo === "POST") {
      const b = await corpo(request);
      return json(await vincularCodigo(id, { codigo: texto(b.codigo), itemNotaId: numero(b.itemNotaId) }));
    }
    return naoEncontrada();
  }

  if (recurso === "sessoes") {
    if (!idTexto) {
      if (metodo === "GET") return json({ sessoes: await listarSessoes() });
      if (metodo === "POST") {
        const b = await request.json().catch(() => ({}));
        const dados = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
        return json(await criarSessao({ nome: texto(dados.nome), orcamentoCentavos: numero(dados.orcamentoCentavos) }), 201);
      }
      return json({ error: "método não permitido" }, 405);
    }
    const id = idDe(idTexto);
    if (!id) return naoEncontrada();

    if (!acao) {
      if (metodo === "GET") {
        const s = await getSessao(id);
        return s ? json(s) : json({ error: "sessão não encontrada" }, 404);
      }
      if (metodo === "PATCH") {
        const b = await corpo(request);
        const campo = (k: string) => (k in b ? (b[k] as number | null) : undefined);
        return json(await atualizarSessao(id, {
          nome: "nome" in b ? (texto(b.nome) ?? null) : undefined,
          orcamentoCentavos: campo("orcamentoCentavos"),
          descontoManualCentavos: campo("descontoManualCentavos"),
        }));
      }
      if (metodo === "DELETE") return (await apagarSessao(id)) ? json({ id }) : json({ error: "sessão não encontrada" }, 404);
      return json({ error: "método não permitido" }, 405);
    }

    if (acao === "itens") {
      const dadosItem = (b: Record<string, unknown>) => ({
        texto: texto(b.texto),
        codigo: texto(b.codigo),
        produtoId: numero(b.produtoId),
        descricao: texto(b.descricao),
        quantidade: numero(b.quantidade),
        unidade: texto(b.unidade) as "UN" | "KG" | undefined,
        precoUnitario: numero(b.precoUnitario),
        valorCentavos: numero(b.valorCentavos),
        emPromocao: typeof b.emPromocao === "boolean" ? b.emPromocao : undefined,
      });
      if (!subId && metodo === "POST") return json(await adicionarItem(id, dadosItem(await corpo(request))), 201);
      const itemId = idDe(subId);
      if (!itemId) return naoEncontrada();
      if (metodo === "PATCH") return json(await editarItem(id, itemId, dadosItem(await corpo(request))));
      if (metodo === "DELETE") return json(await apagarItem(id, itemId));
      return json({ error: "método não permitido" }, 405);
    }

    if (acao === "nota" && !subId && metodo === "POST") {
      const b = await corpo(request);
      const link = texto(b.url);
      const chave = texto(b.chave)?.replace(/\D/g, "") || (link ? acharChave(link) : null);
      let conteudo = texto(b.conteudo);
      if (!conteudo) {
        if (!link) throw new ErroCompras("mande conteudo (HTML, XML ou texto copiado da página da Sefaz) ou url");
        try {
          conteudo = await baixarNota(link);
        } catch (e) {
          // O celular tem IP brasileiro e costuma conseguir; o app tenta de lá ou pede para colar o texto.
          return json({ error: `não consegui abrir a nota pelo servidor: ${(e as Error).message}`, precisaConteudo: true }, 502);
        }
      }
      let nota;
      try {
        nota = lerNota(conteudo, chave);
      } catch (e) {
        throw new ErroCompras((e as Error).message, 422);
      }
      const { nova } = await salvarNota(id, nota, conteudo);
      return json({ nova, ...(await relatorio(id)) }, nova ? 201 : 200);
    }

    if (acao === "relatorio" && !subId && metodo === "GET") {
      const limite = Number(url.searchParams.get("limite"));
      return json(await relatorio(id, Number.isSafeInteger(limite) && limite > 0 ? limite : undefined));
    }

    if (acao === "pareamentos" && !subId && metodo === "POST") {
      const b = await corpo(request);
      return json(await confirmarPar(id, { itemIds: ids(b.itemIds), itemNotaIds: ids(b.itemNotaIds), nome: texto(b.nome) }));
    }
  }

  return naoEncontrada();
}

async function handle(request: Request): Promise<Response> {
  if (!isApp(request)) return unauthorized();
  try {
    // clone: se a migração rodar no meio, a segunda tentativa lê o corpo de novo.
    return await comTabelas(() => rotear(request.clone()));
  } catch (e) {
    if (e instanceof ErroCompras) return json({ error: e.message }, e.status);
    throw e;
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
