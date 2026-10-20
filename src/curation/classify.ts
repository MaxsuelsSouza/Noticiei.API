import type { Category, RawItem, Source } from "../collect/types.js";

export interface Topic {
  slug: string;
  category: Exclude<Category, "aleatorio">;
  keywords: string[];
}

export type Format = "como-funciona" | "tutorial" | "novidade" | "opiniao" | "case-real" | "geral";

export interface Classification {
  category: Category;
  topics: string[];
  format: Format;
}

const TITLE_WEIGHT = 3;
const BODY_WEIGHT = 1;
const MIN_TOPIC_SCORE = 3;
/** Fontes de mundo/curiosidades só mudam de categoria com um sinal forte (evita "cloud" do clima virar tecnologia). */
const STRONG_TOPIC_SCORE = 6;

function keywordPattern(keyword: string): RegExp {
  const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  // \b não funciona com "c#" ou ".net"; a borda é "não ser letra ou número".
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
}

const patternCache = new Map<string, RegExp>();
function countMatches(text: string, keyword: string): number {
  let pattern = patternCache.get(keyword);
  if (!pattern) {
    pattern = keywordPattern(keyword);
    patternCache.set(keyword, pattern);
  }
  return text.match(pattern)?.length ?? 0;
}

export function scoreTopics(item: Pick<RawItem, "title" | "summary" | "tags">, topics: Topic[]): Map<string, number> {
  // Tags da fonte (subreddit, tag do dev.to) valem como título.
  const head = `${item.title} ${item.tags.join(" ")}`.toLowerCase();
  const body = item.summary.toLowerCase();
  const scores = new Map<string, number>();
  for (const topic of topics) {
    let score = 0;
    for (const keyword of topic.keywords) {
      score += countMatches(head, keyword) * TITLE_WEIGHT + Math.min(countMatches(body, keyword), 3) * BODY_WEIGHT;
    }
    if (score >= MIN_TOPIC_SCORE) scores.set(topic.slug, score);
  }
  return scores;
}

const FORMAT_SIGNALS: [Exclude<Format, "geral" | "novidade">, RegExp][] = [
  ["case-real", /\b(how we|lessons learned|postmortem|post-mortem|migrating|migrated|our journey)\b|como (n[oó]s|migramos)/i],
  ["como-funciona", /\b(how .+ works|under the hood|explained|deep dive|internals)\b|como funciona/i],
  ["tutorial", /\b(how to|step by step|step-by-step|guide|build an? |tutorial|getting started)\b|passo a passo|como (criar|fazer|usar)/i],
  ["opiniao", /\b(why i|stop |you should|unpopular opinion|considered harmful|i think)\b|opini[aã]o/i],
];
const NEWS_SIGNAL = /\b(announcing|announces|released|releases|what's new|now available|introducing|launch(es|ed)?)\b|lan[çc]a(mento)?|novidades/i;
const VERSION_NUMBER = /\bv?\d+\.\d+(\.\d+)?\b/;

export function detectFormat(item: Pick<RawItem, "title" | "tags">, source: Pick<Source, "is_official">): Format {
  const text = `${item.title} ${item.tags.join(" ")}`;
  for (const [format, pattern] of FORMAT_SIGNALS) {
    if (pattern.test(text)) return format;
  }
  if (NEWS_SIGNAL.test(text) || VERSION_NUMBER.test(item.title) || source.is_official) return "novidade";
  return "geral";
}

export function classify(
  item: Pick<RawItem, "title" | "summary" | "tags">,
  source: Pick<Source, "default_category" | "is_official">,
  topics: Topic[],
): Classification {
  const scores = scoreTopics(item, topics);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const bySlug = new Map(topics.map((t) => [t.slug, t]));

  let category: Category = source.default_category;
  const main = ranked[0];
  if (main) {
    const topic = bySlug.get(main[0])!;
    const sameAsSource = topic.category === source.default_category;
    if (source.default_category === "tecnologia" || sameAsSource || main[1] >= STRONG_TOPIC_SCORE) {
      category = topic.category;
    }
  }

  return {
    category,
    topics: ranked.slice(0, 4).map(([slug]) => slug),
    format: detectFormat(item, source),
  };
}
