import { sql } from "./db.js";

/**
 * Registro de cada execução da rotina (cron diário, rodada extra, refresh do app).
 * A linha é gravada ANTES de começar, então uma execução morta por tempo limite fica visível como "sem fim".
 * A tabela é criada aqui mesmo (não depende de migração), porque é ela que ajuda a diagnosticar migração falhando.
 */
async function ensureTable() {
  await sql()`
    create table if not exists job_runs (
      id          bigserial primary key,
      job         text not null,
      started_at  timestamptz not null default now(),
      finished_at timestamptz,
      ok          boolean,
      error       text,
      summary     jsonb
    )`;
}

export async function withRun<T>(job: string, fn: () => Promise<T>, summarize: (result: T) => unknown = () => null): Promise<T> {
  await ensureTable();
  const [row] = (await sql()`insert into job_runs (job) values (${job}) returning id`) as { id: string }[];
  try {
    const result = await fn();
    await sql()`update job_runs set finished_at = now(), ok = true, summary = ${JSON.stringify(summarize(result))}::jsonb where id = ${row!.id}`;
    return result;
  } catch (error) {
    const message = String((error as Error)?.stack ?? error).slice(0, 2000);
    await sql()`update job_runs set finished_at = now(), ok = false, error = ${message} where id = ${row!.id}`;
    throw error;
  }
}

export async function lastRun() {
  await ensureTable();
  const [row] = (await sql()`
    select job, started_at, finished_at, ok, left(error, 300) as error, summary
    from job_runs order by id desc limit 1`) as Record<string, unknown>[];
  return row ?? null;
}
