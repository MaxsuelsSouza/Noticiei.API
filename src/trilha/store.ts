import { sql } from "../db.js";
import { EMPTY_EXTRAS, type ExtraLink, type Extras } from "./parse.js";

interface LinkRow {
  chave: string;
  titulo: string | null;
  url: string;
}

const toLink = (r: LinkRow): ExtraLink => ({ title: r.titulo, url: r.url });

function groupLinks(rows: LinkRow[]): Record<string, ExtraLink[]> {
  const result: Record<string, ExtraLink[]> = {};
  for (const r of rows) (result[r.chave] ??= []).push(toLink(r));
  return result;
}

/** Personalização da trilha no formato do app. `updatedAt` nulo = nunca gravada (o app manda a dele). */
export async function getExtras(): Promise<{ extras: Extras; updatedAt: string | null }> {
  const db = sql();
  const [anotacoes, links, ajustes, subcursos, topicos, cursos, sync] = (await db.transaction([
    db`select chave, nota from trilha_anotacoes`,
    db`select chave, titulo, url from trilha_links order by chave, ordem`,
    db`select chave, titulo, url from trilha_material_ajustes`,
    db`select chave, titulo, url from trilha_subcursos order by chave, ordem`,
    db`select id, dia, nome, nivel from trilha_topicos order by dia, ordem`,
    db`select id, dia, titulo, url from trilha_cursos order by dia, ordem`,
    db`select next_id, updated_at from trilha_sync`,
  ])) as [
    { chave: string; nota: string }[],
    LinkRow[],
    LinkRow[],
    LinkRow[],
    { id: number; dia: number; nome: string; nivel: number }[],
    { id: number; dia: number; titulo: string; url: string }[],
    { next_id: number; updated_at: string }[],
  ];

  const topics: Extras["topics"] = {};
  for (const a of anotacoes) topics[a.chave] = { note: a.nota, links: [] };
  for (const [chave, list] of Object.entries(groupLinks(links))) topics[chave] = { note: topics[chave]?.note ?? "", links: list };

  const addedTopics: Extras["addedTopics"] = {};
  for (const t of topicos) (addedTopics[t.dia] ??= []).push({ id: t.id, name: t.nome, level: t.nivel });
  const addedMaterials: Extras["addedMaterials"] = {};
  for (const c of cursos) (addedMaterials[c.dia] ??= []).push({ id: c.id, title: c.titulo, url: c.url });

  const row = sync[0];
  return {
    extras: {
      ...EMPTY_EXTRAS,
      topics,
      overrides: Object.fromEntries(ajustes.map((r) => [r.chave, toLink(r)])),
      children: groupLinks(subcursos),
      addedTopics,
      addedMaterials,
      nextId: row?.next_id ?? 1,
    },
    updatedAt: row ? new Date(row.updated_at).toISOString() : null,
  };
}

/** Substitui a personalização inteira numa transação (o app sempre manda o conjunto completo). */
export async function saveExtras(extras: Extras): Promise<string> {
  const db = sql();
  const anotacoes = Object.entries(extras.topics)
    .filter(([, t]) => t.note)
    .map(([chave, t]) => ({ chave, nota: t.note }));
  const linkRows = (record: Record<string, ExtraLink[]>) =>
    Object.entries(record).flatMap(([chave, list]) => list.map((l, ordem) => ({ chave, ordem, titulo: l.title, url: l.url })));
  const links = linkRows(Object.fromEntries(Object.entries(extras.topics).map(([k, t]) => [k, t.links])));
  const subcursos = linkRows(extras.children);
  const ajustes = Object.entries(extras.overrides).map(([chave, l]) => ({ chave, titulo: l.title, url: l.url }));
  const topicos = Object.entries(extras.addedTopics).flatMap(([dia, list]) =>
    list.map((t, ordem) => ({ id: t.id, dia: Number(dia), ordem, nome: t.name, nivel: t.level })),
  );
  const cursos = Object.entries(extras.addedMaterials).flatMap(([dia, list]) =>
    list.map((c, ordem) => ({ id: c.id, dia: Number(dia), ordem, titulo: c.title, url: c.url })),
  );
  const rows = (value: unknown[]) => JSON.stringify(value);

  const results = await db.transaction([
    db`delete from trilha_anotacoes`,
    db`delete from trilha_links`,
    db`delete from trilha_material_ajustes`,
    db`delete from trilha_subcursos`,
    db`delete from trilha_topicos`,
    db`delete from trilha_cursos`,
    db`insert into trilha_anotacoes (chave, nota)
       select chave, nota from jsonb_to_recordset(${rows(anotacoes)}::jsonb) as x(chave text, nota text)`,
    db`insert into trilha_links (chave, ordem, titulo, url)
       select chave, ordem, titulo, url from jsonb_to_recordset(${rows(links)}::jsonb) as x(chave text, ordem int, titulo text, url text)`,
    db`insert into trilha_material_ajustes (chave, titulo, url)
       select chave, titulo, url from jsonb_to_recordset(${rows(ajustes)}::jsonb) as x(chave text, titulo text, url text)`,
    db`insert into trilha_subcursos (chave, ordem, titulo, url)
       select chave, ordem, titulo, url from jsonb_to_recordset(${rows(subcursos)}::jsonb) as x(chave text, ordem int, titulo text, url text)`,
    db`insert into trilha_topicos (id, dia, ordem, nome, nivel)
       select id, dia, ordem, nome, nivel from jsonb_to_recordset(${rows(topicos)}::jsonb) as x(id int, dia int, ordem int, nome text, nivel int)`,
    db`insert into trilha_cursos (id, dia, ordem, titulo, url)
       select id, dia, ordem, titulo, url from jsonb_to_recordset(${rows(cursos)}::jsonb) as x(id int, dia int, ordem int, titulo text, url text)`,
    db`insert into trilha_sync (id, next_id) values (1, ${extras.nextId})
       on conflict (id) do update set next_id = excluded.next_id, updated_at = now()
       returning updated_at`,
  ]);
  const [sync] = results.at(-1) as { updated_at: string }[];
  return new Date(sync!.updated_at).toISOString();
}
