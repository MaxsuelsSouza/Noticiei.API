import { sql } from "../db.js";
import { RobotsChecker } from "../collect/robots.js";
import { CATEGORIES, type Category } from "../collect/types.js";
import { extractMany } from "../extract/extract.js";
import { localDate } from "../time.js";
import { DEFAULT_OPTIONS, selectDigest, type Candidate, type Pick, type Weights } from "./select.js";

const CANDIDATE_WINDOW_DAYS = 3;
/** Rodadas de "seleciona → extrai o texto → troca quem falhou". */
const MAX_ROUNDS = 10;
const EXTRACT_CONCURRENCY = 10;
/** Tempo para extrair os textos (a função da Vercel tem 300 s no total, com Fluid Compute, e a coleta vem antes). */
const EXTRACT_BUDGET_MS = 90_000;

/** Sorteio repetível (mulberry32): a mesma data sorteia igual em todas as rodadas, então só muda quem falhou. */
function seededRandom(seed: string): () => number {
  let state = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/**
 * Monta o digest do dia, uma vez só. Com force, desfaz o digest do dia e monta de novo.
 * Só entra item com o texto extraído: quem não deu para ler no app é trocado pelo próximo candidato.
 */
export async function buildDigest({ date = localDate(), force = false, budgetMs = EXTRACT_BUDGET_MS } = {}): Promise<BuildResult> {
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

  // Os blogs acompanhados não têm janela: o mais popular de um blog pode ter sido coletado há semanas.
  const rows = (await db`
      select c.id, c.source_id, c.category, c.topics, c.format, c.engagement, c.url, c.language, c.text_status,
             extract(epoch from c.published_at) * 1000 as published_ms,
             s.type as source_type, to_jsonb(s) ->> 'follow_key' as follow_key
      from contents c join sources s on s.id = c.source_id
      where c.status = 'classificado'
        and c.text_status in ('pendente', 'ok')
        and (c.collected_at > now() - make_interval(days => ${CANDIDATE_WINDOW_DAYS}) or c.category = 'acompanhar')`) as {
    id: string; source_id: string; category: Category; topics: string[]; format: string; engagement: number; url: string; language: string;
    text_status: string; published_ms: string | null; source_type: string; follow_key: string | null;
  }[];

  if (rows.length === 0) return { date, status: "sem-conteudo", items: 0 };

  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const textStatus = new Map(rows.map((r) => [Number(r.id), r.text_status]));
  let pool = rows.map<Candidate>((r) => ({
    id: Number(r.id), sourceId: Number(r.source_id), category: r.category, topics: r.topics, format: r.format, engagement: r.engagement,
    sourceType: r.source_type, followKey: r.follow_key, publishedAt: r.published_ms === null ? null : Number(r.published_ms),
  }));

  const weights = await loadWeights();
  const robots = new RobotsChecker();
  const deadline = Date.now() + budgetMs;
  let picks: Pick[] = [];
  for (let round = 0; ; round++) {
    picks = selectDigest(pool, weights, DEFAULT_OPTIONS, seededRandom(date));
    const pending = picks.filter((p) => textStatus.get(p.id) === "pendente").map((p) => byId.get(p.id)!);
    if (pending.length === 0 || round >= MAX_ROUNDS || Date.now() >= deadline) break;
    for (const r of await extractMany(pending, { concurrency: EXTRACT_CONCURRENCY, robots, deadline })) textStatus.set(r.id, r.status);
    pool = pool.filter((c) => textStatus.get(c.id) === "ok" || textStatus.get(c.id) === "pendente");
  }
  // O que falhou ou não deu tempo de extrair fica de fora.
  picks = picks
    .filter((p) => textStatus.get(p.id) === "ok")
    .sort((a, b) => CATEGORIES.indexOf(a.slot) - CATEGORIES.indexOf(b.slot));
  if (picks.length === 0) return { date, status: "sem-conteudo", items: 0 };

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

/**
 * Conteúdo velho que nunca entrou num digest é descartado, para o banco gratuito não crescer à toa.
 * Os populares dos blogs acompanhados ficam: são a reserva para quando o blog não publica nada.
 */
export async function discardStale(days = 7): Promise<number> {
  const rows = (await sql()`
    update contents set status = 'descartado'
    where status = 'classificado' and collected_at < now() - make_interval(days => ${days})
      and source_id not in (select id from sources where type = 'popular')
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
