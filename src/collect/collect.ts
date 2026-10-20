import { sql } from "../db.js";
import { classify, type Topic } from "../curation/classify.js";
import { detectLanguage } from "../curation/language.js";
import { canonicalUrl, titleHash } from "../text.js";
import { fetchSource, SkippedSource } from "./fetchers.js";
import { RobotsChecker } from "./robots.js";
import type { Source } from "./types.js";

const MAX_CONSECUTIVE_FAILURES = 5;
const CONCURRENCY = 6;
/** Itens publicados há mais tempo que isso não são novidade. */
const MAX_ITEM_AGE_DAYS = 7;

export interface SourceReport {
  source: string;
  status: "ok" | "falhou" | "ignorada" | "bloqueada-robots" | "desativada";
  fetched?: number;
  inserted?: number;
  error?: string;
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function pairs(topics: string[]): [string, string][] {
  const sorted = [...new Set(topics)].sort();
  const result: [string, string][] = [];
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) result.push([sorted[i]!, sorted[j]!]);
  return result;
}

async function collectOne(source: Source, topics: Topic[], robots: RobotsChecker): Promise<SourceReport> {
  const db = sql();
  try {
    // robots.txt vale para feeds da web; Reddit, dev.to e HN são APIs oficiais com termos próprios.
    if (source.type === "rss" && !(await robots.allows(source.address))) {
      await db`update sources set last_error = 'bloqueada pelo robots.txt', last_collected_at = now() where id = ${source.id}`;
      return { source: source.name, status: "bloqueada-robots" };
    }

    const raw = await fetchSource(source);
    const oldest = Date.now() - MAX_ITEM_AGE_DAYS * 86_400_000;
    const rows = raw.flatMap((item) => {
      if (item.publishedAt && item.publishedAt.getTime() < oldest) return [];
      let canonical: string;
      try {
        canonical = canonicalUrl(item.url);
      } catch {
        return [];
      }
      const result = classify(item, source, topics);
      return [{
        url: item.url,
        canonical,
        title: item.title,
        hash: titleHash(item.title),
        summary: item.summary,
        language: detectLanguage(`${item.title}. ${item.summary}`, source.language),
        published_at: item.publishedAt?.toISOString() ?? null,
        engagement: item.engagement,
        ...result,
      }];
    });

    let inserted: { topics: string[] }[] = [];
    if (rows.length > 0) {
      // Duplicados (mesma URL canônica ou mesmo título) são descartados pelos índices únicos.
      inserted = (await db`
        insert into contents (source_id, url, url_canonical, title, title_hash, summary, language, published_at,
                              engagement, category, topics, format)
        select ${source.id}, r.url, r.canonical, r.title, r.hash, r.summary, r.language, r.published_at::timestamptz,
               r.engagement, r.category, array(select jsonb_array_elements_text(r.topics)), r.format
        from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
          url text, canonical text, title text, hash text, summary text, language text, published_at text,
          engagement int, category text, topics jsonb, format text)
        on conflict do nothing
        returning topics`) as { topics: string[] }[];
    }

    // Reforça as ligações entre assuntos que aparecem juntos.
    const links = new Map<string, number>();
    for (const row of inserted) for (const [a, b] of pairs(row.topics)) links.set(`${a}|${b}`, (links.get(`${a}|${b}`) ?? 0) + 1);
    if (links.size > 0) {
      const entries = [...links].map(([key, count]) => ({ a: key.split("|")[0], b: key.split("|")[1], count }));
      await db`
        insert into topic_links (topic_a, topic_b, cooccurrences)
        select e.a, e.b, e.count from jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) as e(a text, b text, count int)
        on conflict (topic_a, topic_b) do update set cooccurrences = topic_links.cooccurrences + excluded.cooccurrences`;
    }

    await db`update sources set last_collected_at = now(), consecutive_failures = 0, last_error = null where id = ${source.id}`;
    return { source: source.name, status: "ok", fetched: raw.length, inserted: inserted.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SkippedSource) return { source: source.name, status: "ignorada", error: message };

    const [row] = (await db`
      update sources
      set consecutive_failures = consecutive_failures + 1,
          last_error = ${message},
          active = consecutive_failures + 1 < ${MAX_CONSECUTIVE_FAILURES}
      where id = ${source.id}
      returning active`) as { active: boolean }[];
    return { source: source.name, status: row?.active === false ? "desativada" : "falhou", error: message };
  }
}

/** Coleta todas as fontes ativas cujo intervalo de coleta já passou (ou todas, com force). */
export async function collectAll({ force = false } = {}): Promise<SourceReport[]> {
  const db = sql();
  const sources = (await db`
    select id, name, type, address, default_category, language, is_official
    from sources
    where active
      and (${force} or last_collected_at is null
           or last_collected_at < now() - make_interval(hours => collect_interval_hours) + interval '1 hour')
    order by id`) as Source[];
  const topics = (await db`select slug, category, keywords from topics`) as Topic[];
  const robots = new RobotsChecker();
  return mapLimited(sources, CONCURRENCY, (source) => collectOne(source, topics, robots));
}
