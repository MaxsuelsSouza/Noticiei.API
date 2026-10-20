import type { Category } from "../collect/types.js";

export interface Candidate {
  id: number;
  category: Category;
  topics: string[];
  format: string;
  engagement: number;
  sourceType: string;
}

export interface Weights {
  topic: Map<string, number>;
  format: Map<string, number>;
}

export interface DigestOptions {
  quotas: Record<Category, number>;
  maxPerTopic: number;
  explorationSlots: number;
}

export interface Pick {
  id: number;
  slot: Category;
  isExploration: boolean;
}

export const DEFAULT_OPTIONS: DigestOptions = {
  quotas: { tecnologia: 4, curiosidades: 2, mundo: 1, aleatorio: 1 },
  maxPerTopic: 2,
  explorationSlots: 1,
};

const NEUTRAL_WEIGHT = 0.5;
const LOW_WEIGHT = 0.35;
const SLOT_ORDER: Category[] = ["tecnologia", "curiosidades", "mundo", "aleatorio"];

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

  const fits = (c: Candidate) => !used.has(c.id) && c.topics.every((t) => (topicCount.get(t) ?? 0) < options.maxPerTopic);
  const take = (c: Candidate, slot: Category, isExploration = false) => {
    picks.push({ id: c.id, slot, isExploration });
    used.add(c.id);
    for (const t of c.topics) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  };
  const drawAmongTop = (pool: Candidate[], top: number) => pool[Math.floor(random() * Math.min(top, pool.length))];

  const missing: number[] = [];
  for (const slot of SLOT_ORDER) {
    const quota = options.quotas[slot];
    let filled = 0;

    if (slot === "aleatorio") {
      // Aleatório: sorteio entre os mais engajados que sobraram, de qualquer categoria.
      while (filled < quota) {
        const pool = candidates.filter(fits).sort((a, b) => engagement(b) - engagement(a));
        const chosen = drawAmongTop(pool, 10);
        if (!chosen) break;
        take(chosen, slot);
        filled++;
      }
    } else {
      const exploration = slot === "tecnologia" ? Math.min(options.explorationSlots, quota) : 0;
      for (const c of byScore) {
        if (filled >= quota - exploration) break;
        if (c.category === slot && fits(c)) {
          take(c, slot);
          filled++;
        }
      }
      // Exploração: assunto de peso baixo ou nunca visto, sorteado entre os mais engajados.
      for (let i = 0; i < exploration; i++) {
        const pool = candidates
          .filter((c) => c.category === slot && fits(c))
          .filter((c) => c.topics.length === 0 || c.topics.some((t) => !weights.topic.has(t) || weights.topic.get(t)! < LOW_WEIGHT))
          .sort((a, b) => engagement(b) - engagement(a));
        const chosen = drawAmongTop(pool, 5) ?? byScore.find((c) => c.category === slot && fits(c));
        if (!chosen) break;
        take(chosen, slot, pool.length > 0);
        filled++;
      }
    }
    missing.push(quota - filled);
  }

  // Categoria sem itens suficientes: completa com tecnologia, depois com qualquer categoria (sem furar o teto por assunto).
  const shortfall = missing.reduce((s, v) => s + v, 0);
  const fallback = [...byScore.filter((c) => c.category === "tecnologia"), ...byScore.filter((c) => c.category !== "tecnologia")];
  for (let i = 0; i < shortfall; i++) {
    const chosen = fallback.find(fits);
    if (!chosen) break;
    take(chosen, chosen.category === "aleatorio" ? "tecnologia" : chosen.category);
  }

  return picks;
}
