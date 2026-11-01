import { isAppOuLivreq, json, unauthorized } from "../http.js";
import { migrate } from "../migrate.js";
import { ErroLivros, lerCatalogo, lerIdeia, lerIds, lerTexto, objeto, syncIdOuFalha, uuidOuFalha } from "./parse.js";
import {
  apagarIdeia, apagarTexto, listarIdeias, listarLivros, listarTextos, marcarImportadas, marcarUsado, salvarCatalogo, salvarIdeia, salvarTexto,
} from "./store.js";

/**
 * Livros: ponte entre o celular (módulo Livros) e o LivreQ (editor de livros no computador). Mora na função da
 * trilha (limite de 12 funções do plano Hobby); o vercel.json reescreve /api/livros/<rota> para
 * /api/trilha?livros=<rota>.
 *
 *   GET    /api/livros/catalogo                      grupos e livros do computador, com textos novos e total por livro
 *   PUT    /api/livros/catalogo                      { grupos: [{ id, nome }], livros: [{ id, grupoId?, titulo, subtitulo?,
 *                                                    volume?, palavras, capitulos, ultimaEscritaEm? }] }  (LivreQ)
 *   GET    /api/livros/textos?livro=<id>             textos de um livro (novos e usados)
 *   GET    /api/livros/textos?pendentes=1            textos novos de todos os livros (LivreQ)
 *   PUT    /api/livros/textos/{uuid}                 { livroId, titulo?, texto } salvamento automático, pode repetir
 *   DELETE /api/livros/textos/{uuid}[?desfazer=1]    apaga (lógico) ou desfaz
 *   POST   /api/livros/textos/{uuid}/usado           { usado: true|false } "Já usei" no LivreQ
 *   GET    /api/livros/ideias[?novas=1]              ideias (novas = ainda não estão no ideias.json do LivreQ)
 *   PUT    /api/livros/ideias/{uuid}                 { grupoId?, titulo?, texto } lança ou corrige
 *   DELETE /api/livros/ideias/{uuid}[?desfazer=1]
 *   POST   /api/livros/ideias/importadas             { ids } o LivreQ gravou no ideias.json
 */

/** É pedido de Livros? Depois do rewrite vem ?livros=<rota> (vazio na raiz); chamado direto, pelo caminho. */
export function rotaLivros(url: URL): string[] | null {
  const param = url.searchParams.get("livros");
  if (param !== null) return param.split("/").filter(Boolean).map(decodeURIComponent);
  const m = url.pathname.match(/^\/api\/livros(?:\/(.*))?$/);
  return m ? (m[1] ?? "").split("/").filter(Boolean).map(decodeURIComponent) : null;
}

/**
 * As tabelas vêm da migração 025. Como em Compras, as migrações rodam antes do primeiro pedido de cada instância
 * (o corpo do pedido só pode ser lido uma vez, então não dá para tentar de novo depois de um erro de tabela).
 */
let pronto: Promise<unknown> | null = null;
function comTabelas<T>(run: () => Promise<T>): Promise<T> {
  pronto ??= migrate().catch((error) => {
    pronto = null;
    throw error;
  });
  return pronto.then(run);
}

const naoEncontrada = () => json({ error: "rota não encontrada" }, 404);
const corpo = async (request: Request) => objeto(await request.json().catch(() => null));

async function rotear(request: Request, rota: string[]): Promise<Response> {
  const url = new URL(request.url);
  const metodo = request.method;
  const [recurso, idTexto, acao, ...resto] = rota;
  if (resto.length) return naoEncontrada();
  const desfazer = url.searchParams.get("desfazer") === "1";

  if (recurso === "catalogo" && !idTexto) {
    if (metodo === "GET") return json(await listarLivros());
    if (metodo !== "PUT") return json({ error: "método não permitido" }, 405);
    return json(await salvarCatalogo(lerCatalogo(await request.json().catch(() => null))));
  }

  if (recurso === "textos") {
    if (!idTexto) {
      if (metodo !== "GET") return json({ error: "método não permitido" }, 405);
      const livro = url.searchParams.get("livro");
      const pendentes = url.searchParams.get("pendentes") === "1";
      if (!livro && !pendentes) return json({ error: "informe ?livro= ou ?pendentes=1" }, 400);
      return json({ textos: await listarTextos({ livroId: livro ? syncIdOuFalha(livro, "livro") : undefined, pendentes }) });
    }
    const id = uuidOuFalha(idTexto);
    if (!acao && metodo === "PUT") return json(await salvarTexto(id, lerTexto(await request.json().catch(() => null))));
    if (!acao && metodo === "DELETE") return json(await apagarTexto(id, desfazer));
    if (acao === "usado" && metodo === "POST") {
      const b = await corpo(request);
      if (typeof b.usado !== "boolean") return json({ error: "usado deve ser true ou false" }, 400);
      return json(await marcarUsado(id, b.usado));
    }
    return naoEncontrada();
  }

  if (recurso === "ideias") {
    if (!idTexto) return metodo === "GET" ? json({ ideias: await listarIdeias(url.searchParams.get("novas") === "1") }) : json({ error: "método não permitido" }, 405);
    if (idTexto === "importadas" && !acao) {
      if (metodo !== "POST") return json({ error: "método não permitido" }, 405);
      return json(await marcarImportadas(lerIds(await request.json().catch(() => null))));
    }
    const id = uuidOuFalha(idTexto);
    if (acao) return naoEncontrada();
    if (metodo === "PUT") return json(await salvarIdeia(id, lerIdeia(await request.json().catch(() => null))));
    if (metodo === "DELETE") return json(await apagarIdeia(id, desfazer));
    return json({ error: "método não permitido" }, 405);
  }

  return naoEncontrada();
}

export async function tratarLivros(request: Request, rota: string[]): Promise<Response> {
  if (!isAppOuLivreq(request)) return unauthorized();
  try {
    return await comTabelas(() => rotear(request, rota));
  } catch (error) {
    if (error instanceof ErroLivros) return json({ error: error.message }, error.status);
    throw error;
  }
}
