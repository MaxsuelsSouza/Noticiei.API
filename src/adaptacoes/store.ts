import { sql } from "../db.js";
import type { LivroOL, Producao } from "./fontes.js";
import { abaDe, nota, type Aba, type Fase, type Nota, type Tipo } from "./regras.js";

/** Consultas do módulo Adaptações. A nota é calculada na leitura (a popularidade é relativa à lista do dia). */

export type Origem = "manual" | "wikidata" | "titulo_autor" | "titulo" | "nenhum";

/** Some da lista o que a coleta não vê há este tempo (saiu do "discover" do TMDB: estreou, mudou de status...). */
const DIAS_VISIVEL = 7;
export const TOP_POR_ABA = 30;

export const idDe = (tipo: Tipo, tmdbId: number) => `${tipo === "filme" ? "m" : "t"}${tmdbId}`;
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

// ---------------------------------------------------------------- gravação (rotina)

/** Grava a produção e registra a mudança de fase (ou de data, dentro de "com_data"). */
export async function salvarProducao(p: Producao, fase: Fase): Promise<{ nova: boolean; mudou: boolean }> {
  const id = idDe(p.tipo, p.tmdbId);
  const [antes] = (await sql()`select fase, estreia::text as estreia from adaptacoes where id = ${id}`) as { fase: Fase; estreia: string | null }[];
  const mudou = !antes || antes.fase !== fase || (fase === "com_data" && antes.estreia !== p.estreia);
  await sql()`
    insert into adaptacoes (id, tipo, tmdb_id, titulo, titulo_original, status_tmdb, fase, estreia, estreia_br, popularidade,
                            capa, direcao, autor_creditado, visto_em, fase_mudou_em)
    values (${id}, ${p.tipo}, ${p.tmdbId}, ${p.titulo}, ${p.tituloOriginal}, ${p.status}, ${fase}, ${p.estreia}, ${p.estreiaBr},
            ${p.popularidade}, ${p.capa}, ${p.direcao}, ${p.autorCreditado}, now(), now())
    on conflict (id) do update set
      titulo = excluded.titulo, titulo_original = excluded.titulo_original, status_tmdb = excluded.status_tmdb,
      fase = excluded.fase, estreia = excluded.estreia, estreia_br = excluded.estreia_br,
      popularidade = excluded.popularidade, capa = excluded.capa, direcao = excluded.direcao,
      autor_creditado = coalesce(excluded.autor_creditado, adaptacoes.autor_creditado), visto_em = now(),
      fase_mudou_em = case when ${mudou} then now() else adaptacoes.fase_mudou_em end`;
  if (mudou) await sql()`insert into adaptacoes_fases (adaptacao_id, fase, estreia) values (${id}, ${fase}, ${p.estreia})`;
  return { nova: !antes, mudou: !!antes && mudou };
}

export interface ParaLigar {
  id: string;
  tipo: Tipo;
  tmdbId: number;
  titulo: string;
  tituloOriginal: string | null;
  autorCreditado: string | null;
}

/** Vistas hoje e ainda sem livro (ou ligadas só pelo título / sem achado, há mais de 7 dias: tenta de novo). */
export async function paraLigar(): Promise<ParaLigar[]> {
  const rows = (await sql()`
    select a.id, a.tipo, a.tmdb_id, a.titulo, a.titulo_original, a.autor_creditado
    from adaptacoes a left join adaptacoes_ligacoes l on l.adaptacao_id = a.id
    where a.visto_em > now() - interval '1 day' and a.fase not in ('cancelado', 'lancado')
      and (l.adaptacao_id is null or (l.origem in ('nenhum', 'titulo') and l.atualizado_em < now() - interval '7 days'))
    order by a.popularidade desc`) as { id: string; tipo: Tipo; tmdb_id: number; titulo: string; titulo_original: string | null; autor_creditado: string | null }[];
  return rows.map((r) => ({ id: r.id, tipo: r.tipo, tmdbId: Number(r.tmdb_id), titulo: r.titulo, tituloOriginal: r.titulo_original, autorCreditado: r.autor_creditado }));
}

export interface LivroGravar {
  id: string;
  olKey: string | null;
  wikidata: string | null;
  titulo: string;
  autor: string | null;
  ano: number | null;
  /** undefined = não mexe no que já havia. */
  leitores?: number;
}

export async function salvarLivro(l: LivroGravar): Promise<string> {
  const temLeitores = l.leitores !== undefined;
  await sql()`
    insert into adaptacoes_livros (id, ol_key, wikidata, titulo, autor, ano, leitores, ol_em)
    values (${l.id}, ${l.olKey}, ${l.wikidata}, ${l.titulo}, ${l.autor}, ${l.ano}, ${l.leitores ?? null}, ${temLeitores ? new Date() : null})
    on conflict (id) do update set
      ol_key = coalesce(excluded.ol_key, adaptacoes_livros.ol_key),
      wikidata = coalesce(excluded.wikidata, adaptacoes_livros.wikidata),
      titulo = excluded.titulo, autor = coalesce(excluded.autor, adaptacoes_livros.autor),
      ano = coalesce(excluded.ano, adaptacoes_livros.ano),
      leitores = case when ${temLeitores} then excluded.leitores else adaptacoes_livros.leitores end,
      ol_em = case when ${temLeitores} then excluded.ol_em else adaptacoes_livros.ol_em end`;
  return l.id;
}

export const livroDoOL = (o: LivroOL, wikidata: string | null = null): LivroGravar => ({
  id: o.olKey, olKey: o.olKey, wikidata, titulo: o.titulo, autor: o.autor, ano: o.ano, leitores: o.leitores,
});

/** Liga a adaptação ao livro. A escolha manual só é trocada por outra manual. */
export async function ligar(adaptacaoId: string, livroId: string | null, origem: Origem): Promise<void> {
  await sql()`
    insert into adaptacoes_ligacoes (adaptacao_id, livro_id, origem, atualizado_em)
    values (${adaptacaoId}, ${livroId}, ${origem}, now())
    on conflict (adaptacao_id) do update set livro_id = excluded.livro_id, origem = excluded.origem, atualizado_em = now()
    where adaptacoes_ligacoes.origem <> 'manual' or excluded.origem = 'manual'`;
}

export interface LivroSinal {
  id: string;
  olKey: string | null;
  titulo: string;
  autor: string | null;
}

/** Livros ligados a adaptações visíveis, sem contagem da Open Library ou com ela vencida (30 dias). */
export async function livrosParaOL(limite: number): Promise<LivroSinal[]> {
  return (await sql()`
    select b.id, b.ol_key as "olKey", b.titulo, b.autor from adaptacoes_livros b
    where (b.ol_em is null or b.ol_em < now() - interval '30 days')
      and exists (select 1 from adaptacoes_ligacoes l join adaptacoes a on a.id = l.adaptacao_id
                  where l.livro_id = b.id and a.visto_em > now() - interval '7 days')
    order by b.ol_em nulls first limit ${limite}`) as LivroSinal[];
}

export async function salvarLeitores(id: string, leitores: number | null, olKey: string | null): Promise<void> {
  await sql()`update adaptacoes_livros set leitores = ${leitores}, ol_key = coalesce(${olKey}, ol_key), ol_em = now() where id = ${id}`;
}

/** Livros sem consulta ao NYT (ou vencida: 30 dias), dos ligados às adaptações mais populares primeiro. */
export async function livrosParaNyt(limite: number): Promise<LivroSinal[]> {
  return (await sql()`
    select b.id, b.ol_key as "olKey", b.titulo, b.autor from adaptacoes_livros b
    join adaptacoes_ligacoes l on l.livro_id = b.id join adaptacoes a on a.id = l.adaptacao_id
    where (b.nyt_em is null or b.nyt_em < now() - interval '30 days') and a.visto_em > now() - interval '7 days'
    group by b.id order by max(a.popularidade) desc limit ${limite}`) as LivroSinal[];
}

export async function salvarNyt(id: string, semanas: number, melhor: number | null): Promise<void> {
  await sql()`update adaptacoes_livros set nyt_semanas = ${semanas}, nyt_melhor = ${melhor}, nyt_em = now() where id = ${id}`;
}

// ---------------------------------------------------------------- leitura (app)

export interface Livro {
  id: string;
  olKey: string | null;
  titulo: string;
  autor: string | null;
  ano: number | null;
  leitores: number | null;
  nytSemanas: number | null;
  nytMelhor: number | null;
  origem: Origem;
}

export interface Item {
  id: string;
  tipo: Tipo;
  titulo: string;
  tituloOriginal: string | null;
  fase: Fase;
  aba: Aba | null;
  estreia: string | null;
  estreiaBr: string | null;
  capa: string | null;
  direcao: string | null;
  popularidade: number;
  faseMudouEm: string;
  oculta: boolean;
  livro: Livro | null;
  nota: Nota;
  tmdbUrl: string;
}

interface Row {
  id: string; tipo: Tipo; tmdb_id: number; titulo: string; titulo_original: string | null; fase: Fase;
  estreia: string | null; estreia_br: string | null; capa: string | null; direcao: string | null; popularidade: number;
  fase_mudou_em: string; oculta: boolean; origem: Origem | null; livro_id: string | null; ol_key: string | null;
  livro_titulo: string | null; autor: string | null; ano: number | null; leitores: number | null;
  nyt_semanas: number | null; nyt_melhor: number | null;
}

const SELECT = `
  select a.id, a.tipo, a.tmdb_id, a.titulo, a.titulo_original, a.fase, a.estreia::text as estreia, a.estreia_br::text as estreia_br,
         a.capa, a.direcao, a.popularidade, a.fase_mudou_em, a.oculta, l.origem, b.id as livro_id, b.ol_key,
         b.titulo as livro_titulo, b.autor, b.ano, b.leitores, b.nyt_semanas, b.nyt_melhor
  from adaptacoes a
  left join adaptacoes_ligacoes l on l.adaptacao_id = a.id
  left join adaptacoes_livros b on b.id = l.livro_id`;

function paraItem(r: Row, todas: number[]): Item {
  const livro: Livro | null = r.livro_id
    ? {
        id: r.livro_id, olKey: r.ol_key, titulo: r.livro_titulo!, autor: r.autor, ano: r.ano, leitores: r.leitores,
        nytSemanas: r.nyt_semanas, nytMelhor: r.nyt_melhor, origem: r.origem ?? "titulo",
      }
    : null;
  const popularidade = Number(r.popularidade) || 0;
  return {
    id: r.id, tipo: r.tipo, titulo: r.titulo, tituloOriginal: r.titulo_original, fase: r.fase, aba: abaDe(r.fase),
    estreia: r.estreia, estreiaBr: r.estreia_br, capa: r.capa, direcao: r.direcao, popularidade,
    faseMudouEm: iso(r.fase_mudou_em)!, oculta: r.oculta, livro, nota: nota(livro, popularidade, todas),
    tmdbUrl: `https://www.themoviedb.org/${r.tipo === "filme" ? "movie" : "tv"}/${r.tmdb_id}`,
  };
}

/** Popularidade das adaptações visíveis: base do percentil da nota. */
async function visiveis(): Promise<Row[]> {
  return (await sql().query(`${SELECT}
    where not a.oculta and a.visto_em > now() - interval '${DIAS_VISIVEL} days'
      and a.fase in ('anunciado', 'producao', 'pos', 'com_data')`)) as Row[];
}

const porNota = (a: Item, b: Item) => b.nota.total - a.nota.total || b.popularidade - a.popularidade;

/** As duas abas, cada uma com as TOP_POR_ABA de maior nota. */
export async function listar(): Promise<{ atualizadoEm: string | null; data: Item[]; anunciados: Item[] }> {
  const rows = await visiveis();
  const todas = rows.map((r) => Number(r.popularidade) || 0);
  const itens = rows.map((r) => paraItem(r, todas)).sort(porNota);
  const [ultima] = (await sql()`select max(visto_em) as em from adaptacoes`) as { em: string | null }[];
  return {
    atualizadoEm: iso(ultima?.em),
    data: itens.filter((i) => i.aba === "data").slice(0, TOP_POR_ABA),
    anunciados: itens.filter((i) => i.aba === "anunciados").slice(0, TOP_POR_ABA),
  };
}

/** Itens pelo id (aba Seguindo): vêm mesmo se estrearam, sumiram da coleta ou foram ocultados. */
export async function porIds(ids: string[]): Promise<Item[]> {
  if (!ids.length) return [];
  const todas = (await visiveis()).map((r) => Number(r.popularidade) || 0);
  const rows = (await sql().query(`${SELECT} where a.id = any($1)`, [ids])) as Row[];
  return rows.map((r) => paraItem(r, todas)).sort(porNota);
}

export interface Detalhe extends Item {
  fases: { fase: Fase; estreia: string | null; em: string }[];
}

export async function detalhe(id: string): Promise<Detalhe | null> {
  const [item] = await porIds([id]);
  if (!item) return null;
  const fases = (await sql()`
    select fase, estreia::text as estreia, em from adaptacoes_fases where adaptacao_id = ${id} order by em, id`) as { fase: Fase; estreia: string | null; em: string }[];
  return { ...item, fases: fases.map((f) => ({ fase: f.fase, estreia: f.estreia, em: iso(f.em)! })) };
}

/** "Não é esse livro": a escolha manual vale acima de tudo; livro novo é consultado no NYT na próxima rotina. */
export async function escolherLivro(id: string, livro: LivroOL): Promise<boolean> {
  const [existe] = (await sql()`select 1 from adaptacoes where id = ${id}`) as unknown[];
  if (!existe) return false;
  const livroId = await salvarLivro(livroDoOL(livro));
  await ligar(id, livroId, "manual");
  return true;
}

/** "Não é baseada em livro · tirar da lista" (oculta = true) e o Desfazer (false). */
export async function ocultar(id: string, oculta: boolean): Promise<boolean> {
  const rows = (await sql()`update adaptacoes set oculta = ${oculta} where id = ${id} returning id`) as unknown[];
  return rows.length > 0;
}
