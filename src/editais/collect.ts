/**
 * Rotina diária dos editais: lê as listagens, abre as matérias novas, junta cada uma no concurso
 * certo, recalcula o resumo e registra o que mudou.
 */
import { RobotsChecker } from "../collect/robots.js";
import { sql } from "../db.js";
import { extractArticle } from "../extract/article.js";
import { fetchHtml } from "../extract/extract.js";
import { canonicalUrl } from "../text.js";
import { agregar, avaliar, eventos, SALARIO_MINIMO_CENTAVOS, type Agregado, type FonteExtraida } from "./avaliar.js";
import { ehPanorama, extrair, identificarOrgao, nichosNoTexto, normalizar, tituloTemporario, type Extracao, type OrgaoEncontrado } from "./extract.js";
import { itensDaListagem, pdfsDaPagina, valeAbrir, type ItemListagem } from "./listagem.js";

const MAX_FALHAS = 5;
const MAX_MATERIAS_POR_RODADA = 150;
const CONCORRENCIA = 6;
/** A função tem 300 s; sobra margem para gravar. */
const PRAZO_MS = 220_000;
/** Concurso parado há mais que isso, já em andamento/encerrado: notícia nova de rumor abre outro ciclo. */
const DIAS_NOVO_CICLO = 300;

interface Site {
  id: number;
  nome: string;
  endereco: string;
  padrao_link: string | null;
}

export interface RelatorioEditais {
  sites: { site: string; status: string; itens?: number; erro?: string }[];
  materiasAbertas: number;
  concursosNovos: number;
  concursosAtualizados: number;
  /** Recalculados com uma regra nova de avaliação. */
  recalculados?: number;
  ignoradas: Record<string, number>;
  elapsedMs: number;
}

async function emParalelo<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (proximo < itens.length) await fn(itens[proximo++]!);
  }));
}

async function lerListagem(site: Site, robots: RobotsChecker): Promise<ItemListagem[]> {
  if (!(await robots.allows(site.endereco))) throw new Error("bloqueada pelo robots.txt");
  return itensDaListagem(await fetchHtml(site.endereco), site.endereco, site.padrao_link);
}

function canonica(url: string): string | null {
  try {
    return canonicalUrl(url);
  } catch {
    return null;
  }
}

/** Concurso do órgão: o ciclo atual, ou um novo se o anterior já acabou há muito tempo. */
async function concursoDoOrgao(orgao: OrgaoEncontrado, extracao: Extracao) {
  const db = sql();
  const [atual] = (await db`
    select id, ciclo, fase, resumo, atualizado_em < now() - make_interval(days => ${DIAS_NOVO_CICLO}) as antigo
    from concursos where orgao_chave = ${orgao.chave} order by ciclo desc limit 1`) as
    { id: string; ciclo: number; fase: string; resumo: Agregado; antigo: boolean }[];
  const acabou = atual && (atual.fase === "andamento" || atual.fase === "encerrado") && atual.antigo
    && !["andamento", "encerrado"].includes(extracao.fase);
  if (atual && !acabou) return { id: atual.id, antes: atual.resumo as Agregado | null, novo: false };

  const [criado] = (await db`
    insert into concursos (orgao_chave, ciclo, orgao_nome, uf, esfera, orgao_area, orgao_origem, resumo)
    values (${orgao.chave}, ${(atual?.ciclo ?? 0) + 1}, ${orgao.nome}, ${orgao.uf}, ${orgao.esfera}, ${orgao.area ?? null},
            ${orgao.origem}, '{}'::jsonb)
    returning id`) as { id: string }[];
  return { id: criado!.id, antes: null, novo: true };
}

/** Recalcula o resumo do concurso a partir de todas as matérias dele e registra o que mudou. */
export async function recalcular(id: string, antes: Agregado | null) {
  const db = sql();
  const noticias = ((await db`
    select to_char(publicado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "publicadoEm", extracao, 'noticia' as tipo, url, titulo
    from concurso_fontes where concurso_id = ${id}`) as (FonteExtraida & { titulo: string })[])
    // Extração antiga (antes da 016) não tem os cargos de formação específica: tira do título, que fica guardado.
    .map(({ titulo, ...f }) => {
      if ((f.extracao.versao ?? 1) >= 2) return f;
      // Extração antiga: refaz pelo título (guardado) o que mudou depois — formação específica e regime temporário
      // (antes qualquer menção a "temporário" marcava o concurso; agora só sinal forte).
      const temporario = tituloTemporario(titulo);
      const regime: Extracao["regime"] = temporario ? "temporario" : f.extracao.regime === "temporario" ? null : f.extracao.regime;
      return <FonteExtraida>{
        ...f,
        extracao: {
          ...f.extracao,
          nicho: f.extracao.nicho ?? nichosNoTexto(normalizar(titulo)),
          regime,
          duracao: temporario ? f.extracao.duracao ?? null : null,
        },
      };
    });
  // A tabela de PDFs vem da migração 014: antes dela, segue só com as notícias.
  const pdfs = (await db`
    select to_char(baixado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "publicadoEm", extracao,
           case when tipo = 'anterior' then 'anterior' else 'edital' end as tipo, url
    from concurso_editais where concurso_id = ${id} and status = 'ok'`.catch(() => [])) as FonteExtraida[];
  const [orgao] = (await db`select uf, orgao_area as area, fase from concursos where id = ${id}`) as { uf: string | null; area: "ti" | "policia" | "fora" | null; fase: string }[];
  const ag = agregar([...noticias, ...pdfs]);
  const av = avaliar({ uf: orgao!.uf, area: orgao!.area ?? undefined }, ag);
  const mudancas = eventos(antes, ag);

  await db.transaction([
    db`update concursos set
         fase = ${ag.fase}, visivel = ${av.visivel}, motivo_oculto = ${av.motivo}, area = ${av.area},
         visivel_geral = ${av.visivelGeral}, peso_geral = ${av.pesoGeral},
         situacao_salario = ${av.situacaoSalario}, salario_inicial_centavos = ${av.salarioInicialCentavos},
         salario_final_centavos = ${av.salarioFinalCentavos}, peso = ${av.peso},
         inscricoes_ate = ${ag.inscricoesAte}::date, prova_em = ${ag.provaEm}::date,
         resumo = ${JSON.stringify(ag)}::jsonb, atualizado_em = now(),
         mudou_em = case when ${mudancas.length > 0} then now() else mudou_em end
       where id = ${id}`,
    db`insert into concurso_eventos (concurso_id, tipo, descricao)
       select ${id}, e.tipo, e.descricao from jsonb_to_recordset(${JSON.stringify(mudancas)}::jsonb) as e(tipo text, descricao text)`,
  ]);
  await enfileirarPdfs(id, ag);
  return mudancas;
}

/**
 * PDFs citados nas matérias entram na fila de leitura. Antes do edital sair (rumor... banca), o PDF que a matéria
 * linka é o do concurso anterior: vira "anterior" (referência), não mexe em datas.
 */
async function enfileirarPdfs(id: string, ag: Agregado) {
  if (!ag.editais.length) return;
  const antesDoEdital = ["rumor", "autorizado", "comissao", "banca"].includes(ag.fase);
  const linhas = ag.editais.map((url) => ({
    url,
    tipo: antesDoEdital ? "anterior" : /retifica/i.test(url) ? "retificacao" : "atual",
  }));
  await sql()`
    insert into concurso_editais (concurso_id, url, tipo)
    select ${id}, l.url, l.tipo from jsonb_to_recordset(${JSON.stringify(linhas)}::jsonb) as l(url text, tipo text)
    on conflict (concurso_id, url) do nothing`.catch(() => undefined);
}

export async function coletarEditais(): Promise<RelatorioEditais> {
  const inicio = Date.now();
  const db = sql();
  const robots = new RobotsChecker();
  const relatorio: RelatorioEditais = { sites: [], materiasAbertas: 0, concursosNovos: 0, concursosAtualizados: 0, ignoradas: {}, elapsedMs: 0 };
  const ignorar = (motivo: string) => (relatorio.ignoradas[motivo] = (relatorio.ignoradas[motivo] ?? 0) + 1);

  // 1. Listagens
  const sites = (await db`select id, nome, endereco, padrao_link from edital_sites where ativo order by id`) as Site[];
  const candidatos = new Map<string, ItemListagem & { site: string }>();
  await emParalelo(sites, 4, async (site) => {
    try {
      const itens = await lerListagem(site, robots);
      for (const item of itens) {
        const chave = canonica(item.url);
        if (chave && !candidatos.has(chave)) candidatos.set(chave, { ...item, site: site.nome });
      }
      await db`update edital_sites set ultima_coleta = now(), falhas_seguidas = 0, ultimo_erro = null where id = ${site.id}`;
      relatorio.sites.push({ site: site.nome, status: "ok", itens: itens.length });
    } catch (error) {
      const erro = error instanceof Error ? error.message : String(error);
      const [row] = (await db`
        update edital_sites set falhas_seguidas = falhas_seguidas + 1, ultimo_erro = ${erro},
          ativo = falhas_seguidas + 1 < ${MAX_FALHAS}, ultima_coleta = now()
        where id = ${site.id} returning ativo`) as { ativo: boolean }[];
      relatorio.sites.push({ site: site.nome, status: row?.ativo === false ? "desativado" : "falhou", erro });
    }
  });

  // Toda matéria das listagens conta para o "em alta", mesmo as que o filtro esconde.
  await registrarMencoes([...candidatos]);

  // 2. Só o que ainda não foi visto
  const chaves = [...candidatos.keys()];
  const vistas = new Set(((await db`
    select url_canonica from concurso_fontes where url_canonica = any(${chaves})
    union select url_canonica from edital_urls_vistas where url_canonica = any(${chaves})`) as { url_canonica: string }[])
    .map((r) => r.url_canonica));
  const novas = [...candidatos].filter(([chave]) => !vistas.has(chave)).filter(([, item]) => {
    if (ehPanorama(item.titulo)) return ignorar("panorama (vários concursos)"), false;
    if (!valeAbrir(item, SALARIO_MINIMO_CENTAVOS)) return ignorar("listagem já mostra fora do perfil/salário"), false;
    return true;
  })
    // O limite por rodada não pode deixar Pernambuco de fora: abre primeiro o que é de PE, depois vizinhos, BA e nacional.
    .sort(([, a], [, b]) => prioridade(a) - prioridade(b))
    .slice(0, MAX_MATERIAS_POR_RODADA);

  // 3. Abre as matérias (em paralelo, até o prazo) e extrai
  const extraidas: { chave: string; item: ItemListagem & { site: string }; extracao: Extracao; publicadoEm: Date | null }[] = [];
  const naoUsar: { chave: string; motivo: string }[] = [];
  await emParalelo(novas, CONCORRENCIA, async ([chave, item]) => {
    if (Date.now() - inicio > PRAZO_MS) return;
    try {
      if (!(await robots.allows(item.url))) return void naoUsar.push({ chave, motivo: "robots" });
      const html = await fetchHtml(item.url);
      relatorio.materiasAbertas++;
      const artigo = extractArticle(html, item.url);
      const texto = artigo?.blocks.map((b) => b.text).join("\n") ?? item.contexto;
      const publicadoEm = dataDaPagina(html);
      const extracao = extrair({ titulo: item.titulo, texto, publicadoEm, pdfs: pdfsDaPagina(html, item.url) });
      if (!extracao.orgao) return void naoUsar.push({ chave, motivo: "órgão não reconhecido" });
      extraidas.push({ chave, item, extracao, publicadoEm });
    } catch {
      // Falha de rede: tenta de novo amanhã (não marca como vista).
      ignorar("falha ao abrir");
    }
  });

  for (const { chave, motivo } of naoUsar) ignorar(motivo);
  if (naoUsar.length) {
    await db`insert into edital_urls_vistas (url_canonica, motivo)
             select c, m from jsonb_to_recordset(${JSON.stringify(naoUsar.map((n) => ({ c: n.chave, m: n.motivo })))}::jsonb) as x(c text, m text)
             on conflict do nothing`;
  }

  // 4. Junta no concurso (em série: duas matérias do mesmo órgão não podem criar dois concursos)
  const atualizados = new Map<string, Agregado | null>();
  for (const e of extraidas) {
    const concurso = await concursoDoOrgao(e.extracao.orgao!, e.extracao);
    if (!atualizados.has(concurso.id)) atualizados.set(concurso.id, concurso.antes && Object.keys(concurso.antes).length ? concurso.antes : null);
    if (concurso.novo) relatorio.concursosNovos++;
    await db`
      insert into concurso_fontes (concurso_id, url, url_canonica, titulo, site, publicado_em, extracao)
      values (${concurso.id}, ${e.item.url}, ${e.chave}, ${e.item.titulo}, ${e.item.site}, ${e.publicadoEm?.toISOString() ?? null},
              ${JSON.stringify(e.extracao)}::jsonb)
      on conflict (url_canonica) do nothing`;
  }
  for (const [id, antes] of atualizados) {
    await recalcular(id, antes);
    relatorio.concursosAtualizados++;
  }

  relatorio.recalculados = await recalcularPendentes(inicio + PRAZO_MS + 40_000);

  await db`delete from edital_urls_vistas where visto_em < now() - interval '60 days'`;
  relatorio.elapsedMs = Date.now() - inicio;
  return relatorio;
}

const PRIORIDADE_UF: Record<string, number> = { PE: 0, PB: 1, AL: 1, RN: 1, BA: 2, BR: 3 };

/** Ordem de abertura: região (pelo órgão do título ou a UF da listagem) e, de desempate, cargo de TI citado. */
export function prioridade(item: ItemListagem): number {
  const uf = identificarOrgao(item.titulo, item.contexto)?.uf ?? /(?:^|\s|-|\()(PE|PB|AL|RN|BA)(?:\s|\)|$)/.exec(item.contexto)?.[1] ?? null;
  const regiao = uf ? PRIORIDADE_UF[uf] ?? 5 : 4;
  const ti = /\b(TI|tecnologia da informa|inform[aá]tica|sistemas|desenvolv|dados|pol[ií]cia federal|PF|PRF|ABIN|pol[ií]cia civil)\b/i.test(item.titulo) ? -0.5 : 0;
  return regiao + ti;
}

async function registrarMencoes(itens: [string, ItemListagem & { site: string }][]) {
  const linhas = itens.flatMap(([chave, item]) => {
    if (ehPanorama(item.titulo)) return [];
    const orgao = identificarOrgao(item.titulo, item.contexto);
    return orgao ? [{ c: chave, k: orgao.chave, n: orgao.nome, u: orgao.uf, s: item.site, t: item.titulo.slice(0, 300) }] : [];
  });
  if (!linhas.length) return;
  await sql()`
    insert into edital_mencoes (url_canonica, orgao_chave, orgao_nome, uf, site, titulo)
    select c, k, n, u, s, t from jsonb_to_recordset(${JSON.stringify(linhas)}::jsonb) as x(c text, k text, n text, u text, s text, t text)
    on conflict do nothing`.catch(() => undefined); // tabela da 014
}

/**
 * Regra nova de avaliação (migrações 015/016 zeram visivel_geral): recalcula os que ainda não foram avaliados com ela.
 * Roda na coleta e no acompanhamento, até o prazo.
 */
export async function recalcularPendentes(prazo: number): Promise<number> {
  const db = sql();
  const pendentes = (await db`select id::text, resumo from concursos where visivel_geral is null order by peso desc, id limit 1000`.catch(() => [])) as
    { id: string; resumo: Agregado }[];
  let feitos = 0;
  for (const { id, resumo } of pendentes) {
    if (Date.now() > prazo) break;
    await recalcular(id, resumo && Object.keys(resumo).length ? resumo : null);
    feitos++;
  }
  return feitos;
}

/** Data de publicação pelas metatags comuns (article:published_time, datePublished). */
export function dataDaPagina(html: string): Date | null {
  const m = /(?:article:published_time|datePublished|pubdate)["']?\s*(?:content=|:)\s*["']([^"']{10,40})["']/i.exec(html);
  if (!m) return null;
  const d = new Date(m[1]!);
  return Number.isNaN(d.getTime()) ? null : d;
}
