import { migrate } from "../migrate.js";
import { withRun } from "../runs.js";
import { coletarEditais } from "./collect.js";

/** Rotina diária dos editais (cron próprio, separado das notícias para não disputar os 300 s da função). */
export async function runEditais({ job = "editais" } = {}) {
  return withRun(job, async () => {
    let migrationError: string | null = null;
    try {
      await migrate();
    } catch (error) {
      migrationError = (error as Error).message;
    }
    return { migrationError, ...(await coletarEditais()) };
  }, (r) => r);
}

/** Acompanhamento diário: favoritos, PDFs, edital anterior, lembretes e menções. */
export async function runAcompanhamento({ job = "editais-acompanhar" } = {}) {
  const { acompanhar } = await import("./acompanhar.js");
  return withRun(job, async () => {
    try {
      await migrate();
    } catch {
      // segue: a coleta registra o erro de migração
    }
    return acompanhar();
  }, (r) => r);
}
