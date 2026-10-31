/**
 * Roda a carga dos editais durante o build da Vercel (lá tem DATABASE_URL e internet). Só em produção e só no dia
 * em DIA; em qualquer outro build não faz nada. Nunca falha o build: erro vira log.
 */
import { localDate } from "../src/time.js";

const DIA = "2026-10-31";

if (process.env.VERCEL_ENV !== "production" || localDate() !== DIA || !process.env.DATABASE_URL) {
  console.log(`[carga] ignorada (VERCEL_ENV=${process.env.VERCEL_ENV}, dia=${localDate()}, banco=${Boolean(process.env.DATABASE_URL)})`);
} else {
  try {
    const { runAcompanhamento, runEditais } = await import("../src/editais/run.js");
    for (const job of ["editais-build-1", "editais-build-2"]) {
      const r = (await runEditais({ job })) as { concursosNovos: number; concursosAtualizados: number; materiasAbertas: number; sites: unknown[] };
      console.log(`[carga] ${job}: ${r.materiasAbertas} matérias abertas, ${r.concursosNovos} concursos novos, ${r.concursosAtualizados} atualizados`);
      console.log(`[carga] sites: ${JSON.stringify(r.sites)}`);
    }
    const a = await runAcompanhamento({ job: "editais-acompanhar-build" });
    console.log(`[carga] acompanhamento: ${JSON.stringify(a)}`);
  } catch (error) {
    console.error("[carga] falhou (o deploy segue):", error);
  }
}
process.exit(0);
