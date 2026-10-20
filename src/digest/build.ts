import { sql } from "../db.js";
import type { Category } from "../collect/types.js";
import { localDate } from "../time.js";
import { selectDigest, type Candidate, type Weights } from "./select.js";

const CANDIDATE_WINDOW_DAYS = 3;
const SLOT_ORDER: Category[] = ["tecnologia", "curiosidades", "mundo", "aleatorio"];

export interface BuildResult {
  date: string;
  status: "montado" | "ja-existia" | "sem-conteudo";
  items: number;
}

async function loadWeights(): Promise<Weights> {
  const rows = (await sql()`select kind, key, weight from interest_weights`) as { kind: string; key: string; weight: number }[];
  const weights: Weights = { topic: new Map(), format: new Map() };
  for (const row of rows) (row.kind === "topic" ? weights.topic : weights.format).set(row.key, row.weight);
  return weights;
}

/** Monta o digest do dia, uma vez só. Com force, desfaz o digest do dia e monta de novo. */
export async function buildDigest({ date = localDate(), force = false } = {}): Promise<BuildResult> {
  const db = sql();

  if (force) {
    await db.transaction([
      db`update contents set status = 'classificado'
         where id in (select content_id from digest_items di join digests d on d.id = di.digest_id where d.digest_date = ${date})`,
      db`delete from digests where digest_date = ${date}`,
    ]);
  } else {
    const [existing] = (await db`
      select count(di.*)::int as items from digests d left join digest_items di on di.digest_id = d.id
      where d.digest_date = ${date} group by d.id`) as { items: number }[];
    if (existing) return { date, status: "ja-existia", items: existing.items };
  }

  const candidates = (
    (await db`
      select c.id, c.category, c.topics, c.format, c.engagement, s.type as source_type
      from contents c join sources s on s.id = c.source_id
      where c.status = 'classificado'
        and c.collected_at > now() - make_interval(days => ${CANDIDATE_WINDOW_DAYS})`) as {
      id: string; category: Category; topics: string[]; format: string; engagement: number; source_type: string;
    }[]
  ).map<Candidate>((r) => ({ ...r, id: Number(r.id), sourceType: r.source_type }));

  if (candidates.length === 0) return { date, status: "sem-conteudo", items: 0 };

  const picks = selectDigest(candidates, await loadWeights()).sort(
    (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
  );
  const items = picks.map((p, i) => ({ content_id: p.id, position: i + 1, slot: p.slot, is_exploration: p.isExploration }));

  // Um único comando: cria o digest, grava os itens e marca o conteúdo como entregue.
  const delivered = (await db`
    with d as (
      insert into digests (digest_date) values (${date}) on conflict (digest_date) do nothing returning id
    ), items as (
      insert into digest_items (digest_id, content_id, position, slot, is_exploration)
      select d.id, x.content_id, x.position, x.slot, x.is_exploration
      from d, jsonb_to_recordset(${JSON.stringify(items)}::jsonb)
           as x(content_id bigint, position int, slot text, is_exploration boolean)
      returning content_id
    )
    update contents set status = 'entregue' where id in (select content_id from items) returning id`) as unknown[];

  return { date, status: delivered.length > 0 ? "montado" : "ja-existia", items: delivered.length };
}

/** Conteúdo velho que nunca entrou num digest é descartado, para o banco gratuito não crescer à toa. */
export async function discardStale(days = 7): Promise<number> {
  const rows = (await sql()`
    update contents set status = 'descartado'
    where status = 'classificado' and collected_at < now() - make_interval(days => ${days})
    returning id`) as unknown[];
  return rows.length;
}

export interface DigestView {
  date: string;
  generatedAt: string;
  items: {
    id: number;
    position: number;
    category: Category;
    title: string;
    summary: string;
    url: string;
    source: string;
    language: string;
    format: string;
    topics: string[];
    isExploration: boolean;
    /** Texto completo extraído e disponível em GET /api/content/{id}. */
    hasText: boolean;
    textStatus: string;
    readingMinutes: number | null;
  }[];
}

/** Digest de uma data, ou o mais recente se a data não for informada. */
export async function getDigest(date?: string): Promise<DigestView | null> {
  const db = sql();
  const [digest] = (await (date
    ? db`select id, digest_date::text as date, created_at from digests where digest_date = ${date}`
    : db`select id, digest_date::text as date, created_at from digests order by digest_date desc limit 1`)) as {
    id: number; date: string; created_at: string;
  }[];
  if (!digest) return null;

  const rows = (await db`
    select c.id, di.position, di.slot, c.title, coalesce(c.summary, '') as summary, c.url, s.name as source,
           c.language, c.format, c.topics, di.is_exploration, c.text_status, c.reading_minutes
    from digest_items di join contents c on c.id = di.content_id join sources s on s.id = c.source_id
    where di.digest_id = ${digest.id}
    order by di.position`) as {
    id: string; position: number; slot: Category; title: string; summary: string; url: string; source: string;
    language: string; format: string; topics: string[]; is_exploration: boolean;
    text_status: string; reading_minutes: number | null;
  }[];

  return {
    date: digest.date,
    generatedAt: new Date(digest.created_at).toISOString(),
    items: rows.map((r) => ({
      id: Number(r.id),
      position: r.position,
      category: r.slot,
      title: r.title,
      summary: r.summary,
      url: r.url,
      source: r.source,
      language: r.language,
      format: r.format,
      topics: r.topics,
      isExploration: r.is_exploration,
      hasText: r.text_status === "ok",
      textStatus: r.text_status,
      readingMinutes: r.reading_minutes,
    })),
  };
}
