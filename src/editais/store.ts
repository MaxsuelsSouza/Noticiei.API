/** Consultas das rotas /api/editais. */
import { sql } from "../db.js";
import { TIME_ZONE } from "../time.js";
import { NOME_FASE, type Agregado } from "./avaliar.js";
import type { Fase } from "./extract.js";

export const TIPOS = ["ativos", "rumores", "editais", "abertos", "favoritos", "todos"] as const;
export type Tipo = (typeof TIPOS)[number];

export interface Filtro {
  tipo: Tipo;
  ufs: string[];
  /** Diagnóstico: inclui os que o filtro escondeu, com o motivo. */
  ocultos: boolean;
}

interface Linha {
  id: string;
  orgao_nome: string;
  orgao_chave: string;
  uf: string | null;
  esfera: string | null;
  fase: Fase;
  area: string | null;
  visivel: boolean;
  motivo_oculto: string | null;
  situacao_salario: string | null;
  salario_inicial_centavos: number | null;
  salario_final_centavos: number | null;
  peso: number;
  inscricoes_ate: string | null;
  prova_em: string | null;
  dias_inscricao: number | null;
  dias_prova: number | null;
  favorito: boolean;
  mudou_em: string;
  primeira_vez: string;
  resumo: Agregado;
}

const colunas = () => sql()`
  c.id::text, c.orgao_nome, c.orgao_chave, c.uf, c.esfera, c.fase, c.area, c.visivel, c.motivo_oculto, c.situacao_salario,
  c.salario_inicial_centavos, c.salario_final_centavos, c.peso, to_char(c.inscricoes_ate, 'YYYY-MM-DD') as inscricoes_ate,
  to_char(c.prova_em, 'YYYY-MM-DD') as prova_em,
  c.inscricoes_ate - (now() at time zone ${TIME_ZONE})::date as dias_inscricao,
  c.prova_em - (now() at time zone ${TIME_ZONE})::date as dias_prova,
  c.favorito, c.mudou_em, c.primeira_vez, c.resumo`;

function cartao(l: Linha) {
  const r = l.resumo;
  return {
    id: Number(l.id),
    orgao: l.orgao_nome,
    uf: l.uf,
    esfera: l.esfera,
    fase: l.fase,
    faseNome: NOME_FASE[l.fase],
    area: l.area,
    salario: { inicialCentavos: l.salario_inicial_centavos, finalCentavos: l.salario_final_centavos, situacao: l.situacao_salario },
    inscricoesAte: l.inscricoes_ate,
    diasParaFecharInscricao: l.dias_inscricao,
    provaEm: l.prova_em,
    diasParaProva: l.dias_prova,
    banca: r.banca ?? null,
    vagas: r.vagas ?? null,
    cadastroReserva: r.cadastroReserva ?? false,
    regime: r.regime ?? null,
    aceitaTecnologo: r.aceitaTecnologo ?? null,
    nivelMedio: r.nivelMedio ?? false,
    edital: r.editais?.[0] ?? null,
    favorito: l.favorito,
    peso: l.peso,
    mudouEm: new Date(l.mudou_em).toISOString(),
    ...(l.visivel ? {} : { oculto: l.motivo_oculto }),
  };
}

export async function listar(filtro: Filtro) {
  const db = sql();
  const rows = (await db`
    select ${colunas()} from concursos c
    where (${filtro.ocultos} or c.visivel)
      and (cardinality(${filtro.ufs}::text[]) = 0 or c.uf = any(${filtro.ufs}::text[]))
      and case ${filtro.tipo}
        when 'todos' then true
        when 'favoritos' then c.favorito
        when 'rumores' then c.fase in ('rumor', 'autorizado', 'comissao', 'banca')
        when 'editais' then c.fase in ('edital', 'inscricoes')
        when 'abertos' then c.fase in ('edital', 'inscricoes')
                         and c.inscricoes_ate >= (now() at time zone ${TIME_ZONE})::date
        else c.fase not in ('andamento', 'encerrado')
             and not (c.inscricoes_ate is not null and c.inscricoes_ate < (now() at time zone ${TIME_ZONE})::date and c.fase in ('edital', 'inscricoes'))
      end
    order by c.visivel desc, c.peso desc, c.mudou_em desc
    limit 200`) as Linha[];
  return rows.map(cartao);
}

export async function detalhe(id: number) {
  const db = sql();
  const [linhas, fontes, evts, pdfRows, extras] = (await db.transaction([
    db`select ${colunas()} from concursos c where c.id = ${id}`,
    db`select titulo, url, site, publicado_em as "publicadoEm" from concurso_fontes where concurso_id = ${id}
       order by publicado_em desc nulls last, coletado_em desc limit 50`,
    db`select tipo, descricao, em from concurso_eventos where concurso_id = ${id} order by em desc limit 50`,
    db`select url, tipo, status, paginas, erro from concurso_editais where concurso_id = ${id} order by tipo, id`,
    db`select busca_anterior, busca_anterior_em, busca_anterior_erro, interesse from concursos where id = ${id}`,
  ])) as [Linha[], { titulo: string; url: string; site: string; publicadoEm: string | null }[], { tipo: string; descricao: string; em: string }[],
    { url: string; tipo: string; status: string; paginas: number | null; erro: string | null }[],
    { busca_anterior: string | null; busca_anterior_em: string | null; busca_anterior_erro: string | null; interesse: boolean }[]];
  const pdfs = pdfRows;
  const l0 = linhas[0];
  if (!l0) return null;
  const l = { ...l0, ...extras[0] };
  const r = l.resumo;
  return {
    ...cartao(l),
    taxaCentavos: r.taxaCentavos ?? null,
    isencaoAte: r.isencaoAte ?? null,
    etapas: r.etapas ?? [],
    restricoes: r.restricoes ?? [],
    cidadesProva: r.cidadesProva ?? [],
    provaNasCapitais: r.provaNasCapitais ?? false,
    editais: r.editais ?? [],
    exigeBacharelado: r.exigeBacharelado ?? false,
    cargosTi: r.cargosTi ?? [],
    /** Matérias e assuntos do edital atual (vazio enquanto o PDF não foi lido). */
    programatico: r.programatico ?? [],
    editalAnterior: r.editalAnterior
      ? { url: r.editalAnterior, programatico: r.programaticoAnterior ?? [] }
      : null,
    buscaAnterior: l.busca_anterior ? { status: l.busca_anterior, em: l.busca_anterior_em, erro: l.busca_anterior_erro } : null,
    interesse: l.interesse ?? false,
    pdfs: pdfs.map((p) => ({ url: p.url, tipo: p.tipo, status: p.status, paginas: p.paginas, erro: p.erro })),
    primeiraVez: new Date(l.primeira_vez).toISOString(),
    fontes,
    eventos: evts,
  };
}

/** O que mudou desde `desde` (padrão: últimas 24 h), só de concursos que aparecem. */
export async function novidades(desde: Date) {
  const db = sql();
  const rows = (await db`
    select ${colunas()}, (select json_agg(json_build_object('tipo', e.tipo, 'descricao', e.descricao, 'em', e.em) order by e.em)
                        from concurso_eventos e where e.concurso_id = c.id and e.em >= ${desde.toISOString()}) as eventos
    from concursos c
    where c.visivel and exists (select 1 from concurso_eventos e where e.concurso_id = c.id and e.em >= ${desde.toISOString()})
    order by c.favorito desc, c.peso desc`) as (Linha & { eventos: unknown[] })[];
  return rows.map((l) => ({ ...cartao(l), eventos: l.eventos }));
}

/** Favoritar um concurso que ainda não tem edital também pede a busca do edital anterior. */
export async function favoritar(id: number, favorito: boolean) {
  const [row] = (await sql()`
    update concursos set favorito = ${favorito}, favoritado_em = case when ${favorito} then now() else null end,
      busca_anterior = case when ${favorito} and busca_anterior is null and fase in ('rumor', 'autorizado', 'comissao', 'banca')
                            then 'pendente' else busca_anterior end
    where id = ${id} returning id, busca_anterior`) as { id: string; busca_anterior: string | null }[];
  return row ? { buscaAnterior: row.busca_anterior } : null;
}

/** "Tenho interesse": marca e pede a busca do edital anterior (se ainda não foi achado). */
export async function marcarInteresse(id: number) {
  const [row] = (await sql()`
    update concursos set interesse = true,
      busca_anterior = case when busca_anterior = 'encontrado' then busca_anterior else 'pendente' end
    where id = ${id} returning busca_anterior`) as { busca_anterior: string }[];
  return row?.busca_anterior ?? null;
}

/**
 * Concursos mais citados (matérias nas listagens + sites diferentes + Reddit) nos últimos `dias`.
 * Inclui o que o filtro esconde (é o termômetro geral); `perfil` diz se o concurso aparece na sua lista.
 */
export async function emAlta(ufs: string[], dias: number) {
  const rows = (await sql()`
    with m as (
      select orgao_chave, max(orgao_nome) as orgao, max(uf) as uf, count(*)::int as materias, count(distinct site)::int as sites,
             max(visto_em) as ultima, (array_agg(titulo order by visto_em desc))[1:3] as titulos
      from edital_mencoes
      where visto_em > now() - make_interval(days => ${dias}) and (cardinality(${ufs}::text[]) = 0 or uf = any(${ufs}::text[]))
      group by orgao_chave
    ), r as (
      select orgao_chave, max(quantidade)::int as reddit from concurso_mencoes
      where medido_em > (now() at time zone ${TIME_ZONE})::date - ${dias}::int group by orgao_chave
    )
    select m.*, coalesce(r.reddit, 0) as reddit, c.id::text as concurso_id, c.fase, c.visivel,
           m.materias + 2 * m.sites + coalesce(r.reddit, 0) as pontos
    from m left join r using (orgao_chave)
    left join lateral (select id, fase, visivel from concursos where orgao_chave = m.orgao_chave order by ciclo desc limit 1) c on true
    order by pontos desc, m.ultima desc
    limit 30`) as {
      orgao_chave: string; orgao: string; uf: string | null; materias: number; sites: number; ultima: string; titulos: string[];
      reddit: number; concurso_id: string | null; fase: Fase | null; visivel: boolean | null; pontos: number;
    }[];
  return rows.map((x, i) => ({
    posicao: i + 1,
    orgao: x.orgao,
    uf: x.uf,
    pontos: x.pontos,
    materias: x.materias,
    sites: x.sites,
    reddit: x.reddit,
    ultimasManchetes: x.titulos,
    concursoId: x.concurso_id ? Number(x.concurso_id) : null,
    fase: x.fase,
    faseNome: x.fase ? NOME_FASE[x.fase] : null,
    perfil: Boolean(x.visivel),
  }));
}
