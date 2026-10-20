// Aplica, em ordem, os arquivos de db/migrations que ainda não rodaram: npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "@neondatabase/serverless";
import { env } from "../src/env.js";
import "../src/db.js"; // aplica a configuração do banco local, se for o caso

const dir = new URL("../db/migrations/", import.meta.url);
const pool = new Pool({ connectionString: env.databaseUrl });

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
      await client.query(await readFile(new URL(file, dir), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`aplicada: ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`falhou em ${file}: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }
  console.log("migrações em dia");
} finally {
  await pool.end();
}
