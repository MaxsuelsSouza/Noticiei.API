/**
 * Acompanhamento diário (cron próprio, depois da coleta): favoritos primeiro, depois concursos com edital
 * ainda sem PDF lido. Também lê os PDFs da fila, procura o edital anterior pedido, avisa prazo chegando
 * e mede menções no Reddit para o "em alta".
 */
import { redditAccessToken } from "../collect/fetchers.js";
import { RobotsChecker, USER_AGENT } from "../collect/robots.js";
import { sql } from "../db.js";
import { canonicalUrl } from "../text.js";
import { TIME_ZONE } from "../time.js";
import type { Agregado } from "./avaliar.js";
import { recalcular } from "./collect.js";
import { extrair } from "./extract.js";
import { diarioDoMunicipio, lerPagina, paginaDoConcurso } from "./fontes-extras.js";
import { baixarPdf, lerEdital, PdfSemTexto, textoDoPdf } from "./pdf.js";

const PRAZO_MS = 230_000;
const MAX_FAVORITOS = 25;
const MAX_SEM_PDF = 15;
const MAX_PDFS = 8;
const MAX_TENTATIVAS_PDF = 3;
/** Avisos de prazo (dias antes). */
const LEMBRETES = [7, 3, 1, 0];

interface Concurso {
  id: string;
  orgao_chave: string;
  orgao_nome: string;
  uf: string | null;
  esfera: string | null;
  fase: string;
  favorito: boolean;
  resumo: Agregado;
  diario_visto_ate: string | null;
}

export interface RelatorioAcompanhamento {
  favoritos: number;
  semPdf: number;
  pdfs: { ok: number; falhou: number };
  anteriores: { encontrado: number; nao_encontrado: number };
  diario: number;
  lembretes: number;
  reddit: string;
  erros: string[];
  elapsedMs: number;
}

const resumoAtual = async (id: string) =>
  ((await sql()`select resumo from concursos where id = ${id}`) as { resumo: Agregado }[])[0]?.resumo ?? null;

/** Reabre as matérias mais recentes do concurso (sites de concurso atualizam a mesma página) e a página do concurso no Gran. */
async function revisitar(c: Concurso, robots: RobotsChecker): Promise<void> {
  const db = sql();
  const fontes = (await db`
    select id, url, titulo, publicado_em from concurso_fontes where concurso_id = ${c.id}
    order by publicado_em desc nulls last limit 2`) as { id: string; url: string; titulo: string; publicado_em: string | null }[];
  for (const f of fontes) {
    try {
      const pagina = await lerPagina(f.url, robots);
      if (!pagina) continue;
      const extracao = extrair({ titulo: f.titulo, texto: pagina.texto, publicadoEm: new Date(), pdfs: pagina.pdfs });
      await db`update concurso_fontes set extracao = ${JSON.stringify(extracao)}::jsonb, publicado_em = now(), coletado_em = now() where id = ${f.id}`;
    } catch {
      // página fora do ar hoje: fica a extração anterior
    }
  }
  const pagina = await paginaDoConcurso(c.orgao_chave, c.orgao_nome, robots).catch(() => null);
  if (pagina) {
    const extracao = extrair({ titulo: pagina.titulo, texto: pagina.texto, publicadoEm: new Date(), pdfs: pagina.pdfs });
    await db`
      insert into concurso_fontes (concurso_id, url, url_canonica, titulo, site, publicado_em, extracao)
      values (${c.id}, ${pagina.url}, ${canonicalUrl(pagina.url)}, ${pagina.titulo || c.orgao_nome}, 'Gran · página do concurso', now(),
              ${JSON.stringify(extracao)}::jsonb)
      on conflict (url_canonica) do update set extracao = excluded.extracao, publicado_em = now(), coletado_em = now()`;
  }
}

/** Diário Oficial do município (Querido Diário): só prefeitura/câmara. */
async function verDiario(c: Concurso): Promise<number> {
  const m = /^(?:pref|camara)-(.+?)-(\w\w)$/.exec(c.orgao_chave);
  if (!m) return 0;
  const cidade = c.orgao_nome.replace(/^(Prefeitura|Câmara) de /, "").replace(/ \(\w\w\)$/, "");
  const desde = c.diario_visto_ate ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const mencoes = await diarioDoMunicipio(cidade, m[2]!.toUpperCase(), desde);
  const db = sql();
  for (const d of mencoes.filter((x) => x.data > desde)) {
    await db`insert into concurso_eventos (concurso_id, tipo, descricao)
             values (${c.id}, 'diario', ${`Diário Oficial de ${cidade} (${d.data.split("-").reverse().join("/")}) cita concurso: ${d.trecho.slice(0, 200)} — ${d.url}`})`;
  }
  await db`update concursos set diario_visto_ate = (now() at time zone ${TIME_ZONE})::date where id = ${c.id}`;
  return mencoes.length;
}

/** Lê os PDFs da fila (favoritos primeiro). */
export async function lerPdfsPendentes(limite: number, prazo: number, filtro: { concursoId?: string } = {}) {
  const db = sql();
  const fila = (await db`
    select e.id, e.url, e.tipo, e.concurso_id from concurso_editais e join concursos c on c.id = e.concurso_id
    where e.status = 'pendente' and (${filtro.concursoId ?? null}::bigint is null or e.concurso_id = ${filtro.concursoId ?? null}::bigint)
    order by c.favorito desc, c.interesse desc, c.visivel desc, c.peso desc, e.id
    limit ${limite}`) as { id: string; url: string; tipo: string; concurso_id: string }[];
  const resultado = { ok: 0, falhou: 0, concursos: new Set<string>() };
  for (const pdf of fila) {
    if (Date.now() > prazo) break;
    try {
      const { texto, paginas } = await textoDoPdf(await baixarPdf(pdf.url));
      const extracao = lerEdital(texto, paginas, new Date());
      await db`update concurso_editais set status = 'ok', erro = null, paginas = ${paginas}, baixado_em = now(),
               extracao = ${JSON.stringify(extracao)}::jsonb, tentativas = tentativas + 1 where id = ${pdf.id}`;
      resultado.ok++;
      resultado.concursos.add(pdf.concurso_id);
    } catch (error) {
      const semTexto = error instanceof PdfSemTexto;
      await db`update concurso_editais set tentativas = tentativas + 1, erro = ${(error as Error).message},
               status = case when ${semTexto} then 'sem_texto' when tentativas + 1 >= ${MAX_TENTATIVAS_PDF} then 'falhou' else 'pendente' end
               where id = ${pdf.id}`;
      resultado.falhou++;
    }
  }
  return resultado;
}

/**
 * Edital anterior: (1) PDF de um ciclo anterior do mesmo órgão; (2) PDF que as matérias do rumor linkaram;
 * (3) página do concurso no Gran. O PDF achado é lido (matérias e assuntos) na hora, se der tempo.
 */
export async function buscarAnterior(id: string, prazo: number, robots = new RobotsChecker()): Promise<"encontrado" | "nao_encontrado"> {
  const db = sql();
  const [c] = (await db`select id, orgao_chave, orgao_nome, ciclo from concursos where id = ${id}`) as
    { id: string; orgao_chave: string; orgao_nome: string; ciclo: number }[];
  if (!c) return "nao_encontrado";
  const antes = await resumoAtual(id);

  // (1) ciclos anteriores: copia os PDFs já lidos.
  await db`
    insert into concurso_editais (concurso_id, url, tipo, status, paginas, baixado_em, extracao)
    select ${id}, e.url, 'anterior', e.status, e.paginas, e.baixado_em, e.extracao
    from concurso_editais e join concursos o on o.id = e.concurso_id
    where o.orgao_chave = ${c.orgao_chave} and o.ciclo < ${c.ciclo} and e.tipo in ('atual', 'retificacao') and e.status = 'ok'
    on conflict (concurso_id, url) do nothing`;

  // (3) página do concurso: os PDFs de edital de lá, num concurso que ainda não tem edital, são do anterior.
  let candidatos = (await db`select count(*)::int as n from concurso_editais where concurso_id = ${id} and tipo = 'anterior' and status <> 'falhou'`) as { n: number }[];
  if (!candidatos[0]?.n && Date.now() < prazo) {
    const pagina = await paginaDoConcurso(c.orgao_chave, c.orgao_nome, robots).catch(() => null);
    if (pagina?.pdfs.length) {
      const linhas = pagina.pdfs.slice(0, 3).map((url) => ({ url }));
      await db`insert into concurso_editais (concurso_id, url, tipo)
               select ${id}, l.url, 'anterior' from jsonb_to_recordset(${JSON.stringify(linhas)}::jsonb) as l(url text)
               on conflict (concurso_id, url) do nothing`;
    }
  }

  await lerPdfsPendentes(3, prazo, { concursoId: id });
  candidatos = (await db`select count(*)::int as n from concurso_editais where concurso_id = ${id} and tipo = 'anterior' and status = 'ok'`) as { n: number }[];
  const achou = Boolean(candidatos[0]?.n);
  await db`update concursos set busca_anterior = ${achou ? "encontrado" : "nao_encontrado"}, busca_anterior_em = now(),
           busca_anterior_erro = ${achou ? null : "nenhum PDF do edital anterior encontrado (ciclos anteriores, matérias e página do concurso)"}
           where id = ${id}`;
  if (achou) await recalcular(id, antes);
  return achou ? "encontrado" : "nao_encontrado";
}

/** "Faltam N dias" para inscrição e isenção dos favoritos; um aviso por marco. */
async function lembretes(): Promise<number> {
  const db = sql();
  const rows = (await db`
    with alvo as (
      select id, 'inscrição' as o_que, inscricoes_ate - (now() at time zone ${TIME_ZONE})::date as dias from concursos
      where favorito and inscricoes_ate is not null and fase in ('edital', 'inscricoes')
      union all
      select id, 'isenção da taxa', (resumo ->> 'isencaoAte')::date - (now() at time zone ${TIME_ZONE})::date from concursos
      where favorito and resumo ->> 'isencaoAte' is not null and fase in ('edital', 'inscricoes')
    )
    insert into concurso_eventos (concurso_id, tipo, descricao)
    select a.id, 'lembrete',
           case when a.dias = 0 then 'Hoje é o último dia de ' || a.o_que
                when a.dias = 1 then 'Falta 1 dia para fechar a ' || a.o_que
                else 'Faltam ' || a.dias || ' dias para fechar a ' || a.o_que end
    from alvo a
    where a.dias = any(${LEMBRETES}::int[])
      and not exists (select 1 from concurso_eventos e where e.concurso_id = a.id and e.tipo = 'lembrete'
                      and e.em::date = (now() at time zone ${TIME_ZONE})::date and e.descricao like '%' || a.o_que)
    returning concurso_id::text`) as { concurso_id: string }[];
  // Lembrete conta como novidade do dia (aparece em /hoje e pode virar notificação).
  if (rows.length) await db`update concursos set mudou_em = now() where id = any(${rows.map((x) => x.concurso_id)}::bigint[])`;
  return rows.length;
}

/** Menções no r/concursospublicos na última semana dos órgãos mais citados em PE (só com credenciais do Reddit). */
async function mencoesReddit(prazo: number): Promise<string> {
  let token: string;
  try {
    token = await redditAccessToken();
  } catch (error) {
    return `ignorado: ${(error as Error).message}`;
  }
  const db = sql();
  const top = (await db`
    select orgao_chave, max(orgao_nome) as nome from edital_mencoes
    where uf = 'PE' and visto_em > now() - interval '7 days' group by orgao_chave order by count(*) desc limit 15`) as { orgao_chave: string; nome: string }[];
  let medidos = 0;
  for (const o of top) {
    if (Date.now() > prazo) break;
    const sigla = o.orgao_chave.replace(/-/g, "").toUpperCase();
    const q = `"${o.nome.replace(/ \(\w\w\)$/, "")}" OR ${sigla}`;
    const response = await fetch(`https://oauth.reddit.com/r/concursospublicos/search?${new URLSearchParams({ q, restrict_sr: "1", t: "week", limit: "100" })}`, {
      headers: { authorization: `Bearer ${token}`, "user-agent": USER_AGENT }, signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!response?.ok) continue;
    const data = (await response.json()) as { data: { children: { data: { num_comments: number } }[] } };
    const quantidade = data.data.children.reduce((t, p) => t + 1 + p.data.num_comments, 0);
    await db`insert into concurso_mencoes (orgao_chave, fonte, medido_em, quantidade)
             values (${o.orgao_chave}, 'reddit', (now() at time zone ${TIME_ZONE})::date, ${quantidade})
             on conflict (orgao_chave, fonte, medido_em) do update set quantidade = excluded.quantidade`;
    medidos++;
  }
  return `${medidos} órgãos medidos`;
}

export async function acompanhar(): Promise<RelatorioAcompanhamento> {
  const inicio = Date.now();
  const prazo = inicio + PRAZO_MS;
  const db = sql();
  const robots = new RobotsChecker();
  const r: RelatorioAcompanhamento = {
    favoritos: 0, semPdf: 0, pdfs: { ok: 0, falhou: 0 }, anteriores: { encontrado: 0, nao_encontrado: 0 }, diario: 0, lembretes: 0, reddit: "", erros: [], elapsedMs: 0,
  };
  const tocados = new Map<string, Agregado | null>();

  // 1. Favoritos: todo dia. 2. Com edital mas sem PDF lido: a cada 3 dias.
  const favoritos = (await db`
    select id, orgao_chave, orgao_nome, uf, esfera, fase, favorito, resumo, to_char(diario_visto_ate, 'YYYY-MM-DD') as diario_visto_ate
    from concursos where favorito and fase not in ('encerrado') order by favoritado_em limit ${MAX_FAVORITOS}`) as Concurso[];
  const semPdf = (await db`
    select id, orgao_chave, orgao_nome, uf, esfera, fase, favorito, resumo, to_char(diario_visto_ate, 'YYYY-MM-DD') as diario_visto_ate
    from concursos c where visivel and not favorito and fase in ('edital', 'inscricoes')
      and not exists (select 1 from concurso_editais e where e.concurso_id = c.id and e.tipo <> 'anterior' and e.status in ('ok', 'pendente'))
      and (acompanhado_em is null or acompanhado_em < now() - interval '3 days')
    order by peso desc limit ${MAX_SEM_PDF}`) as Concurso[];

  for (const c of [...favoritos, ...semPdf]) {
    if (Date.now() > prazo) break;
    try {
      tocados.set(c.id, c.resumo);
      await revisitar(c, robots);
      if (c.favorito) r.diario += await verDiario(c).catch((e) => (r.erros.push(`diário ${c.orgao_nome}: ${(e as Error).message}`), 0));
      await db`update concursos set acompanhado_em = now() where id = ${c.id}`;
      if (c.favorito) r.favoritos++; else r.semPdf++;
    } catch (error) {
      r.erros.push(`${c.orgao_nome}: ${(error as Error).message}`);
    }
  }
  // Recalcula antes de ler PDFs: a revisita pode ter achado PDF novo (entra na fila).
  for (const [id, antes] of tocados) await recalcular(id, antes);

  // 3. PDFs da fila
  const antesPdf = new Map<string, Agregado | null>();
  for (const row of (await db`select distinct concurso_id from concurso_editais where status = 'pendente'`) as { concurso_id: string }[]) {
    antesPdf.set(row.concurso_id, await resumoAtual(row.concurso_id));
  }
  const pdfs = await lerPdfsPendentes(MAX_PDFS, prazo);
  r.pdfs = { ok: pdfs.ok, falhou: pdfs.falhou };
  for (const id of pdfs.concursos) await recalcular(id, antesPdf.get(id) ?? null);

  // 4. Edital anterior pedido (pendente, ou não achado há mais de 7 dias)
  const buscas = (await db`
    select id from concursos where busca_anterior = 'pendente'
       or (busca_anterior = 'nao_encontrado' and busca_anterior_em < now() - interval '7 days' and (favorito or interesse))
    order by busca_anterior_em nulls first limit 5`) as { id: string }[];
  for (const b of buscas) {
    if (Date.now() > prazo) break;
    r.anteriores[await buscarAnterior(b.id, prazo, robots)]++;
  }

  // 5. Prazos e 6. Reddit
  r.lembretes = await lembretes();
  r.reddit = await mencoesReddit(prazo);
  r.elapsedMs = Date.now() - inicio;
  return r;
}
