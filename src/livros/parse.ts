/**
 * Validação dos corpos das rotas de Livros (sem banco, para dar para testar).
 * O catálogo vem do LivreQ; textos e ideias vêm do celular.
 */

export class ErroLivros extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const falha = (mensagem: string, status = 400): never => {
  throw new ErroLivros(mensagem, status);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** syncId do LivreQ: letras, números, "-" e "_", de 8 a 40. */
const SYNC_ID = /^[A-Za-z0-9_-]{8,40}$/;

export const MAX_TEXTO = 200_000;
export const MAX_IDEIA = 20_000;
const MAX_LIVROS = 500;

export function uuidOuFalha(v: string | undefined, status = 404): string {
  if (!v || !UUID.test(v)) falha("id deve ser um uuid", status);
  return v!.toLowerCase();
}

export function syncIdOuFalha(v: unknown, campo: string): string {
  if (typeof v !== "string" || !SYNC_ID.test(v)) falha(`${campo} inválido`);
  return v as string;
}

const textoOpcional = (v: unknown, campo: string, max: number): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") falha(`${campo} deve ser texto`);
  const s = (v as string).trim();
  if (s.length > max) falha(`${campo} passa de ${max} caracteres`);
  return s || null;
};

const inteiro = (v: unknown, campo: string): number => {
  if (v === undefined || v === null) return 0;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) falha(`${campo} deve ser inteiro >= 0`);
  return v as number;
};

const dataOpcional = (v: unknown, campo: string): string | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) falha(`${campo} deve ser uma data ISO`);
  return new Date(v as string).toISOString();
};

/** Palavras como o LivreQ conta (src/core/format.js countWords): letras e números; travessão não conta. */
export function contarPalavras(texto: string): number {
  return (texto.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

export function objeto(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) falha("corpo deve ser um objeto JSON");
  return body as Record<string, unknown>;
}

export interface GrupoCatalogo {
  id: string;
  nome: string;
}

export interface LivroCatalogo {
  id: string;
  grupoId: string | null;
  titulo: string;
  subtitulo: string | null;
  volume: number | null;
  palavras: number;
  capitulos: number;
  ultimaEscritaEm: string | null;
}

export function lerCatalogo(body: unknown): { grupos: GrupoCatalogo[]; livros: LivroCatalogo[] } {
  const b = objeto(body);
  if (!Array.isArray(b.grupos) || !Array.isArray(b.livros)) falha("catálogo precisa de grupos e livros (listas)");
  const gruposBrutos = b.grupos as unknown[];
  const livrosBrutos = b.livros as unknown[];
  if (gruposBrutos.length > MAX_LIVROS || livrosBrutos.length > MAX_LIVROS) falha(`no máximo ${MAX_LIVROS} grupos e livros`);

  const grupos = gruposBrutos.map((g, i) => {
    const o = objeto(g);
    const nome = textoOpcional(o.nome, `grupos[${i}].nome`, 200);
    if (!nome) falha(`grupos[${i}].nome é obrigatório`);
    return { id: syncIdOuFalha(o.id, `grupos[${i}].id`), nome: nome! };
  });
  const idsGrupos = new Set(grupos.map((g) => g.id));
  if (idsGrupos.size !== grupos.length) falha("grupo repetido no catálogo");

  const livros = livrosBrutos.map((l, i) => {
    const o = objeto(l);
    const titulo = textoOpcional(o.titulo, `livros[${i}].titulo`, 300);
    if (!titulo) falha(`livros[${i}].titulo é obrigatório`);
    const grupoId = o.grupoId === undefined || o.grupoId === null ? null : syncIdOuFalha(o.grupoId, `livros[${i}].grupoId`);
    if (grupoId && !idsGrupos.has(grupoId)) falha(`livros[${i}].grupoId não está nos grupos`);
    const volume = o.volume === undefined || o.volume === null || o.volume === "" ? null : Number(o.volume);
    return {
      id: syncIdOuFalha(o.id, `livros[${i}].id`),
      grupoId,
      titulo: titulo!,
      subtitulo: textoOpcional(o.subtitulo, `livros[${i}].subtitulo`, 300),
      volume: volume !== null && Number.isSafeInteger(volume) ? volume : null,
      palavras: inteiro(o.palavras, `livros[${i}].palavras`),
      capitulos: inteiro(o.capitulos, `livros[${i}].capitulos`),
      ultimaEscritaEm: dataOpcional(o.ultimaEscritaEm, `livros[${i}].ultimaEscritaEm`),
    };
  });
  if (new Set(livros.map((l) => l.id)).size !== livros.length) falha("livro repetido no catálogo");
  return { grupos, livros };
}

export interface TextoEntrada {
  livroId: string;
  titulo: string | null;
  texto: string;
}

export function lerTexto(body: unknown): TextoEntrada {
  const b = objeto(body);
  const livroId = syncIdOuFalha(b.livroId, "livroId");
  if (b.texto !== undefined && typeof b.texto !== "string") falha("texto deve ser texto");
  const texto = typeof b.texto === "string" ? b.texto : "";
  if (texto.length > MAX_TEXTO) falha(`texto passa de ${MAX_TEXTO} caracteres`);
  return { livroId, titulo: textoOpcional(b.titulo, "titulo", 300), texto };
}

export interface IdeiaEntrada {
  grupoId: string | null;
  titulo: string | null;
  texto: string;
}

export function lerIdeia(body: unknown): IdeiaEntrada {
  const b = objeto(body);
  const texto = textoOpcional(b.texto, "texto", MAX_IDEIA);
  const titulo = textoOpcional(b.titulo, "titulo", 300);
  if (!texto && !titulo) falha("a ideia precisa de texto");
  const grupoId = b.grupoId === undefined || b.grupoId === null ? null : syncIdOuFalha(b.grupoId, "grupoId");
  // O LivreQ guarda a ideia com texto; só título vira o texto.
  return { grupoId, titulo: texto ? titulo : null, texto: (texto ?? titulo)! };
}

export function lerIds(body: unknown): string[] {
  const b = objeto(body);
  if (!Array.isArray(b.ids) || b.ids.length > 1000) falha("ids deve ser uma lista (até 1000)");
  return (b.ids as unknown[]).map((x) => uuidOuFalha(typeof x === "string" ? x : undefined, 400));
}
