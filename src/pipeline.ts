import { collectAll } from "./collect/collect.js";
import { buildDigest, discardStale } from "./digest/build.js";
import { expireOldTexts, extractPendingDigestItems } from "./extract/extract.js";
import { migrate } from "./migrate.js";
import { withRun } from "./runs.js";

/** Rotina diária: coleta, descarta o que ficou velho, monta o digest do dia e extrai o texto dos itens. */
export async function runDaily({ force = false, job = "daily" } = {}) {
  return withRun(job, () => run(force), (r) => ({
    migrations: r.migrations, migrationError: r.migrationError, digest: r.digest, elapsedMs: r.elapsedMs,
    sourcesFailed: r.sources.filter((s) => s.status !== "ok" && s.status !== "ignorada").map((s) => `${s.source}: ${s.status}`),
  }));
}

async function run(force: boolean) {
  const startedAt = Date.now();
  // Migração com problema não derruba a rotina: o digest sai com o que já existe e o erro fica registrado.
  let migrations: string[] = [];
  let migrationError: string | null = null;
  try {
    migrations = await migrate();
  } catch (error) {
    migrationError = (error as Error).message;
    console.error("migração falhou", error);
  }
  const sources = await collectAll({ force });
  const discarded = await discardStale();
  const expiredTexts = await expireOldTexts();
  const digest = await buildDigest({ force });
  const extracted = await extractPendingDigestItems();
  return { migrations, migrationError, digest, extracted, discarded, expiredTexts, sources, elapsedMs: Date.now() - startedAt };
}
