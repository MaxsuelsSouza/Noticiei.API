import { collectAll } from "./collect/collect.js";
import { buildDigest, discardStale } from "./digest/build.js";
import { expireOldTexts, extractPendingDigestItems } from "./extract/extract.js";
import { migrate } from "./migrate.js";

/** Rotina diária: coleta, descarta o que ficou velho, monta o digest do dia e extrai o texto dos itens. */
export async function runDaily({ force = false } = {}) {
  const startedAt = Date.now();
  const migrations = await migrate();
  const sources = await collectAll({ force });
  const discarded = await discardStale();
  const expiredTexts = await expireOldTexts();
  const digest = await buildDigest({ force });
  const extracted = await extractPendingDigestItems();
  return { migrations, digest, extracted, discarded, expiredTexts, sources, elapsedMs: Date.now() - startedAt };
}
