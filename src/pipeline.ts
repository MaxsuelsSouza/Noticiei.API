import { collectAll } from "./collect/collect.js";
import { buildDigest, discardStale } from "./digest/build.js";

/** Rotina diária: coleta, descarta o que ficou velho e monta o digest do dia. */
export async function runDaily({ force = false } = {}) {
  const startedAt = Date.now();
  const sources = await collectAll({ force });
  const discarded = await discardStale();
  const digest = await buildDigest({ force });
  return { digest, discarded, sources, elapsedMs: Date.now() - startedAt };
}
