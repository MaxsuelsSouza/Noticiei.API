/**
 * Imita o `sql` do driver do Neon (tagged template, composição de trechos, transaction) sobre um Postgres
 * em memória (PGlite), para testar consultas de verdade sem banco externo.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Trecho {
  strings: readonly string[];
  values: unknown[];
}

const TRECHO = Symbol("trecho");

function montar(t: Trecho, params: unknown[]): string {
  let texto = "";
  t.strings.forEach((s, i) => {
    texto += s;
    if (i >= t.values.length) return;
    const v = t.values[i];
    if (v && typeof v === "object" && TRECHO in v) texto += montar((v as { [TRECHO]: Trecho })[TRECHO], params);
    else {
      params.push(v instanceof Date ? v.toISOString() : v);
      texto += `$${params.length}`;
    }
  });
  return texto;
}

export async function criarBanco(migracoes = join(process.cwd(), "db", "migrations")) {
  const db = new PGlite();
  for (const f of readdirSync(migracoes).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(migracoes, f), "utf8"));

  const executar = async (t: Trecho) => {
    const params: unknown[] = [];
    const texto = montar(t, params);
    const r = await db.query(texto, params);
    return r.rows;
  };

  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const trecho: Trecho = { strings, values };
      let promessa: Promise<unknown[]> | null = null;
      const rodar = () => (promessa ??= executar(trecho));
      return {
        [TRECHO]: trecho,
        then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => rodar().then(ok, erro),
        catch: (erro: (e: unknown) => unknown) => rodar().catch(erro),
      };
    },
    {
      transaction: async (lista: { [TRECHO]: Trecho }[]) => {
        await db.exec("begin");
        try {
          const resultados = [];
          for (const q of lista) resultados.push(await executar(q[TRECHO]));
          await db.exec("commit");
          return resultados;
        } catch (e) {
          await db.exec("rollback");
          throw e;
        }
      },
    },
  );
  return { db, sql };
}
