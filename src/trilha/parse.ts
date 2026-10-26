/**
 * Personalização da trilha, no mesmo formato que o app guarda (src/trilha/extras.ts do Noticiei.web).
 * Validação pura (sem banco), para dar para testar.
 */

export interface ExtraLink {
  title: string | null;
  url: string;
}

export interface Extras {
  topics: Record<string, { note: string; links: ExtraLink[] }>;
  overrides: Record<string, ExtraLink>;
  children: Record<string, ExtraLink[]>;
  addedTopics: Record<number, { id: number; name: string; level: number }[]>;
  addedMaterials: Record<number, { id: number; title: string; url: string }[]>;
  nextId: number;
}

export const EMPTY_EXTRAS: Extras = { topics: {}, overrides: {}, children: {}, addedTopics: {}, addedMaterials: {}, nextId: 1 };

/** "dia:índice", "dia:tN" ou "dia:mN". */
const KEY = /^\d{1,3}:[tm]?\d{1,6}$/;
const MAX_ITEMS = 5000;

class InvalidExtras extends Error {}

const fail = (message: string): never => {
  throw new InvalidExtras(message);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: unknown, field: string, max: number, { optional = false } = {}): string | null {
  if (value === null || value === undefined || value === "") return optional ? null : fail(`${field} é obrigatório`);
  if (typeof value !== "string") return fail(`${field} deve ser texto`);
  const trimmed = value.trim();
  if (!trimmed) return optional ? null : fail(`${field} é obrigatório`);
  if (trimmed.length > max) fail(`${field} passa de ${max} caracteres`);
  return trimmed;
}

function link(value: unknown, field: string): ExtraLink {
  if (!isObject(value)) return fail(`${field} deve ser um objeto`);
  return { title: text(value.title, `${field}.title`, 300, { optional: true }), url: text(value.url, `${field}.url`, 2000)! };
}

function links(value: unknown, field: string): ExtraLink[] {
  if (!Array.isArray(value)) return fail(`${field} deve ser uma lista`);
  return value.map((l, i) => link(l, `${field}[${i}]`));
}

function record<T>(value: unknown, field: string, parse: (v: unknown, key: string) => T, key: RegExp = KEY): Record<string, T> {
  if (value === undefined) return {};
  if (!isObject(value)) return fail(`${field} deve ser um objeto`);
  const entries = Object.entries(value);
  if (entries.length > MAX_ITEMS) fail(`${field} tem itens demais`);
  return Object.fromEntries(
    entries.map(([k, v]) => {
      if (!key.test(k)) fail(`${field}: chave inválida "${k}"`);
      return [k, parse(v, `${field}.${k}`)];
    }),
  );
}

const DAY = /^\d{1,3}$/;

function id(value: unknown, field: string): number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) < 2 ** 31 ? (value as number) : fail(`${field} inválido`);
}

/** Valida e normaliza o corpo do PUT /api/trilha. */
export function parseExtras(body: unknown): Extras {
  if (!isObject(body)) return fail("corpo deve ser um objeto");
  const extras: Extras = {
    topics: record(body.topics, "topics", (v, f) => {
      if (!isObject(v)) return fail(`${f} deve ser um objeto`);
      return { note: text(v.note, `${f}.note`, 10000, { optional: true }) ?? "", links: links(v.links ?? [], `${f}.links`) };
    }),
    overrides: record(body.overrides, "overrides", link),
    children: record(body.children, "children", links),
    addedTopics: record(
      body.addedTopics,
      "addedTopics",
      (v, f) => {
        if (!Array.isArray(v)) return fail(`${f} deve ser uma lista`);
        return v.map((t, i) => {
          if (!isObject(t)) return fail(`${f}[${i}] deve ser um objeto`);
          const level = t.level === 2 ? 2 : t.level === 1 ? 1 : fail(`${f}[${i}].level deve ser 1 ou 2`);
          return { id: id(t.id, `${f}[${i}].id`), name: text(t.name, `${f}[${i}].name`, 300)!, level };
        });
      },
      DAY,
    ),
    addedMaterials: record(
      body.addedMaterials,
      "addedMaterials",
      (v, f) => {
        if (!Array.isArray(v)) return fail(`${f} deve ser uma lista`);
        return v.map((m, i) => {
          if (!isObject(m)) return fail(`${f}[${i}] deve ser um objeto`);
          return { id: id(m.id, `${f}[${i}].id`), title: text(m.title, `${f}[${i}].title`, 300)!, url: text(m.url, `${f}[${i}].url`, 2000)! };
        });
      },
      DAY,
    ),
    nextId: id(body.nextId ?? 1, "nextId"),
  };
  // Dia fora da trilha não existe no app.
  for (const day of [...Object.keys(extras.addedTopics), ...Object.keys(extras.addedMaterials)]) {
    if (Number(day) < 1 || Number(day) > 366) fail(`dia ${day} inválido`);
  }
  // O app nunca reaproveita um id: o próximo tem de ser maior que todos os usados.
  const ids = [...Object.values(extras.addedTopics).flat(), ...Object.values(extras.addedMaterials).flat()].map((x) => x.id);
  if (new Set(ids).size !== ids.length) fail("id repetido entre tópicos/cursos criados");
  extras.nextId = Math.max(extras.nextId, ...ids.map((n) => n + 1), 1);
  return extras;
}

export const isInvalidExtras = (error: unknown) => error instanceof InvalidExtras;
