import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { env } from "./env.js";
import "./db.js"; // aplica a configuração do banco local, se for o caso

/**
 * Aplica, em ordem, os arquivos de db/migrations que ainda não rodaram e devolve os nomes aplicados.
 * Idempotente: roda no início de cada rotina diária, então deploy e migração nunca ficam fora de ordem.
 * Na Vercel os .sql vão junto com a função (includeFiles no vercel.json) e o diretório atual é a raiz do projeto.
 */
export async function migrate(dir = join(process.cwd(), "db", "migrations")): Promise<string[]> {
  const pool = new Pool({ connectionString: env.databaseUrl });
  const done: string[] = [];
  try {
    await pool.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const { rows } = await pool.query<{ name: string }>("select name from schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const client = await pool.connect();
      try {
        await client.query("begin");
        // Trava para duas execuções simultâneas (cron + refresh) não aplicarem a mesma migração.
        await client.query("select pg_advisory_xact_lock(724001)");
        const { rowCount } = await client.query("select 1 from schema_migrations where name = $1", [file]);
        if (rowCount) {
          await client.query("rollback");
          continue;
        }
        await client.query(await readFile(join(dir, file), "utf8"));
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        done.push(file);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`falhou em ${file}: ${(error as Error).message}`);
      } finally {
        client.release();
      }
    }
    return done;
  } finally {
    await pool.end();
  }
}
