import { env } from "../env.js";
import { migrate } from "../migrate.js";
import { withRun } from "../runs.js";
import { localDate } from "../time.js";
import {
  acharNaOpenLibrary, descobrir, detalhar, ErroFonte, livrosNoWikidata, nytDoLivro, type Achado, type Buscar, type LivroWikidata, type Producao,
} from "./fontes.js";
import { faseDe, type Tipo } from "./regras.js";
import {
  ligar, livroDoOL, livrosParaNyt, livrosParaOL, paraLigar, salvarLeitores, salvarLivro, salvarNyt, salvarProducao, type Origem,
} from "./store.js";

/**
 * Rotina das Adaptações (cron "adaptacoes", 08:00 UTC = 05:00 em Brasília; ou POST /api/adaptacoes/atualizar):
 *   1. TMDB: adaptações de livro que ainda não estrearam, com detalhes (status, datas, capa, autor creditado).
 *   2. Ligação com o livro: Wikidata → Open Library por título + autor creditado → só título ("a confirmar").
 *   3. Sinais: leitores na Open Library (30 dias) e histórico no NYT (30 dias, poucas consultas por rodada).
 * O relatório (job_runs) mostra quantas ligaram por cada caminho: é a medida de acerto do módulo.
 */
export interface Opcoes {
  job?: string;
  buscar?: Buscar;
  /** Espera entre consultas ao NYT (o limite por minuto é baixo). Nos testes, nada. */
  esperar?: (ms: number) => Promise<void>;
  hoje?: string;
  /** Tempo total (a função tem 300 s). */
  prazoMs?: number;
  paginas?: number;
  maxNyt?: number;
}

const PAUSA_NYT_MS = 12_000;
const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

async function emLotes<T, R>(itens: T[], tamanho: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const saida: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(...(await Promise.allSettled(itens.slice(i, i + tamanho).map(fn))));
  return saida;
}

const motivo = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : null);

export async function runAdaptacoes(opcoes: Opcoes = {}) {
  return withRun(opcoes.job ?? "adaptacoes", () => rodar(opcoes), (r) => r);
}

async function rodar({
  buscar = fetch, esperar = dormir, hoje = localDate(), prazoMs = 270_000, paginas = 3, maxNyt = 12,
}: Opcoes) {
  const inicio = Date.now();
  const restante = () => prazoMs - (Date.now() - inicio);
  const erros: string[] = [];
  let migrations: string[] = [];
  try {
    migrations = await migrate();
  } catch (error) {
    erros.push(`migração: ${(error as Error).message}`);
  }

  const chaveTmdb = env.tmdbApiKey;
  if (!chaveTmdb) return { ignorado: "sem TMDB_API_KEY", migrations, erros };

  // 1. TMDB
  const achados: Achado[] = await descobrir(buscar, chaveTmdb, hoje, paginas);
  const detalhes = await emLotes(achados, 8, (a) => detalhar(buscar, chaveTmdb, a));
  const producoes: Producao[] = [];
  detalhes.forEach((r, i) => {
    if (r.status === "fulfilled") producoes.push(r.value);
    else if (erros.length < 20) erros.push(`TMDB ${achados[i]!.tipo} ${achados[i]!.tmdbId}: ${motivo(r)}`);
  });
  let novas = 0, mudaram = 0, rumores = 0;
  for (const p of producoes) {
    const fase = faseDe(p.tipo, p.status, p.estreia, hoje);
    if (!fase) {
      rumores++;
      continue;
    }
    const r = await salvarProducao(p, fase);
    if (r.nova) novas++;
    if (r.mudou) mudaram++;
  }

  // 2. Ligação com o livro
  const ligacao: Record<Origem, number> = { manual: 0, wikidata: 0, titulo_autor: 0, titulo: 0, nenhum: 0 };
  const pendentes = await paraLigar();
  const wikidata = new Map<string, LivroWikidata>();
  for (const tipo of ["filme", "serie"] as Tipo[]) {
    const ids = pendentes.filter((p) => p.tipo === tipo).map((p) => p.tmdbId);
    if (!ids.length) continue;
    try {
      for (const [tmdbId, livro] of await livrosNoWikidata(buscar, tipo, ids)) wikidata.set(`${tipo}:${tmdbId}`, livro);
    } catch (error) {
      erros.push(`Wikidata ${tipo}: ${(error as Error).message}`);
    }
  }
  for (const p of pendentes) {
    if (restante() < 60_000) break;
    try {
      const wd = wikidata.get(`${p.tipo}:${p.tmdbId}`);
      if (wd) {
        const ol = await acharNaOpenLibrary(buscar, wd.titulo, wd.autor, wd.olKey).catch(() => null);
        const id = await salvarLivro(ol
          ? { ...livroDoOL(ol, wd.wikidata), titulo: wd.titulo, autor: wd.autor ?? ol.autor, ano: wd.ano ?? ol.ano }
          : { id: wd.olKey ?? `wd:${wd.wikidata}`, olKey: wd.olKey, wikidata: wd.wikidata, titulo: wd.titulo, autor: wd.autor, ano: wd.ano });
        await ligar(p.id, id, "wikidata");
        ligacao.wikidata++;
        continue;
      }
      const titulos = [...new Set([p.tituloOriginal, p.titulo].filter(Boolean) as string[])];
      let achado: { livro: Awaited<ReturnType<typeof acharNaOpenLibrary>>; origem: Origem } | null = null;
      for (const titulo of titulos) {
        const livro = await acharNaOpenLibrary(buscar, titulo, p.autorCreditado);
        if (livro) {
          achado = { livro, origem: p.autorCreditado ? "titulo_autor" : "titulo" };
          break;
        }
      }
      if (achado?.livro) {
        await ligar(p.id, await salvarLivro(livroDoOL(achado.livro)), achado.origem);
        ligacao[achado.origem]++;
      } else {
        await ligar(p.id, null, "nenhum");
        ligacao.nenhum++;
      }
    } catch (error) {
      if (erros.length < 20) erros.push(`ligação ${p.id}: ${(error as Error).message}`);
    }
  }

  // 3a. Leitores (Open Library) dos livros que vieram sem contagem ou com ela vencida
  let leitores = 0;
  for (const l of await livrosParaOL(40)) {
    if (restante() < 50_000) break;
    try {
      const ol = await acharNaOpenLibrary(buscar, l.titulo, l.autor, l.olKey);
      await salvarLeitores(l.id, ol?.leitores ?? null, ol?.olKey ?? null);
      leitores++;
    } catch (error) {
      if (erros.length < 20) erros.push(`Open Library ${l.id}: ${(error as Error).message}`);
    }
  }

  // 3b. NYT: poucas por rodada, com pausa (limite por minuto); 429 encerra o NYT nesta rodada.
  const nyt = { consultas: 0, achados: 0, parou: null as string | null };
  const chaveNyt = env.nytApiKey;
  if (!chaveNyt) nyt.parou = "sem NYT_API_KEY";
  else {
    for (const l of await livrosParaNyt(maxNyt)) {
      if (restante() < PAUSA_NYT_MS + 15_000) {
        nyt.parou = "tempo";
        break;
      }
      if (nyt.consultas > 0) await esperar(PAUSA_NYT_MS);
      try {
        nyt.consultas++;
        const s = await nytDoLivro(buscar, chaveNyt, l.titulo, l.autor);
        await salvarNyt(l.id, s.semanas, s.melhor);
        if (s.semanas > 0) nyt.achados++;
      } catch (error) {
        if (error instanceof ErroFonte && error.status === 429) {
          nyt.parou = "limite do NYT (429)";
          break;
        }
        if (erros.length < 20) erros.push(`NYT ${l.id}: ${(error as Error).message}`);
      }
    }
  }

  return {
    migrations, coletadas: producoes.length, novas, mudaramDeFase: mudaram, rumoresIgnorados: rumores,
    ligacao, leitoresAtualizados: leitores, nyt, erros, elapsedMs: Date.now() - inicio,
  };
}
