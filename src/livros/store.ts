import { sql } from "../db.js";
import { contarPalavras, ErroLivros, type IdeiaEntrada, type LivroCatalogo, type GrupoCatalogo, type TextoEntrada } from "./parse.js";

/**
 * Consultas do módulo Livros. Regra de "novo": o texto não foi apagado e nunca foi usado no LivreQ, ou mudou
 * depois de usado (você continuou escrevendo no celular depois de colar).
 */
// Repetida à mão em listarLivros (tagged template não aceita trecho cru).
const NOVO = "t.apagado_em is null and (t.usado_em is null or t.atualizado_em > t.usado_em)";

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export interface Texto {
  id: string;
  livroId: string;
  titulo: string | null;
  texto: string;
  palavras: number;
  criadoEm: string;
  atualizadoEm: string;
  usadoEm: string | null;
  apagadoEm: string | null;
  novo: boolean;
  /** Já tinha sido usado e mudou depois (etiqueta "continuou no celular"). */
  continuou: boolean;
}

interface TextoRow {
  id: string;
  livro_id: string;
  titulo: string | null;
  texto: string;
  palavras: number;
  criado_em: string;
  atualizado_em: string;
  usado_em: string | null;
  apagado_em: string | null;
}

function paraTexto(r: TextoRow): Texto {
  const atualizado = new Date(r.atualizado_em).getTime();
  const usado = r.usado_em ? new Date(r.usado_em).getTime() : null;
  const vivo = !r.apagado_em;
  return {
    id: r.id,
    livroId: r.livro_id,
    titulo: r.titulo,
    texto: r.texto,
    palavras: r.palavras,
    criadoEm: iso(r.criado_em)!,
    atualizadoEm: iso(r.atualizado_em)!,
    usadoEm: iso(r.usado_em),
    apagadoEm: iso(r.apagado_em),
    novo: vivo && (usado === null || atualizado > usado),
    continuou: vivo && usado !== null && atualizado > usado,
  };
}

// ---------------------------------------------------------------- catálogo

/** Grupos e livros que estão no computador, com quantos textos novos e quantos no total cada livro tem. */
export async function listarLivros() {
  const db = sql();
  const [grupos, livros, sync] = (await db.transaction([
    db`select id, nome from livros_grupos where removido_em is null order by nome`,
    db`select l.id, l.grupo_id, l.titulo, l.subtitulo, l.volume, l.palavras, l.capitulos, l.ultima_escrita_em,
              count(t.id) filter (where t.apagado_em is null)::int as textos,
              count(t.id) filter (where t.apagado_em is null and (t.usado_em is null or t.atualizado_em > t.usado_em))::int as novos
         from livros l left join livros_textos t on t.livro_id = l.id
        where l.removido_em is null
        group by l.id
        order by l.volume nulls last, l.titulo`,
    db`select catalogo_em from livros_sync`,
  ])) as [
    { id: string; nome: string }[],
    {
      id: string; grupo_id: string | null; titulo: string; subtitulo: string | null; volume: number | null; palavras: number;
      capitulos: number; ultima_escrita_em: string | null; textos: number; novos: number;
    }[],
    { catalogo_em: string }[],
  ];
  return {
    grupos,
    livros: livros.map((l) => ({
      id: l.id, grupoId: l.grupo_id, titulo: l.titulo, subtitulo: l.subtitulo, volume: l.volume, palavras: l.palavras,
      capitulos: l.capitulos, ultimaEscritaEm: iso(l.ultima_escrita_em), textos: l.textos, novos: l.novos,
    })),
    catalogoEm: iso(sync[0]?.catalogo_em),
  };
}

/**
 * O LivreQ manda o catálogo inteiro. O que não veio ganha removido_em (os textos do livro continuam guardados);
 * o que voltou perde removido_em.
 */
export async function salvarCatalogo(c: { grupos: GrupoCatalogo[]; livros: LivroCatalogo[] }) {
  const db = sql();
  const grupos = JSON.stringify(c.grupos);
  const livros = JSON.stringify(c.livros);
  const idsGrupos = JSON.stringify(c.grupos.map((g) => g.id));
  const idsLivros = JSON.stringify(c.livros.map((l) => l.id));
  await db.transaction([
    db`insert into livros_grupos (id, nome)
         select x.id, x.nome from jsonb_to_recordset(${grupos}::jsonb) as x(id text, nome text)
       on conflict (id) do update set nome = excluded.nome, removido_em = null`,
    db`update livros_grupos set removido_em = now()
        where removido_em is null and id not in (select jsonb_array_elements_text(${idsGrupos}::jsonb))`,
    db`insert into livros (id, grupo_id, titulo, subtitulo, volume, palavras, capitulos, ultima_escrita_em)
         select x."id", x."grupoId", x."titulo", x."subtitulo", x."volume", x."palavras", x."capitulos", x."ultimaEscritaEm"
           from jsonb_to_recordset(${livros}::jsonb)
             as x("id" text, "grupoId" text, "titulo" text, "subtitulo" text, "volume" int, "palavras" int, "capitulos" int,
                  "ultimaEscritaEm" timestamptz)
       on conflict (id) do update set grupo_id = excluded.grupo_id, titulo = excluded.titulo, subtitulo = excluded.subtitulo,
          volume = excluded.volume, palavras = excluded.palavras, capitulos = excluded.capitulos,
          ultima_escrita_em = excluded.ultima_escrita_em, removido_em = null, atualizado_em = now()`,
    db`update livros set removido_em = now()
        where removido_em is null and id not in (select jsonb_array_elements_text(${idsLivros}::jsonb))`,
    db`insert into livros_sync (id, catalogo_em) values (1, now()) on conflict (id) do update set catalogo_em = now()`,
  ]);
  return { grupos: c.grupos.length, livros: c.livros.length };
}

// ---------------------------------------------------------------- textos

const COLUNAS_TEXTO = "t.id, t.livro_id, t.titulo, t.texto, t.palavras, t.criado_em, t.atualizado_em, t.usado_em, t.apagado_em";

/** `livroId`: os textos de um livro (novos e usados, sem os apagados). `pendentes`: os novos de todos os livros. */
export async function listarTextos(filtro: { livroId?: string; pendentes?: boolean }): Promise<Texto[]> {
  const db = sql();
  const condicoes = ["t.apagado_em is null"];
  const params: unknown[] = [];
  if (filtro.livroId) {
    params.push(filtro.livroId);
    condicoes.push(`t.livro_id = $${params.length}`);
  }
  if (filtro.pendentes) condicoes.push(`(${NOVO})`);
  const rows = (await db.query(
    `select ${COLUNAS_TEXTO} from livros_textos t where ${condicoes.join(" and ")} order by t.atualizado_em desc limit 500`,
    params,
  )) as TextoRow[];
  return rows.map(paraTexto);
}

/**
 * Salvamento automático do celular: grava o texto inteiro, pode repetir. Só mexe em atualizado_em quando o
 * conteúdo mudou, senão um reenvio igual faria o texto "voltar" no LivreQ. Texto apagado continua apagado.
 */
export async function salvarTexto(id: string, t: TextoEntrada): Promise<Texto> {
  const db = sql();
  try {
    const rows = (await db`
      insert into livros_textos (id, livro_id, titulo, texto, palavras)
      values (${id}, ${t.livroId}, ${t.titulo}, ${t.texto}, ${contarPalavras(t.texto)})
      on conflict (id) do update set
        livro_id = excluded.livro_id, titulo = excluded.titulo, texto = excluded.texto, palavras = excluded.palavras,
        atualizado_em = case
          when livros_textos.texto is distinct from excluded.texto or livros_textos.titulo is distinct from excluded.titulo
            or livros_textos.livro_id is distinct from excluded.livro_id
          then now() else livros_textos.atualizado_em end
      returning id, livro_id, titulo, texto, palavras, criado_em, atualizado_em, usado_em, apagado_em`) as TextoRow[];
    return paraTexto(rows[0]!);
  } catch (error) {
    if ((error as { code?: string }).code === "23503") throw new ErroLivros("livro não encontrado", 404);
    throw error;
  }
}

async function umTexto(rows: TextoRow[]): Promise<Texto> {
  if (!rows[0]) throw new ErroLivros("texto não encontrado", 404);
  return paraTexto(rows[0]);
}

/** Apagar do celular (sem confirmação): marca apagado_em; `desfazer` volta. */
export async function apagarTexto(id: string, desfazer = false): Promise<Texto> {
  const db = sql();
  const rows = desfazer
    ? await db`update livros_textos set apagado_em = null where id = ${id} returning *`
    : await db`update livros_textos set apagado_em = coalesce(apagado_em, now()) where id = ${id} returning *`;
  return umTexto(rows as TextoRow[]);
}

/** "Já usei" no LivreQ (ou "voltar para novos"). */
export async function marcarUsado(id: string, usado: boolean): Promise<Texto> {
  const db = sql();
  // usado_em vai para depois do atualizado_em, para o texto sair dos novos mesmo que o relógio do banco empate.
  const rows = usado
    ? await db`update livros_textos set usado_em = greatest(now(), atualizado_em) where id = ${id} returning *`
    : await db`update livros_textos set usado_em = null where id = ${id} returning *`;
  return umTexto(rows as TextoRow[]);
}

// ---------------------------------------------------------------- ideias

interface IdeiaRow {
  id: string;
  grupo_id: string | null;
  titulo: string | null;
  texto: string;
  criado_em: string;
  importada_em: string | null;
}

const paraIdeia = (r: IdeiaRow) => ({
  id: r.id, grupoId: r.grupo_id, titulo: r.titulo, texto: r.texto, criadoEm: iso(r.criado_em)!, importadaEm: iso(r.importada_em),
});

/** `novas`: só as que o LivreQ ainda não gravou no ideias.json. */
export async function listarIdeias(novas = false) {
  const db = sql();
  const rows = (novas
    ? await db`select * from livros_ideias where apagado_em is null and importada_em is null order by criado_em`
    : await db`select * from livros_ideias where apagado_em is null order by criado_em desc limit 300`) as IdeiaRow[];
  return rows.map(paraIdeia);
}

/** Lança (ou corrige) uma ideia. Depois que o LivreQ importou, ela é do LivreQ: não muda mais por aqui. */
export async function salvarIdeia(id: string, i: IdeiaEntrada) {
  const db = sql();
  try {
    const rows = (await db`
      insert into livros_ideias (id, grupo_id, titulo, texto) values (${id}, ${i.grupoId}, ${i.titulo}, ${i.texto})
      on conflict (id) do update set grupo_id = excluded.grupo_id, titulo = excluded.titulo, texto = excluded.texto
        where livros_ideias.importada_em is null
      returning *`) as IdeiaRow[];
    if (!rows[0]) throw new ErroLivros("essa ideia já está no LivreQ: edite por lá", 409);
    return paraIdeia(rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === "23503") throw new ErroLivros("grupo não encontrado", 404);
    throw error;
  }
}

export async function apagarIdeia(id: string, desfazer = false) {
  const db = sql();
  const rows = (desfazer
    ? await db`update livros_ideias set apagado_em = null where id = ${id} returning *`
    : await db`update livros_ideias set apagado_em = coalesce(apagado_em, now()) where id = ${id} returning *`) as IdeiaRow[];
  if (!rows[0]) throw new ErroLivros("ideia não encontrada", 404);
  return paraIdeia(rows[0]);
}

/** O LivreQ avisa que gravou essas ideias no ideias.json. */
export async function marcarImportadas(ids: string[]) {
  if (!ids.length) return { importadas: 0 };
  const db = sql();
  const rows = (await db`
    update livros_ideias set importada_em = coalesce(importada_em, now())
     where id in (select (jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))::uuid)
    returning id`) as { id: string }[];
  return { importadas: rows.length };
}
