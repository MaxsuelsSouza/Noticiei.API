import { migrate } from "../migrate.js";

/** As tabelas vêm da migração 013, que roda com a rotina; se o app chegar antes, aplica na hora. */
export async function comTabelas<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
    await migrate();
    return run();
  }
}
