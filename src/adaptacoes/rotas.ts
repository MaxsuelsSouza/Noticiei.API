import { isApp, json, unauthorized } from "../http.js";
import { migrate } from "../migrate.js";
import { runAdaptacoes } from "./coleta.js";
import { buscarNaOpenLibrary, ErroFonte, type LivroOL } from "./fontes.js";
import { detalhe, escolherLivro, listar, ocultar, porIds } from "./store.js";

/**
 * Adaptações: livros que vão virar filme ou série. Mora na função da trilha (limite de 12 funções do plano Hobby);
 * o vercel.json reescreve /api/adaptacoes/<rota> para /api/trilha?adaptacoes=<rota>.
 *
 *   GET  /api/adaptacoes                      { atualizadoEm, data: Item[], anunciados: Item[] } (top 30 por nota)
 *   GET  /api/adaptacoes?ids=m1,t2            itens pelo id (aba Seguindo), mesmo os que já estrearam ou sumiram
 *   GET  /api/adaptacoes/{id}                 detalhe, com o histórico de fases
 *   GET  /api/adaptacoes/livros?q=            busca na Open Library (folha "Qual é o livro?")
 *   PUT  /api/adaptacoes/{id}/livro           { olKey, titulo, autor?, ano?, leitores? } escolhe o livro (manual)
 *                                             { naoLivro: true|false } tira da lista / desfaz
 *   POST /api/adaptacoes/atualizar            roda a rotina agora (até ~270 s) e devolve o relatório
 */

class ErroPedido extends Error {
  constructor(mensagem: string, public status = 400) {
    super(mensagem);
  }
}

/** É pedido de Adaptações? Depois do rewrite vem ?adaptacoes=<rota> (vazio na raiz); chamado direto, pelo caminho. */
export function rotaAdaptacoes(url: URL): string[] | null {
  const param = url.searchParams.get("adaptacoes");
  if (param !== null) return param.split("/").filter(Boolean).map(decodeURIComponent);
  const m = url.pathname.match(/^\/api\/adaptacoes(?:\/(.*))?$/);
  return m ? (m[1] ?? "").split("/").filter(Boolean).map(decodeURIComponent) : null;
}

const ID = /^[mt]\d{1,10}$/;

/** Tabelas da migração 026: aplica antes do primeiro pedido de cada instância (como Livros e Compras). */
let pronto: Promise<unknown> | null = null;
function comTabelas<T>(run: () => Promise<T>): Promise<T> {
  pronto ??= migrate().catch((error) => {
    pronto = null;
    throw error;
  });
  return pronto.then(run);
}

const texto = (v: unknown, campo: string, max: number, obrigatorio = false): string | null => {
  if (v === undefined || v === null || v === "") {
    if (obrigatorio) throw new ErroPedido(`${campo} é obrigatório`);
    return null;
  }
  if (typeof v !== "string" || v.trim().length > max) throw new ErroPedido(`${campo} inválido`);
  return v.trim() || null;
};

const inteiro = (v: unknown, campo: string): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new ErroPedido(`${campo} inválido`);
  return v;
};

export function lerEscolha(b: unknown): { naoLivro: boolean } | LivroOL {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new ErroPedido("corpo deve ser um objeto JSON");
  const o = b as Record<string, unknown>;
  if ("naoLivro" in o) {
    if (typeof o.naoLivro !== "boolean") throw new ErroPedido("naoLivro deve ser true ou false");
    return { naoLivro: o.naoLivro };
  }
  const olKey = texto(o.olKey, "olKey", 20, true)!;
  if (!/^OL\d+W$/.test(olKey)) throw new ErroPedido("olKey deve ser a chave de uma obra da Open Library (OL…W)");
  return {
    olKey,
    titulo: texto(o.titulo, "titulo", 300, true)!,
    autor: texto(o.autor, "autor", 200),
    ano: inteiro(o.ano, "ano"),
    leitores: inteiro(o.leitores, "leitores") ?? 0,
  };
}

async function rotear(request: Request, rota: string[]): Promise<Response> {
  const url = new URL(request.url);
  const metodo = request.method;
  const [primeiro, acao, ...resto] = rota;
  if (resto.length) return json({ error: "rota não encontrada" }, 404);

  if (!primeiro) {
    if (metodo !== "GET") return json({ error: "método não permitido" }, 405);
    const ids = url.searchParams.get("ids");
    if (ids !== null) {
      const lista = ids.split(",").map((i) => i.trim()).filter(Boolean);
      if (lista.length > 200 || lista.some((i) => !ID.test(i))) throw new ErroPedido("ids inválidos");
      return json({ itens: await comTabelas(() => porIds(lista)) });
    }
    return json(await comTabelas(listar));
  }

  if (primeiro === "livros" && !acao) {
    if (metodo !== "GET") return json({ error: "método não permitido" }, 405);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 200) throw new ErroPedido("busca deve ter de 2 a 200 caracteres");
    try {
      return json({ livros: await buscarNaOpenLibrary(fetch, q) });
    } catch (error) {
      if (error instanceof ErroFonte) return json({ error: "Open Library não respondeu" }, 502);
      throw error;
    }
  }

  if (primeiro === "atualizar" && !acao) {
    if (metodo !== "POST") return json({ error: "método não permitido" }, 405);
    return json(await runAdaptacoes({ job: "adaptacoes-manual" }));
  }

  if (!ID.test(primeiro)) return json({ error: "rota não encontrada" }, 404);

  if (!acao) {
    if (metodo !== "GET") return json({ error: "método não permitido" }, 405);
    const d = await comTabelas(() => detalhe(primeiro));
    return d ? json(d) : json({ error: "adaptação não encontrada" }, 404);
  }

  if (acao === "livro") {
    if (metodo !== "PUT") return json({ error: "método não permitido" }, 405);
    const escolha = lerEscolha(await request.json().catch(() => null));
    const ok = await comTabelas(() => ("naoLivro" in escolha ? ocultar(primeiro, escolha.naoLivro) : escolherLivro(primeiro, escolha)));
    if (!ok) return json({ error: "adaptação não encontrada" }, 404);
    return json(await detalhe(primeiro));
  }

  return json({ error: "rota não encontrada" }, 404);
}

export async function tratarAdaptacoes(request: Request, rota: string[]): Promise<Response> {
  if (!isApp(request)) return unauthorized();
  try {
    return await rotear(request, rota);
  } catch (error) {
    if (error instanceof ErroPedido) return json({ error: error.message }, error.status);
    throw error;
  }
}
