import { sql } from "../src/db.js";
import { isApp, json } from "../src/http.js";

export async function GET(request: Request) {
  if (!isApp(request)) return json({ ok: true });

  const db = sql();
  const [sources] = (await db`
    select count(*) filter (where active)::int as active,
           coalesce(json_agg(json_build_object('name', name, 'error', last_error)) filter (where not active), '[]') as disabled
    from sources`) as { active: number; disabled: { name: string; error: string | null }[] }[];
  const [last] = (await db`select digest_date::text as date, created_at from digests order by digest_date desc limit 1`) as {
    date: string; created_at: string;
  }[];
  return json({ ok: true, sources, lastDigest: last ?? null });
}
