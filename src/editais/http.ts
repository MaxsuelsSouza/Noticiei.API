import { migrate } from "../migrate.js";

/** Tabelas e colunas vêm das migrações, que rodam com a rotina; se o app chegar antes, aplica na hora. */
export async function comTabelas<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    // 42P01: tabela não existe; 42703: coluna não existe (migração nova ainda não rodou).
    if (!["42P01", "42703"].includes((error as { code?: string }).code ?? "")) throw error;
    await migrate();
    return run();
  }
}
