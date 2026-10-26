import { CATEGORIES, type Category } from "../collect/types.js";

export interface Candidate {
  id: number;
  category: Category;
  topics: string[];
  format: string;
  engagement: number;
  sourceType: string;
  /** Fonte do item (para não encher uma seção com a mesma fonte). */
  sourceId?: number;
  /** Blog acompanhado (seção "Para acompanhar"). */
  followKey?: string | null;
  /** Data de publicação em ms (para "o mais recente" do blog). */
  publishedAt?: number | null;
}

export interface Weights {
  topic: Map<string, number>;
  format: Map<string, number>;
}

export interface DigestOptions {
  /** "acompanhar" não tem cota: entra um artigo de cada blog acompanhado. */
  quotas: Record<Exclude<Category, "acompanhar">, number>;
  maxPerTopic: number;
  /** Itens da mesma fonte numa seção. */
  maxPerSource: number;
  explorationSlots: number;
}

export interface Pick {
  id: number;
  slot: Category;
  isExploration: boolean;
}

export const DEFAULT_OPTIONS: DigestOptions = {
  // Tecnologia: o que é novo para quem programa; hackernews: segurança; curiosidades: "como funciona" e ciência;
  // mundo: tecnologias que estão mudando algo; aleatório: curiosidades do mundo sem tecnologia.
  quotas: { tecnologia: 4, hackernews: 4, curiosidades: 3, mundo: 4, aleatorio: 4 },
  maxPerTopic: 2,
  maxPerSource: 2,
  explorationSlots: 1,
};

const NEUTRAL_WEIGHT = 0.5;
const LOW_WEIGHT = 0.35;

const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

function topicWeight(c: Candidate, weights: Weights): number {
  return c.topics.length === 0 ? NEUTRAL_WEIGHT : avg(c.topics.map((t) => weights.topic.get(t) ?? NEUTRAL_WEIGHT));
}

/** Engajamento normalizado (escala log) dentro do mesmo tipo de fonte, para HN e RSS serem comparáveis. */
function engagementNormalizer(candidates: Candidate[]): (c: Candidate) => number {
  const maxByType = new Map<string, number>();
  for (const c of candidates) maxByType.set(c.sourceType, Math.max(maxByType.get(c.sourceType) ?? 0, c.engagement));
  return (c) => {
    const max = maxByType.get(c.sourceType) ?? 0;
    return max > 0 ? Math.log1p(c.engagement) / Math.log1p(max) : 0;
  };
}

/**
 * "Para acompanhar": um artigo por blog. Vale o post mais recente ainda não entregue; sem novidade,
 * o mais popular do blog (fonte "popular", pontuação no Hacker News) que ainda não entrou num resumo.
 */
export function pickFollowed(candidates: Candidate[]): Candidate[] {
  const byBlog = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (c.category !== "acompanhar" || !c.followKey) continue;
    byBlog.set(c.followKey, [...(byBlog.get(c.followKey) ?? []), c]);
  }
  return [...byBlog.keys()].sort().flatMap((key) => {
    const items = byBlog.get(key)!;
    const fresh = items.filter((c) => c.sourceType !== "popular").sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
    const popular = items.filter((c) => c.sourceType === "popular").sort((a, b) => b.engagement - a.engagement);
    const chosen = fresh[0] ?? popular[0];
    return chosen ? [chosen] : [];
  });
}

/**
 * Monta o digest: pontua, preenche as cotas por categoria respeitando o teto por assunto,
 * reserva vagas de exploração e completa com tecnologia quando falta item numa categoria.
 */
export function selectDigest(
  candidates: Candidate[],
  weights: Weights,
  options: DigestOptions = DEFAULT_OPTIONS,
  random: () => number = Math.random,
): Pick[] {
  const engagement = engagementNormalizer(candidates);
  const score = new Map(
    candidates.map((c) => [
      c.id,
      topicWeight(c, weights) * 0.6 + (weights.format.get(c.format) ?? NEUTRAL_WEIGHT) * 0.3 + engagement(c) * 0.1,
    ]),
  );
  const byScore = [...candidates].sort((a, b) => score.get(b.id)! - score.get(a.id)!);

  const picks: Pick[] = [];
  const used = new Set<number>();
  const topicCount = new Map<string, number>();

  const sourceCount = new Map<string, number>();
  const sourceKey = (c: Candidate) => (c.sourceId === undefined ? null : `${c.category}|${c.sourceId}`);
  const fits = (c: Candidate) => {
    const key = sourceKey(c);
    return (
      !used.has(c.id) &&
      c.topics.every((t) => (topicCount.get(t) ?? 0) < options.maxPerTopic) &&
      (key === null || (sourceCount.get(key) ?? 0) < options.maxPerSource)
    );
  };
  const take = (c: Candidate, slot: Category, isExploration = false) => {
    picks.push({ id: c.id, slot, isExploration });
    used.add(c.id);
    for (const t of c.topics) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
    const key = sourceKey(c);
    if (key !== null) sourceCount.set(key, (sourceCount.get(key) ?? 0) + 1);
  };
  // Tecnologia precisa de assunto de tecnologia: notícia geral da capa do HN não entra só por vir de fonte técnica.
  const belongs = (c: Candidate, slot: Category) => c.category === slot && (slot !== "tecnologia" || c.topics.length > 0);
  const drawAmongTop = (pool: Candidate[], top: number) => pool[Math.floor(random() * Math.min(top, pool.length))];

  // Os blogs acompanhados não disputam o teto por assunto com as outras seções.
  for (const c of pickFollowed(candidates)) {
    picks.push({ id: c.id, slot: "acompanhar", isExploration: false });
    used.add(c.id);
  }

  const missing: number[] = [];
  for (const slot of CATEGORIES) {
    if (slot === "acompanhar") continue;
    const quota = options.quotas[slot];
    let filled = 0;

    if (slot === "aleatorio") {
      // Aleatório: sorteio entre os mais engajados das fontes de notícias inusitadas.
      while (filled < quota) {
        const pool = candidates.filter((c) => c.category === "aleatorio" && fits(c)).sort((a, b) => engagement(b) - engagement(a));
        const chosen = drawAmongTop(pool, 10);
        if (!chosen) break;
        take(chosen, slot);
        filled++;
      }
    } else {
      const exploration = slot === "tecnologia" ? Math.min(options.explorationSlots, quota) : 0;
      for (const c of byScore) {
        if (filled >= quota - exploration) break;
        if (belongs(c, slot) && fits(c)) {
          take(c, slot);
          filled++;
        }
      }
      // Exploração: assunto de peso baixo ou nunca visto, sorteado entre os mais engajados.
      for (let i = 0; i < exploration; i++) {
        const pool = candidates
          .filter((c) => belongs(c, slot) && fits(c))
          // Sem assunto nenhum não é exploração, é item fora do tema (ex.: notícia geral na capa do HN).
          .filter((c) => c.topics.some((t) => !weights.topic.has(t) || weights.topic.get(t)! < LOW_WEIGHT))
          .sort((a, b) => engagement(b) - engagement(a));
        const chosen = drawAmongTop(pool, 5) ?? byScore.find((c) => belongs(c, slot) && fits(c));
        if (!chosen) break;
        take(chosen, slot, pool.length > 0);
        filled++;
      }
    }
    missing.push(quota - filled);
  }

  // Categoria sem itens suficientes: completa com tecnologia, depois com qualquer categoria (sem furar o teto por assunto).
  // Blog acompanhado e aleatório não completam outras seções: cada um só aparece na sua.
  const shortfall = missing.reduce((s, v) => s + v, 0);
  const others = byScore.filter((c) => c.category !== "acompanhar" && c.category !== "aleatorio" && belongs(c, c.category));
  const fallback = [...others.filter((c) => c.category === "tecnologia"), ...others.filter((c) => c.category !== "tecnologia")];
  for (let i = 0; i < shortfall; i++) {
    const chosen = fallback.find(fits);
    if (!chosen) break;
    take(chosen, chosen.category);
  }

  return picks;
}
